import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardManager, guardAdmin, logApiError, apiBadRequest, apiNotFound } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: poId } = await params
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { action } = body
    if (!action || !['approve', 'receive', 'cancel'].includes(action)) return apiBadRequest('Invalid action')
    if (action === 'approve' || action === 'receive') { const [, e] = await guardAdmin(request); if (e) return e }
    const po = await db.purchaseOrder.findFirst({ where: { id: poId, ownerId: user.ownerId } })
    if (!po) return apiNotFound('PO not found')
    if (action === 'approve' && po.status !== 'draft') return apiBadRequest('Must be draft')
    if (action === 'receive' && po.status !== 'approved') return apiBadRequest('Must be approved')
    if (action === 'cancel' && po.status === 'received') return apiBadRequest('Cannot cancel received')

    if (action === 'approve') {
      const updated = await db.purchaseOrder.update({ where: { id: poId }, data: { status: 'approved', approvedAt: new Date(), approvedById: user.id } })
      await logUserActivity(user, { action: 'UPDATE', entityType: 'purchase', entityId: poId, summary: `PO ${po.poNumber} approved` })
      return NextResponse.json(updated)
    }
    if (action === 'cancel') {
      const updated = await db.purchaseOrder.update({ where: { id: poId }, data: { status: 'cancelled', cancelledAt: new Date() } })
      return NextResponse.json(updated)
    }
    // receive
    const lineItems = JSON.parse(po.lineItems) as Array<{ partId: string; quantity: number; unitCost: number; totalCost: number; batchNumber?: string; expiryDate?: string }>
    await db.$transaction(async (tx) => {
      for (const line of lineItems) {
        const part = await tx.sparePart.findUnique({ where: { id: line.partId }, select: { id: true, currentStock: true } })
        if (!part) throw new Error(`PART_NOT_FOUND:${line.partId}`)
        const prev = part.currentStock; const ns = prev + line.quantity
        await tx.sparePart.update({ where: { id: line.partId }, data: { currentStock: ns } })
        const purchase = await tx.purchase.create({ data: { ownerId: po.ownerId, shopId: po.shopId, partId: line.partId, quantity: line.quantity, unitCost: line.unitCost, totalCost: line.totalCost, supplierName: 'Linked', invoiceNumber: po.poNumber, date: new Date(), supplierId: po.supplierId || null } })
        if (line.batchNumber || line.expiryDate) { await tx.batch.create({ data: { ownerId: po.ownerId, partId: line.partId, batchNumber: line.batchNumber || '', quantity: line.quantity, expiryDate: line.expiryDate ? new Date(line.expiryDate) : null, unitCost: line.unitCost, supplierId: po.supplierId || null, purchaseOrderId: po.id } }) }
        await tx.stockLog.create({ data: { ownerId: po.ownerId, shopId: po.shopId, partId: line.partId, type: 'PURCHASE', quantity: line.quantity, previousStock: prev, newStock: ns, referenceId: purchase.id, notes: `Received via PO ${po.poNumber}` } })
      }
      await tx.purchaseOrder.update({ where: { id: poId }, data: { status: 'received', receivedAt: new Date(), receivedById: user.id } })
    })
    await logUserActivity(user, { action: 'UPDATE', entityType: 'purchase', entityId: poId, summary: `PO ${po.poNumber} received` })
    return NextResponse.json({ success: true, poNumber: po.poNumber, received: true })
  } catch (error) { logApiError('purchase-orders/[id]/PATCH', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
