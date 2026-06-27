import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardManager, logApiError, apiBadRequest, apiNotFound } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

/**
 * PATCH /api/stock-transfers/[id]
 * Body: { action: 'ship' | 'receive' | 'cancel' }
 *
 * On 'ship':
 *   - source part.currentStock -= quantity
 *   - status = 'shipped', shippedAt = now
 *
 * On 'receive':
 *   - Look up the part at destination shop (by partNumber)
 *   - If exists: increment its currentStock
 *   - If not: create a new SparePart at destination shop (copy from source)
 *   - Link toPartId on the transfer record
 *   - status = 'received', receivedAt = now
 *   - Create StockLog entries at both shops
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: transferId } = await params
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { action } = body as { action?: string }
    if (!action || !['ship', 'receive', 'cancel'].includes(action)) {
      return apiBadRequest('Invalid action. Use ship, receive, or cancel.')
    }

    const transfer = await db.stockTransfer.findFirst({
      where: { id: transferId, ownerId: user.ownerId },
      include: { part: true, fromShop: true, toShop: true },
    })
    if (!transfer) return apiNotFound('Stock transfer not found')

    // State validation
    if (action === 'ship' && transfer.status !== 'pending') {
      return apiBadRequest(`Transfer must be 'pending' to ship (current: ${transfer.status})`)
    }
    if (action === 'receive' && transfer.status !== 'shipped') {
      return apiBadRequest(`Transfer must be 'shipped' to receive (current: ${transfer.status})`)
    }
    if (action === 'cancel' && transfer.status === 'received') {
      return apiBadRequest('Cannot cancel a received transfer')
    }

    // ─── Action: ship ────────────────────────────────────────────────────
    if (action === 'ship') {
      await db.$transaction(async (tx) => {
        const part = await tx.sparePart.findUnique({
          where: { id: transfer.partId },
          select: { currentStock: true },
        })
        if (!part) throw new Error('PART_NOT_FOUND')
        if (part.currentStock < transfer.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${part.currentStock}`)
        }
        const previousStock = part.currentStock
        const newStock = previousStock - transfer.quantity
        await tx.sparePart.update({
          where: { id: transfer.partId },
          data: { currentStock: newStock },
        })
        await tx.stockLog.create({
          data: {
            ownerId: user.ownerId,
            shopId: transfer.fromShopId,
            partId: transfer.partId,
            type: 'TRANSFER_OUT',
            quantity: transfer.quantity,
            previousStock,
            newStock,
            referenceId: transfer.id,
            notes: `Shipped to ${transfer.toShop?.name} via ${transfer.transferNumber}`,
          },
        })
        await tx.stockTransfer.update({
          where: { id: transferId },
          data: { status: 'shipped', shippedAt: new Date() },
        })
      })
      await logUserActivity(user, {
        action: 'UPDATE',
        entityType: 'part',
        entityId: transferId,
        summary: `Transfer ${transfer.transferNumber} shipped`,
        metadata: { transferId, transferNumber: transfer.transferNumber },
      })
      return NextResponse.json({ success: true, status: 'shipped' })
    }

    // ─── Action: receive ─────────────────────────────────────────────────
    if (action === 'receive') {
      await db.$transaction(async (tx) => {
        // Find the part at destination shop (by partNumber + ownerId + shopId)
        const sourcePart = await tx.sparePart.findUnique({
          where: { id: transfer.partId },
        })
        if (!sourcePart) throw new Error('PART_NOT_FOUND')

        let destPart = await tx.sparePart.findFirst({
          where: {
            ownerId: user.ownerId,
            shopId: transfer.toShopId,
            partNumber: sourcePart.partNumber,
          },
        })

        // If part doesn't exist at destination, create it (copy details from source)
        if (!destPart) {
          destPart = await tx.sparePart.create({
            data: {
              ownerId: user.ownerId,
              shopId: transfer.toShopId,
              partNumber: sourcePart.partNumber,
              name: sourcePart.name,
              category: sourcePart.category,
              brand: sourcePart.brand,
              vehicleModel: sourcePart.vehicleModel,
              description: sourcePart.description,
              costPrice: sourcePart.costPrice,
              sellingPrice: sourcePart.sellingPrice,
              currentStock: 0,   // Will be incremented below
              minStockLevel: sourcePart.minStockLevel,
              location: '',
              currency: sourcePart.currency,
              barcode: sourcePart.barcode,
            },
          })
        }

        const previousStock = destPart.currentStock
        const newStock = previousStock + transfer.quantity

        await tx.sparePart.update({
          where: { id: destPart.id },
          data: { currentStock: newStock },
        })

        await tx.stockLog.create({
          data: {
            ownerId: user.ownerId,
            shopId: transfer.toShopId,
            partId: destPart.id,
            type: 'TRANSFER_IN',
            quantity: transfer.quantity,
            previousStock,
            newStock,
            referenceId: transfer.id,
            notes: `Received from ${transfer.fromShop?.name} via ${transfer.transferNumber}`,
          },
        })

        await tx.stockTransfer.update({
          where: { id: transferId },
          data: {
            status: 'received',
            receivedAt: new Date(),
            toPartId: destPart.id,
          },
        })
      })
      await logUserActivity(user, {
        action: 'UPDATE',
        entityType: 'part',
        entityId: transferId,
        summary: `Transfer ${transfer.transferNumber} received`,
        metadata: { transferId, transferNumber: transfer.transferNumber },
      })
      return NextResponse.json({ success: true, status: 'received' })
    }

    // ─── Action: cancel ──────────────────────────────────────────────────
    await db.stockTransfer.update({
      where: { id: transferId },
      data: { status: 'cancelled' },
    })
    await logUserActivity(user, {
      action: 'UPDATE',
      entityType: 'part',
      entityId: transferId,
      summary: `Transfer ${transfer.transferNumber} cancelled`,
      metadata: { transferId, transferNumber: transfer.transferNumber },
    })
    return NextResponse.json({ success: true, status: 'cancelled' })
  } catch (error) {
    logApiError('stock-transfers/[id]/PATCH', error)
    return NextResponse.json({ error: 'Failed to update stock transfer' }, { status: 500 })
  }
}
