import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardManager, logApiError, apiBadRequest, apiNotFound } from '@/lib/api-utils'
import {
  startStockCount, getStockCountWithItems, updateCountedQty,
  finalizeStockCount, cancelStockCount,
} from '@/lib/stock-count'
import { logUserActivity } from '@/lib/activity'

/**
 * /api/stock-count — physical stocktaking workflow.
 *
 * GET /api/stock-count?status=<status>
 *   List stock counts for the owner.
 *
 * POST /api/stock-count
 *   Start a new count. Body: { shopId?, notes? }
 *   Snapshots all parts' current_stock → StockCountItem.expectedQty.
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const status = request.nextUrl.searchParams.get('status')
    const where: Record<string, unknown> = { ownerId: user.ownerId }
    if (status) where.status = status

    const counts = await db.stockCount.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return NextResponse.json({ counts, total: counts.length })
  } catch (error) {
    logApiError('stock-count/GET', error)
    return NextResponse.json({ error: 'Failed to fetch stock counts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { shopId, notes } = body as { shopId?: string; notes?: string }

    const sc = await startStockCount(user.ownerId, shopId || null, user.id, notes || '')

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'system',
      entityId: sc.id,
      summary: `Stock count ${sc.countNumber} started — ${sc.totalItems} items`,
      metadata: { stockCountId: sc.id, countNumber: sc.countNumber },
    })

    return NextResponse.json(sc, { status: 201 })
  } catch (error) {
    logApiError('stock-count/POST', error)
    return NextResponse.json({ error: 'Failed to start stock count' }, { status: 500 })
  }
}
