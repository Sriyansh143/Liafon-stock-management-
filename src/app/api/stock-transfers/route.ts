import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardManager, logApiError } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const status = request.nextUrl.searchParams.get('status')
    const where: Record<string, unknown> = { ownerId: user.ownerId }
    if (status) where.status = status
    const transfers = await db.stockTransfer.findMany({ where, include: { fromShop: { select: { name: true } }, toShop: { select: { name: true } }, part: { select: { name: true, partNumber: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
    return NextResponse.json({ transfers, total: transfers.length })
  } catch (error) { logApiError('stock-transfers/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { fromShopId, toShopId, partId, quantity, notes } = body
    if (!fromShopId || !toShopId || !partId || !quantity) return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    if (fromShopId === toShopId) return NextResponse.json({ error: 'Shops must differ' }, { status: 400 })
    const [fromShop, toShop, part] = await Promise.all([db.shop.findFirst({ where: { id: fromShopId, ownerId: user.ownerId } }), db.shop.findFirst({ where: { id: toShopId, ownerId: user.ownerId } }), db.sparePart.findFirst({ where: { id: partId, ownerId: user.ownerId, shopId: fromShopId } })])
    if (!fromShop || !toShop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
    if (!part) return NextResponse.json({ error: 'Part not found' }, { status: 404 })
    if (part.currentStock < quantity) return NextResponse.json({ error: `Insufficient stock: ${part.currentStock}` }, { status: 400 })
    const today = new Date(); const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const startOfToday = new Date(today); startOfToday.setHours(0, 0, 0, 0)
    const tToday = await db.stockTransfer.count({ where: { createdAt: { gte: startOfToday } } })
    const transferNumber = `TR-${dateStr}-${String(tToday + 1).padStart(5, '0')}`
    const transfer = await db.stockTransfer.create({ data: { ownerId: user.ownerId, transferNumber, fromShopId, toShopId, partId, quantity, status: 'pending', notes: notes || '' } })
    await logUserActivity(user, { action: 'CREATE', entityType: 'part', entityId: transfer.id, summary: `Transfer ${transferNumber}: ${quantity} × ${part.name}`, metadata: { transferId: transfer.id, transferNumber } })
    return NextResponse.json(transfer, { status: 201 })
  } catch (error) { logApiError('stock-transfers/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
