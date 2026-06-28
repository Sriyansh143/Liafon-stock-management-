import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardManager, logApiError, apiBadRequest, apiNotFound } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: transferId } = await params
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { action } = body
    if (!action || !['ship', 'receive', 'cancel'].includes(action)) return apiBadRequest('Invalid action')
    const transfer = await db.stockTransfer.findFirst({ where: { id: transferId, ownerId: user.ownerId }, include: { part: true, fromShop: true, toShop: true } })
    if (!transfer) return apiNotFound('Transfer not found')
    if (action === 'ship' && transfer.status !== 'pending') return apiBadRequest('Must be pending')
    if (action === 'receive' && transfer.status !== 'shipped') return apiBadRequest('Must be shipped')
    if (action === 'cancel' && transfer.status === 'received') return apiBadRequest('Cannot cancel received')

    if (action === 'ship') {
      await db.$transaction(async (tx) => {
        const part = await tx.sparePart.findUnique({ where: { id: transfer.partId }, select: { currentStock: true } })
        if (!part) throw new Error('PART_NOT_FOUND')
        if (part.currentStock < transfer.quantity) throw new Error(`INSUFFICIENT:${part.currentStock}`)
        const prev = part.currentStock; const ns = prev - transfer.quantity
        await tx.sparePart.update({ where: { id: transfer.partId }, data: { currentStock: ns } })
        await tx.stockLog.create({ data: { ownerId: user.ownerId, shopId: transfer.fromShopId, partId: transfer.partId, type: 'TRANSFER_OUT', quantity: transfer.quantity, previousStock: prev, newStock: ns, referenceId: transfer.id, notes: `Shipped to ${transfer.toShop?.name}` } })
        await tx.stockTransfer.update({ where: { id: transferId }, data: { status: 'shipped', shippedAt: new Date() } })
      })
      return NextResponse.json({ success: true, status: 'shipped' })
    }
    if (action === 'receive') {
      await db.$transaction(async (tx) => {
        const sourcePart = await tx.sparePart.findUnique({ where: { id: transfer.partId } })
        if (!sourcePart) throw new Error('PART_NOT_FOUND')
        let destPart = await tx.sparePart.findFirst({ where: { ownerId: user.ownerId, shopId: transfer.toShopId, partNumber: sourcePart.partNumber } })
        if (!destPart) { destPart = await tx.sparePart.create({ data: { ownerId: user.ownerId, shopId: transfer.toShopId, partNumber: sourcePart.partNumber, name: sourcePart.name, category: sourcePart.category, brand: sourcePart.brand, vehicleModel: sourcePart.vehicleModel, description: sourcePart.description, costPrice: sourcePart.costPrice, sellingPrice: sourcePart.sellingPrice, currentStock: 0, minStockLevel: sourcePart.minStockLevel, currency: sourcePart.currency, barcode: sourcePart.barcode } }) }
        const prev = destPart.currentStock; const ns = prev + transfer.quantity
        await tx.sparePart.update({ where: { id: destPart.id }, data: { currentStock: ns } })
        await tx.stockLog.create({ data: { ownerId: user.ownerId, shopId: transfer.toShopId, partId: destPart.id, type: 'TRANSFER_IN', quantity: transfer.quantity, previousStock: prev, newStock: ns, referenceId: transfer.id, notes: `Received from ${transfer.fromShop?.name}` } })
        await tx.stockTransfer.update({ where: { id: transferId }, data: { status: 'received', receivedAt: new Date(), toPartId: destPart.id } })
      })
      return NextResponse.json({ success: true, status: 'received' })
    }
    await db.stockTransfer.update({ where: { id: transferId }, data: { status: 'cancelled' } })
    return NextResponse.json({ success: true, status: 'cancelled' })
  } catch (error) { logApiError('stock-transfers/[id]/PATCH', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
