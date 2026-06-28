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
    const pos = await db.purchaseOrder.findMany({ where, include: { supplier: { select: { name: true, phone: true } }, shop: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
    return NextResponse.json({ purchaseOrders: pos, total: pos.length })
  } catch (error) { logApiError('purchase-orders/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { shopId, supplierId, lineItems, notes } = body
    if (!Array.isArray(lineItems) || lineItems.length === 0) return NextResponse.json({ error: 'At least one line item' }, { status: 400 })
    const today = new Date(); const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const startOfToday = new Date(today); startOfToday.setHours(0, 0, 0, 0)
    const posToday = await db.purchaseOrder.count({ where: { createdAt: { gte: startOfToday } } })
    const poNumber = `PO-${dateStr}-${String(posToday + 1).padStart(5, '0')}`
    const totalAmount = lineItems.reduce((s: number, l: { totalCost?: number }) => s + (l.totalCost || 0), 0)
    const po = await db.purchaseOrder.create({ data: { ownerId: user.ownerId, shopId: shopId || null, supplierId: supplierId || null, poNumber, status: 'draft', totalAmount, currency: 'INR', notes: notes || '', lineItems: JSON.stringify(lineItems) } })
    await logUserActivity(user, { action: 'CREATE', entityType: 'purchase', entityId: po.id, summary: `PO created: ${poNumber}`, metadata: { poId: po.id, poNumber, totalAmount } })
    return NextResponse.json(po, { status: 201 })
  } catch (error) { logApiError('purchase-orders/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
