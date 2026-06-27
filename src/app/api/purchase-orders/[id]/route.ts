import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardManager, guardAdmin, logApiError, apiNotFound, apiBadRequest } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

/**
 * PATCH /api/purchase-orders/[id]
 *
 * Body: { action: 'approve' | 'receive' | 'cancel' }
 *
 * Lifecycle:
 *   draft → approve   (admin only)
 *   approved → receive (admin only — creates Purchase records + Batches + increments stock)
 *   draft/approved → cancel (manager+)
 *
 * Receiving a PO is the most complex operation:
 *   1. For each line: increment part.currentStock by line.quantity
 *   2. Create a Purchase record (for the historical ledger)
 *   3. Create a Batch record (if batchNumber or expiryDate provided)
 *   4. Create a StockLog entry
 *   5. Update PO: status='received', receivedAt=now, receivedById=user.id
 *   All in a single transaction.
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: poId } = await params
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { action } = body as { action?: string }
    if (!action || !['approve', 'receive', 'cancel'].includes(action)) {
      return apiBadRequest('Invalid action. Use approve, receive, or cancel.')
    }

    // Approve requires admin
    if (action === 'approve') {
      const [adminUser, adminErr] = await guardAdmin(request)
      if (adminErr || !adminUser) return adminErr ?? NextResponse.json({ error: 'Admin access required to approve POs' }, { status: 403 })
    }

    // Receive requires admin
    if (action === 'receive') {
      const [adminUser, adminErr] = await guardAdmin(request)
      if (adminErr || !adminUser) return adminErr ?? NextResponse.json({ error: 'Admin access required to receive POs' }, { status: 403 })
    }

    // Fetch the PO
    const po = await db.purchaseOrder.findFirst({
      where: { id: poId, ownerId: user.ownerId },
    })
    if (!po) return apiNotFound('Purchase order not found')

    // ─── State machine validation ────────────────────────────────────────
    if (action === 'approve' && po.status !== 'draft') {
      return apiBadRequest(`PO must be in 'draft' status to approve (current: ${po.status})`)
    }
    if (action === 'receive' && po.status !== 'approved') {
      return apiBadRequest(`PO must be in 'approved' status to receive (current: ${po.status})`)
    }
    if (action === 'cancel' && po.status === 'received') {
      return apiBadRequest('Cannot cancel a received PO')
    }

    const lineItems = JSON.parse(po.lineItems) as Array<{
      partId: string
      partNumber?: string
      name?: string
      quantity: number
      unitCost: number
      totalCost: number
      batchNumber?: string
      expiryDate?: string
    }>

    // ─── Action: approve ────────────────────────────────────────────────
    if (action === 'approve') {
      const updated = await db.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: 'approved',
          approvedAt: new Date(),
          approvedById: user.id,
        },
      })
      await logUserActivity(user, {
        action: 'UPDATE',
        entityType: 'purchase',
        entityId: poId,
        summary: `PO ${po.poNumber} approved`,
        metadata: { poId, poNumber: po.poNumber },
      })
      return NextResponse.json(updated)
    }

    // ─── Action: cancel ─────────────────────────────────────────────────
    if (action === 'cancel') {
      const updated = await db.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      })
      await logUserActivity(user, {
        action: 'UPDATE',
        entityType: 'purchase',
        entityId: poId,
        summary: `PO ${po.poNumber} cancelled`,
        metadata: { poId, poNumber: po.poNumber },
      })
      return NextResponse.json(updated)
    }

    // ─── Action: receive (the complex one) ──────────────────────────────
    // Atomic: increment stock + create Purchase records + create Batches + log
    await db.$transaction(async (tx) => {
      for (const line of lineItems) {
        // 1. Fetch current part (within tx for atomicity)
        const part = await tx.sparePart.findUnique({
          where: { id: line.partId },
          select: { id: true, currentStock: true, partNumber: true, name: true },
        })
        if (!part) {
          throw new Error(`PART_NOT_FOUND:${line.partId}`)
        }

        const previousStock = part.currentStock
        const newStock = previousStock + line.quantity

        // 2. Increment stock
        await tx.sparePart.update({
          where: { id: line.partId },
          data: { currentStock: newStock },
        })

        // 3. Create Purchase record (for the historical ledger)
        const purchase = await tx.purchase.create({
          data: {
            ownerId: po.ownerId,
            shopId: po.shopId,
            partId: line.partId,
            quantity: line.quantity,
            unitCost: line.unitCost,
            totalCost: line.totalCost,
            supplierName: po.supplierId ? 'Linked supplier' : 'Unknown',
            invoiceNumber: po.poNumber,
            date: new Date(),
            supplierId: po.supplierId || null,
          },
        })

        // 4. Create Batch (with batch number + expiry if provided)
        if (line.batchNumber || line.expiryDate) {
          await tx.batch.create({
            data: {
              ownerId: po.ownerId,
              partId: line.partId,
              batchNumber: line.batchNumber || '',
              quantity: line.quantity,
              expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
              unitCost: line.unitCost,
              supplierId: po.supplierId || null,
              purchaseOrderId: po.id,
            },
          })
        }

        // 5. Create StockLog entry
        await tx.stockLog.create({
          data: {
            ownerId: po.ownerId,
            shopId: po.shopId,
            partId: line.partId,
            type: 'PURCHASE',
            quantity: line.quantity,
            previousStock,
            newStock,
            referenceId: purchase.id,
            notes: `Received via PO ${po.poNumber}`,
          },
        })
      }

      // 6. Mark PO as received
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: 'received',
          receivedAt: new Date(),
          receivedById: user.id,
        },
      })
    })

    await logUserActivity(user, {
      action: 'UPDATE',
      entityType: 'purchase',
      entityId: poId,
      summary: `PO ${po.poNumber} received — ${lineItems.length} lines, ₹${po.totalAmount.toFixed(2)}`,
      metadata: { poId, poNumber: po.poNumber, lineItemCount: lineItems.length },
    })

    return NextResponse.json({ success: true, poNumber: po.poNumber, received: true })
  } catch (error) {
    logApiError('purchase-orders/[id]/PATCH', error)
    return NextResponse.json({ error: 'Failed to update purchase order' }, { status: 500 })
  }
}
