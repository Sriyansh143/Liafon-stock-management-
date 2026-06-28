import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError } from '@/lib/api-utils'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/inventory-snapshot?preset=current|week|month|custom&date=YYYY-MM-DD
 *
 * Returns the inventory as it looked at a specific point in time.
 * Computed by walking backwards through StockLog entries from the
 * current stock level.
 *
 * Presets:
 *   - current  → today's inventory (same as /api/parts but with valuation)
 *   - week     → 7 days ago
 *   - month    → 30 days ago
 *   - custom   → use ?date=YYYY-MM-DD
 *
 * Response shape:
 *   {
 *     snapshotDate: string (ISO),
 *     preset: string,
 *     parts: [{ ...part, snapshotStock, currentStock, stockChange }],
 *     summary: { totalParts, totalUnits, costValue, retailValue, potentialProfit }
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const preset = searchParams.get('preset') || 'current'
    const customDate = searchParams.get('date')

    // Resolve the snapshot date
    let snapshotDate: Date
    let endDate: Date

    if (preset === 'current') {
      snapshotDate = new Date()
      endDate = new Date()
    } else if (preset === 'week') {
      snapshotDate = new Date()
      snapshotDate.setDate(snapshotDate.getDate() - 7)
      snapshotDate.setHours(23, 59, 59, 999)
      endDate = new Date()
    } else if (preset === 'month') {
      snapshotDate = new Date()
      snapshotDate.setDate(snapshotDate.getDate() - 30)
      snapshotDate.setHours(23, 59, 59, 999)
      endDate = new Date()
    } else if (preset === 'custom') {
      const customStart = searchParams.get('startDate') || searchParams.get('date')
      const customEnd = searchParams.get('endDate')
      if (!customStart) {
        return NextResponse.json(
          { error: 'Custom preset requires ?startDate=YYYY-MM-DD' },
          { status: 400 }
        )
      }
      snapshotDate = new Date(customStart)
      snapshotDate.setHours(23, 59, 59, 999)
      if (isNaN(snapshotDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid start date format. Use YYYY-MM-DD.' },
          { status: 400 }
        )
      }
      // If endDate is provided, use it; otherwise endDate = now
      if (customEnd) {
        endDate = new Date(customEnd)
        endDate.setHours(23, 59, 59, 999)
        if (isNaN(endDate.getTime())) {
          return NextResponse.json(
            { error: 'Invalid end date format. Use YYYY-MM-DD.' },
            { status: 400 }
          )
        }
        if (snapshotDate > endDate) {
          return NextResponse.json(
            { error: 'Start date must be before or equal to end date.' },
            { status: 400 }
          )
        }
      } else {
        endDate = new Date()
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid preset. Use current, week, month, or custom.' },
        { status: 400 }
      )
    }

    // Fetch all active parts with their current stock
    const parts = await db.sparePart.findMany({
      where: { ownerId: user?.ownerId || "", isActive: true },
      select: {
        id: true,
        partNumber: true,
        name: true,
        category: true,
        brand: true,
        vehicleModel: true,
        costPrice: true,
        sellingPrice: true,
        currentStock: true,
        minStockLevel: true,
        location: true,
        currency: true,
      },
      orderBy: { name: 'asc' },
    })

    if (parts.length === 0) {
      return NextResponse.json({
        snapshotDate: snapshotDate.toISOString(),
        preset,
        parts: [],
        summary: {
          totalParts: 0,
          totalUnits: 0,
          costValue: 0,
          retailValue: 0,
          potentialProfit: 0,
        },
      })
    }

    // For historical snapshots, fetch all stock logs AFTER the snapshot
    // date for each part, then reverse them to get the snapshot stock.
    //
    // Logic: currentStock = snapshotStock + (all changes since snapshot)
    // So:    snapshotStock = currentStock - (all changes since snapshot)
    //
    // Each StockLog has:
    //   - type: SALE (stock went down) → reverse: ADD quantity back
    //   - type: PURCHASE (stock went up) → reverse: SUBTRACT quantity
    //   - type: ADJUSTMENT → reverse: SUBTRACT (newStock - previousStock)
    //
    // We use previousStock and newStock to compute the delta directly:
    //   delta = newStock - previousStock
    //   snapshotStock = currentStock - sum(all deltas after snapshot)

    const partIds = parts.map((p) => p.id)

    // Fetch all stock logs after the snapshot date
    const logsAfterSnapshot = await db.stockLog.findMany({
      where: {
        partId: { in: partIds },
        createdAt: { gt: snapshotDate },
      },
      select: {
        partId: true,
        type: true,
        quantity: true,
        previousStock: true,
        newStock: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Group deltas by partId
    const deltasByPart = new Map<string, number>()
    for (const log of logsAfterSnapshot) {
      const delta = log.newStock - log.previousStock
      deltasByPart.set(log.partId, (deltasByPart.get(log.partId) || 0) + delta)
    }

    // Compute snapshot stock for each part
    const snapshotParts = parts.map((part) => {
      const delta = deltasByPart.get(part.id) || 0
      const snapshotStock = Math.max(0, part.currentStock - delta)
      return {
        ...part,
        snapshotStock,
        currentStock: part.currentStock,
        stockChange: part.currentStock - snapshotStock, // positive = grew since snapshot
      }
    })

    // Compute summary using snapshot stock (not current stock)
    let totalUnits = 0
    let costValue = 0
    let retailValue = 0
    for (const p of snapshotParts) {
      totalUnits += p.snapshotStock
      costValue += p.costPrice * p.snapshotStock
      retailValue += p.sellingPrice * p.snapshotStock
    }

    return NextResponse.json({
      snapshotDate: snapshotDate.toISOString(),
      preset,
      parts: snapshotParts,
      summary: {
        totalParts: snapshotParts.length,
        totalUnits,
        costValue,
        retailValue,
        potentialProfit: retailValue - costValue,
      },
    })
  } catch (error) {
    logApiError('inventory-snapshot/GET', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory snapshot' },
      { status: 500 }
    )
  }
}
