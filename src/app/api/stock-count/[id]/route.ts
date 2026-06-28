import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardManager, logApiError, apiBadRequest, apiNotFound } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const sc = await db.stockCount.findFirst({ where: { id, ownerId: user.ownerId }, include: { items: { include: { part: { select: { id: true, partNumber: true, name: true, category: true, brand: true, currentStock: true, location: true } } }, orderBy: { part: { partNumber: 'asc' } } } } })
    if (!sc) return apiNotFound('Not found')
    return NextResponse.json(sc)
  } catch (error) { logApiError('stock-count/[id]/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { action } = body
    if (!action || !['update_item', 'finalize', 'cancel'].includes(action)) return apiBadRequest('Invalid action')

    if (action === 'update_item') {
      const { itemId, countedQty, notes } = body
      if (!itemId) return apiBadRequest('itemId required')
      const sc = await db.stockCount.findFirst({ where: { id, ownerId: user.ownerId }, select: { status: true } })
      if (!sc) return apiNotFound('Not found')
      if (sc.status !== 'in_progress') return NextResponse.json({ error: 'Not in progress' }, { status: 400 })
      await db.stockCountItem.update({ where: { id: itemId }, data: { countedQty, notes: notes || undefined, countedAt: new Date() } })
      return NextResponse.json({ success: true })
    }
    if (action === 'finalize') {
      const sc = await db.stockCount.findFirst({ where: { id, ownerId: user.ownerId }, include: { items: { include: { part: true } } } })
      if (!sc) return apiNotFound('Not found')
      if (sc.status !== 'in_progress') return NextResponse.json({ error: 'Not in progress' }, { status: 400 })
      let matched = 0, variance = 0, adjustments = 0
      await db.$transaction(async (tx) => {
        for (const item of sc.items) {
          if (item.countedQty === null) continue
          const v = item.countedQty - item.expectedQty
          await tx.stockCountItem.update({ where: { id: item.id }, data: { variance: v } })
          if (v === 0) matched++
          else { variance++; adjustments++; const prev = item.part.currentStock; await tx.sparePart.update({ where: { id: item.partId }, data: { currentStock: item.countedQty } }); await tx.stockLog.create({ data: { ownerId: user.ownerId, shopId: sc.shopId || null, partId: item.partId, type: 'ADJUSTMENT', quantity: v, previousStock: prev, newStock: item.countedQty, referenceId: sc.id, notes: `Stock count ${sc.countNumber}` } }) }
        }
        await tx.stockCount.update({ where: { id }, data: { status: 'finalized', finalizedAt: new Date(), finalizedById: user.id, matchedItems: matched, varianceItems: variance } })
      })
      return NextResponse.json({ success: true, totalItems: sc.items.length, matchedItems: matched, varianceItems: variance, adjustmentsPosted: adjustments })
    }
    if (action === 'cancel') {
      const sc = await db.stockCount.findFirst({ where: { id, ownerId: user.ownerId }, select: { status: true } })
      if (!sc) return apiNotFound('Not found')
      if (sc.status === 'finalized') return NextResponse.json({ error: 'Cannot cancel finalized' }, { status: 400 })
      await db.stockCount.update({ where: { id }, data: { status: 'cancelled' } })
      return NextResponse.json({ success: true })
    }
    return apiBadRequest('Unknown action')
  } catch (error) { logApiError('stock-count/[id]/PATCH', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
