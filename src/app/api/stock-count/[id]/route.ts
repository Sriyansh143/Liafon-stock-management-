import { NextRequest, NextResponse } from 'next/server'
import { guardManager, logApiError, apiBadRequest, apiNotFound } from '@/lib/api-utils'
import {
  getStockCountWithItems, updateCountedQty, finalizeStockCount, cancelStockCount,
} from '@/lib/stock-count'
import { logUserActivity } from '@/lib/activity'

/**
 * /api/stock-count/[id]
 *
 * GET    /api/stock-count/[id]                — get count + all items (for the count sheet UI)
 * PATCH  /api/stock-count/[id]                — update item counted qty OR finalize OR cancel
 *   Body: { action: 'update_item', itemId, countedQty, notes? }
 *         { action: 'finalize' }
 *         { action: 'cancel' }
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const sc = await getStockCountWithItems(user.ownerId, id)
    if (!sc) return apiNotFound('Stock count not found')

    return NextResponse.json(sc)
  } catch (error) {
    logApiError('stock-count/[id]/GET', error)
    return NextResponse.json({ error: 'Failed to fetch stock count' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { action } = body as { action?: string }
    if (!action || !['update_item', 'finalize', 'cancel'].includes(action)) {
      return apiBadRequest('Invalid action. Use update_item, finalize, or cancel.')
    }

    if (action === 'update_item') {
      const { itemId, countedQty, notes } = body as { itemId?: string; countedQty?: number; notes?: string }
      if (!itemId) return apiBadRequest('itemId is required')
      if (typeof countedQty !== 'number' || countedQty < 0) return apiBadRequest('countedQty must be a non-negative number')

      await updateCountedQty(user.ownerId, id, itemId, countedQty, notes)
      return NextResponse.json({ success: true })
    }

    if (action === 'finalize') {
      const result = await finalizeStockCount(user.ownerId, id, user.id)
      await logUserActivity(user, {
        action: 'UPDATE',
        entityType: 'system',
        entityId: id,
        summary: `Stock count finalized — ${result.matchedItems} matched, ${result.varianceItems} variance, ${result.adjustmentsPosted} adjustments posted`,
        metadata: { stockCountId: id, ...result },
      })
      return NextResponse.json({ success: true, ...result })
    }

    if (action === 'cancel') {
      await cancelStockCount(user.ownerId, id)
      await logUserActivity(user, {
        action: 'UPDATE',
        entityType: 'system',
        entityId: id,
        summary: 'Stock count cancelled',
      })
      return NextResponse.json({ success: true })
    }

    return apiBadRequest('Unknown action')
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'STOCK_COUNT_NOT_FOUND') {
        return apiNotFound('Stock count not found')
      }
      if (error.message === 'COUNT_NOT_IN_PROGRESS') {
        return NextResponse.json({ error: 'Stock count is not in progress' }, { status: 400 })
      }
      if (error.message === 'CANNOT_CANCEL_FINALIZED') {
        return NextResponse.json({ error: 'Cannot cancel a finalized stock count' }, { status: 400 })
      }
    }
    logApiError('stock-count/[id]/PATCH', error)
    return NextResponse.json({ error: 'Failed to update stock count' }, { status: 500 })
  }
}
