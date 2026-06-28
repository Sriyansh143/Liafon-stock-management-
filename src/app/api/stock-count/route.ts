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
    const counts = await db.stockCount.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
    return NextResponse.json({ counts, total: counts.length })
  } catch (error) { logApiError('stock-count/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const { shopId, notes } = body
    const today = new Date(); const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const startOfToday = new Date(today); startOfToday.setHours(0, 0, 0, 0)
    const countsToday = await db.stockCount.count({ where: { createdAt: { gte: startOfToday } } })
    const countNumber = `SC-${dateStr}-${String(countsToday + 1).padStart(5, '0')}`
    const parts = await db.sparePart.findMany({ where: { ownerId: user.ownerId, isActive: true, ...(shopId ? { shopId } : {}) }, select: { id: true, currentStock: true } })
    const sc = await db.$transaction(async (tx) => {
      const sc = await tx.stockCount.create({ data: { ownerId: user.ownerId, shopId: shopId || null, countNumber, status: 'in_progress', notes: notes || '', totalItems: parts.length, matchedItems: 0, varianceItems: 0 } })
      if (parts.length > 0) await tx.stockCountItem.createMany({ data: parts.map(p => ({ stockCountId: sc.id, partId: p.id, expectedQty: p.currentStock, countedQty: null, variance: 0 })) })
      return sc
    })
    await logUserActivity(user, { action: 'CREATE', entityType: 'system', entityId: sc.id, summary: `Stock count ${sc.countNumber} started — ${sc.totalItems} items` })
    return NextResponse.json(sc, { status: 201 })
  } catch (error) { logApiError('stock-count/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
