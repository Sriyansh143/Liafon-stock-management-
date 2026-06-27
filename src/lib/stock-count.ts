/**
 * Physical stock count (stocktaking) helpers.
 *
 * Flow:
 *   1. Owner starts a count → SC-YYYYMMDD-00001
 *   2. System snapshots all parts' current_stock → StockCountItem.expectedQty
 *   3. User counts each part, enters countedQty
 *   4. On "finalize":
 *      - For each item: variance = countedQty - expectedQty
 *      - If variance ≠ 0: post a stock adjustment (StockLog) on the part
 *      - Update part.currentStock to the counted value
 *      - Mark StockCount.status = 'finalized', set finalizedAt + finalizedById
 *
 * This eliminates manual reconciliation — the system does the math + posts
 * the adjustments atomically.
 */

import { db } from '@/lib/db'

export type StockCountStatus = 'draft' | 'in_progress' | 'finalized' | 'cancelled'

/**
 * Start a new stock count.
 * Snapshots all parts' current_stock into StockCountItem rows.
 */
export async function startStockCount(
  ownerId: string,
  shopId: string | null,
  userId: string,
  notes: string = ''
) {
  // Generate count number
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const startOfToday = new Date(today)
  startOfToday.setHours(0, 0, 0, 0)
  const countsToday = await db.stockCount.count({
    where: { createdAt: { gte: startOfToday } },
  })
  const countNumber = `SC-${dateStr}-${String(countsToday + 1).padStart(5, '0')}`

  // Snapshot all parts for the owner (optionally filtered by shop)
  const parts = await db.sparePart.findMany({
    where: { ownerId, isActive: true, ...(shopId ? { shopId } : {}) },
    select: { id: true, currentStock: true },
  })

  return db.$transaction(async (tx) => {
    const sc = await tx.stockCount.create({
      data: {
        ownerId,
        shopId: shopId || null,
        countNumber,
        status: 'in_progress',
        notes,
        totalItems: parts.length,
        matchedItems: 0,
        varianceItems: 0,
      },
    })

    // Bulk-insert all items (expectedQty = current_stock snapshot)
    if (parts.length > 0) {
      await tx.stockCountItem.createMany({
        data: parts.map((p) => ({
          stockCountId: sc.id,
          partId: p.id,
          expectedQty: p.currentStock,
          countedQty: null,   // not yet counted
          variance: 0,
        })),
      })
    }

    return sc
  })
}

/**
 * Get a stock count with all items (for the UI).
 */
export async function getStockCountWithItems(
  ownerId: string,
  countId: string
) {
  return db.stockCount.findFirst({
    where: { id: countId, ownerId },
    include: {
      items: {
        include: {
          part: {
            select: {
              id: true, partNumber: true, name: true,
              category: true, brand: true, currentStock: true, location: true,
            },
          },
        },
        orderBy: { part: { partNumber: 'asc' } },
      },
    },
  })
}

/**
 * Update a single item's counted quantity.
 */
export async function updateCountedQty(
  ownerId: string,
  countId: string,
  itemId: string,
  countedQty: number,
  notes?: string
): Promise<void> {
  // Verify ownership
  const sc = await db.stockCount.findFirst({
    where: { id: countId, ownerId },
    select: { id: true, status: true },
  })
  if (!sc) throw new Error('STOCK_COUNT_NOT_FOUND')
  if (sc.status !== 'in_progress') {
    throw new Error('COUNT_NOT_IN_PROGRESS')
  }

  await db.stockCountItem.update({
    where: { id: itemId },
    data: {
      countedQty,
      notes: notes || undefined,
      countedAt: new Date(),
    },
  })
}

/**
 * Finalize a stock count.
 *
 * For each item with a counted quantity:
 *   - Compute variance = countedQty - expectedQty
 *   - If variance ≠ 0:
 *       - Update part.currentStock = countedQty
 *       - Create a StockLog entry (type='ADJUSTMENT', reason='Stock count SC-...')
 *   - If variance = 0: matchedItems++
 *   - If variance ≠ 0: varianceItems++
 *
 * Atomic: all in one transaction. If any item fails, the whole finalize fails.
 */
export async function finalizeStockCount(
  ownerId: string,
  countId: string,
  userId: string
): Promise<{
  totalItems: number
  matchedItems: number
  varianceItems: number
  adjustmentsPosted: number
}> {
  // Verify ownership + status
  const sc = await db.stockCount.findFirst({
    where: { id: countId, ownerId },
    include: { items: { include: { part: true } } },
  })
  if (!sc) throw new Error('STOCK_COUNT_NOT_FOUND')
  if (sc.status !== 'in_progress') {
    throw new Error('COUNT_NOT_IN_PROGRESS')
  }

  let matched = 0
  let variance = 0
  let adjustmentsPosted = 0

  await db.$transaction(async (tx) => {
    for (const item of sc.items) {
      // Skip items that weren't counted
      if (item.countedQty === null) continue

      const v = item.countedQty - item.expectedQty
      await tx.stockCountItem.update({
        where: { id: item.id },
        data: { variance: v },
      })

      if (v === 0) {
        matched++
      } else {
        variance++
        adjustmentsPosted++
        // Update part stock
        const previousStock = item.part.currentStock
        await tx.sparePart.update({
          where: { id: item.partId },
          data: { currentStock: item.countedQty },
        })
        // Create stock log
        await tx.stockLog.create({
          data: {
            ownerId,
            shopId: sc.shopId || null,
            partId: item.partId,
            type: 'ADJUSTMENT',
            quantity: v,
            previousStock,
            newStock: item.countedQty,
            referenceId: sc.id,
            notes: `Stock count ${sc.countNumber} — ${v > 0 ? '+' : ''}${v} adjustment`,
          },
        })
      }
    }

    // Mark the count as finalized
    await tx.stockCount.update({
      where: { id: countId },
      data: {
        status: 'finalized',
        finalizedAt: new Date(),
        finalizedById: userId,
        matchedItems: matched,
        varianceItems: variance,
      },
    })
  })

  return {
    totalItems: sc.items.length,
    matchedItems: matched,
    varianceItems: variance,
    adjustmentsPosted,
  }
}

/**
 * Cancel a stock count (only if not finalized).
 */
export async function cancelStockCount(
  ownerId: string,
  countId: string
): Promise<void> {
  const sc = await db.stockCount.findFirst({
    where: { id: countId, ownerId },
    select: { id: true, status: true },
  })
  if (!sc) throw new Error('STOCK_COUNT_NOT_FOUND')
  if (sc.status === 'finalized') {
    throw new Error('CANNOT_CANCEL_FINALIZED')
  }

  await db.stockCount.update({
    where: { id: countId },
    data: { status: 'cancelled' },
  })
}
