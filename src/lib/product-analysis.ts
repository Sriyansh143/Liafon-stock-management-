/**
 * Product analysis for restock decision-making.
 *
 * ─── The problem this solves ────────────────────────────────────────────────
 * "Low stock" alerts that just say "Part X is below min level" are dumb.
 * They don't tell the owner:
 *   - Is this part actually selling? (dead stock shouldn't be restocked)
 *   - How fast is it selling? (need restock urgency)
 *   - How profitable is it? (low-margin dead stock = double loss)
 *   - When did we last restock? (long time + still in stock = slow mover)
 *
 * This module computes, per part:
 *   - Sales velocity (units/day over last 30/90 days)
 *   - Days of stock left (current_stock / velocity)
 *   - Last sale date + last restock date
 *   - Profit margin (sellingPrice - costPrice) / sellingPrice
 *   - Restock recommendation: 'restock_now' | 'monitor' | 'discontinue' | 'no_action'
 *
 * ─── Restock decision matrix ───────────────────────────────────────────────
 *
 *   Sales velocity   | Stock left   | Profit margin | Recommendation
 *   ─────────────────┼──────────────┼───────────────┼──────────────────
 *   High (>1/day)    | <7 days      | Any           | restock_now (urgent)
 *   High (>1/day)    | 7-30 days    | Any           | restock_now (soon)
 *   Medium (0.1-1/d) | <14 days     | >10%          | restock_now
 *   Medium (0.1-1/d) | <14 days     | <10%          | monitor (low margin)
 *   Low (<0.1/day)   | Any          | Any           | monitor (slow mover)
 *   Zero (0 sales)   | >90 days     | Any           | discontinue (dead stock)
 *   Zero + stock>0   | <30 days     | Any           | monitor (new product)
 *
 * ─── Multi-shop support ────────────────────────────────────────────────────
 * When `shopId` is provided, analysis is per-shop.
 * When `shopId='all'` (or null), analysis is unified across all shops —
 * the API returns per-shop breakdown + a unified summary.
 */

import { db } from '@/lib/db'

// ─── Types ──────────────────────────────────────────────────────────────────

export type RestockRecommendation =
  | 'restock_now'        // Below min stock AND selling well — order today
  | 'restock_soon'       // Below min stock OR low days left — order this week
  | 'monitor'            // Low sales OR low margin — wait and watch
  | 'discontinue'        // No sales in 90+ days — consider delisting
  | 'no_action'          // Healthy stock + sales — leave alone
  | 'new_product'        // Created <30 days ago — too early to judge

export interface ProductAnalysis {
  partId: string
  partNumber: string
  name: string
  category: string
  brand: string
  shopId: string | null
  shopName: string | null

  // Stock state
  currentStock: number
  minStockLevel: number
  isLowStock: boolean
  stockValue: number          // currentStock × costPrice
  retailValue: number         // currentStock × sellingPrice

  // Sales metrics
  salesLast30Days: number
  salesLast90Days: number
  salesVelocityPerDay: number   // 90-day average
  lastSaleDate: Date | null
  lastSaleDaysAgo: number | null    // Days since last sale (null = never sold)
  daysOfStockLeft: number | null    // currentStock / velocity (null = no sales to estimate)

  // Restock history
  lastRestockDate: Date | null
  lastRestockDaysAgo: number | null
  lastRestockQuantity: number

  // Profitability
  costPrice: number
  sellingPrice: number
  profitPerUnit: number
  profitMarginPercent: number   // (selling - cost) / selling × 100
  totalPotentialProfit: number  // currentStock × profitPerUnit

  // Time in inventory
  daysSinceCreated: number

  // ─── The recommendation ──────────────────────────────────────────────
  recommendation: RestockRecommendation
  /** Human-readable explanation of why this recommendation was made. */
  recommendationReason: string
  /** Suggested restock quantity (based on 30-day sales velocity × 30 days). */
  suggestedRestockQuantity: number
  /** Priority: 1 (urgent) → 5 (lowest). */
  priority: 1 | 2 | 3 | 4 | 5
}

export interface AnalysisReport {
  /** Per-part analysis (sorted by priority, then by daysOfStockLeft ascending). */
  parts: ProductAnalysis[]
  /** Summary stats across all parts. */
  summary: {
    totalParts: number
    lowStockCount: number
    restockNowCount: number
    restockSoonCount: number
    monitorCount: number
    discontinueCount: number
    newProductCount: number
    noActionCount: number
    totalStockValue: number
    totalRetailValue: number
    totalPotentialProfit: number
    /** Total value of dead stock (discontinue + zero sales in 90d). */
    deadStockValue: number
  }
  /** Filter used for this report. */
  filter: {
    ownerId: string
    shopId: string | null     // null = all shops
    onlyLowStock: boolean
  }
  /** When `shopId=null`, per-shop breakdown of the same summary stats. */
  perShopBreakdown?: Array<{
    shopId: string
    shopName: string
    totalParts: number
    lowStockCount: number
    restockNowCount: number
    totalStockValue: number
  }>
}

// ─── Analysis logic ────────────────────────────────────────────────────────

/**
 * Compute the restock recommendation for a single part based on its metrics.
 *
 * Decision matrix (documented at top of file). Returns the recommendation,
 * a human-readable reason, suggested restock quantity, and priority.
 */
export function computeRecommendation(input: {
  salesVelocityPerDay: number
  daysOfStockLeft: number | null
  isLowStock: boolean
  profitMarginPercent: number
  lastSaleDaysAgo: number | null
  daysSinceCreated: number
  currentStock: number
}): {
  recommendation: RestockRecommendation
  reason: string
  suggestedQuantity: number
  priority: 1 | 2 | 3 | 4 | 5
} {
  const { salesVelocityPerDay, daysOfStockLeft, isLowStock, profitMarginPercent, lastSaleDaysAgo, daysSinceCreated, currentStock } = input

  // ─── New product: created <30 days ago — too early to judge ──────────
  if (daysSinceCreated < 30) {
    return {
      recommendation: 'new_product',
      reason: `Created ${daysSinceCreated} days ago — too early to judge sales pattern. Monitor for another ${30 - daysSinceCreated} days.`,
      suggestedQuantity: 0,
      priority: 5,
    }
  }

  // ─── Dead stock: zero sales in 90+ days ──────────────────────────────
  if (lastSaleDaysAgo === null || lastSaleDaysAgo > 90) {
    return {
      recommendation: 'discontinue',
      reason: `No sales in ${lastSaleDaysAgo ?? '∞'} days. Consider discounting to clear stock or delisting. Tied-up capital: ₹${(currentStock).toFixed(0)} units.`,
      suggestedQuantity: 0,
      priority: 4,
    }
  }

  // ─── High velocity (>1 unit/day) ─────────────────────────────────────
  if (salesVelocityPerDay > 1) {
    if (daysOfStockLeft !== null && daysOfStockLeft < 7) {
      return {
        recommendation: 'restock_now',
        reason: `Selling ${salesVelocityPerDay.toFixed(1)}/day. Only ${daysOfStockLeft.toFixed(0)} days of stock left. Order URGENTLY to avoid stockout.`,
        suggestedQuantity: Math.ceil(salesVelocityPerDay * 30),   // 30-day supply
        priority: 1,
      }
    }
    if (isLowStock || (daysOfStockLeft !== null && daysOfStockLeft < 30)) {
      return {
        recommendation: 'restock_soon',
        reason: `Selling ${salesVelocityPerDay.toFixed(1)}/day. ${daysOfStockLeft?.toFixed(0) ?? '?'} days of stock left. Order this week.`,
        suggestedQuantity: Math.ceil(salesVelocityPerDay * 30),
        priority: 2,
      }
    }
    return {
      recommendation: 'no_action',
      reason: `Healthy stock. Selling ${salesVelocityPerDay.toFixed(1)}/day, ${daysOfStockLeft?.toFixed(0)} days left.`,
      suggestedQuantity: 0,
      priority: 5,
    }
  }

  // ─── Medium velocity (0.1 - 1 unit/day) ──────────────────────────────
  if (salesVelocityPerDay >= 0.1) {
    if (isLowStock || (daysOfStockLeft !== null && daysOfStockLeft < 14)) {
      if (profitMarginPercent < 10) {
        return {
          recommendation: 'monitor',
          reason: `Low margin (${profitMarginPercent.toFixed(1)}%) + medium sales. Restock only if margin improves or supplier offers discount.`,
          suggestedQuantity: Math.ceil(salesVelocityPerDay * 21),
          priority: 3,
        }
      }
      return {
        recommendation: 'restock_now',
        reason: `Selling ${salesVelocityPerDay.toFixed(1)}/day, only ${daysOfStockLeft?.toFixed(0) ?? '?'} days left. Margin ${profitMarginPercent.toFixed(1)}% is healthy.`,
        suggestedQuantity: Math.ceil(salesVelocityPerDay * 30),
        priority: 2,
      }
    }
    return {
      recommendation: 'no_action',
      reason: `Medium sales (${salesVelocityPerDay.toFixed(1)}/day), ${daysOfStockLeft?.toFixed(0) ?? '?'} days of stock.`,
      suggestedQuantity: 0,
      priority: 5,
    }
  }

  // ─── Low velocity (<0.1 unit/day) — slow mover ───────────────────────
  if (salesVelocityPerDay > 0) {
    return {
      recommendation: 'monitor',
      reason: `Slow seller (${salesVelocityPerDay.toFixed(2)}/day). Don't restock until current stock clears. Consider bundling or discounting.`,
      suggestedQuantity: 0,
      priority: 4,
    }
  }

  // ─── Zero sales but stock exists — monitor (recently restocked?) ─────
  return {
    recommendation: 'monitor',
    reason: `No sales in last 90 days but stock is fresh. Wait 30 more days before considering delisting.`,
    suggestedQuantity: 0,
    priority: 4,
  }
}

// ─── DB query: fetch raw data for a part's analysis ────────────────────────

interface RawPartData {
  partId: string
  partNumber: string
  name: string
  category: string
  brand: string
  shopId: string | null
  shopName: string | null
  currentStock: number
  minStockLevel: number
  costPrice: number
  sellingPrice: number
  currency: string
  createdAt: Date
}

interface RawSalesData {
  partId: string
  totalQty: number
  lastSaleDate: Date | null
}

interface RawRestockData {
  partId: string
  lastRestockDate: Date | null
  lastRestockQty: number
}

/**
 * Fetch + compute the full analysis for an owner's parts.
 *
 * @param ownerId       Owner ID
 * @param shopId        Filter by shop. null = all shops (unified view).
 * @param onlyLowStock  If true, only return parts at/below min stock level.
 */
export async function analyzeParts(
  ownerId: string,
  shopId: string | null,
  onlyLowStock: boolean = true
): Promise<AnalysisReport> {
  const now = new Date()
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  // ─── 1. Fetch all parts (optionally filtered by shop) ────────────────
  const parts = await db.sparePart.findMany({
    where: {
      ownerId,
      ...(shopId ? { shopId } : {}),
      isActive: true,
    },
    include: {
      shop: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (parts.length === 0) {
    return {
      parts: [],
      summary: {
        totalParts: 0, lowStockCount: 0, restockNowCount: 0, restockSoonCount: 0,
        monitorCount: 0, discontinueCount: 0, newProductCount: 0, noActionCount: 0,
        totalStockValue: 0, totalRetailValue: 0, totalPotentialProfit: 0, deadStockValue: 0,
      },
      filter: { ownerId, shopId, onlyLowStock },
    }
  }

  const partIds = parts.map((p) => p.id)

  // ─── 2. Fetch sales aggregates for last 30 + 90 days ─────────────────
  // Single query with grouping — much faster than N+1.
  const [salesLast30, salesLast90, allSalesLast90] = await Promise.all([
    db.sale.groupBy({
      by: ['partId'],
      where: { partId: { in: partIds }, date: { gte: last30Days } },
      _sum: { quantity: true },
    }),
    db.sale.groupBy({
      by: ['partId'],
      where: { partId: { in: partIds }, date: { gte: last90Days } },
      _sum: { quantity: true },
    }),
    db.sale.groupBy({
      by: ['partId'],
      where: { partId: { in: partIds }, date: { gte: last90Days } },
      _max: { date: true },
    }),
  ])

  // Build lookup maps for O(1) access
  const sales30Map = new Map(salesLast30.map((s) => [s.partId, s._sum.quantity ?? 0]))
  const sales90Map = new Map(salesLast90.map((s) => [s.partId, s._sum.quantity ?? 0]))
  const lastSaleMap = new Map(allSalesLast90.map((s) => [s.partId, s._max.date]))

  // ─── 3. Fetch last restock (purchase) per part ───────────────────────
  const lastPurchases = await db.purchase.groupBy({
    by: ['partId'],
    where: { partId: { in: partIds } },
    _max: { date: true },
    _sum: { quantity: true },
  })
  const restockMap = new Map(lastPurchases.map((p) => [p.partId, {
    lastRestockDate: p._max.date,
    lastRestockQty: p._sum.quantity ?? 0,
  }]))

  // ─── 4. Compute analysis per part ────────────────────────────────────
  const analyses: ProductAnalysis[] = parts.map((part) => {
    const sales30 = sales30Map.get(part.id) ?? 0
    const sales90 = sales90Map.get(part.id) ?? 0
    const velocity = sales90 / 90   // Per day, averaged over 90 days

    const lastSale = lastSaleMap.get(part.id) ?? null
    const lastSaleDaysAgo = lastSale
      ? Math.floor((now.getTime() - lastSale.getTime()) / (24 * 60 * 60 * 1000))
      : null

    const restock = restockMap.get(part.id)
    const lastRestockDate = restock?.lastRestockDate ?? null
    const lastRestockDaysAgo = lastRestockDate
      ? Math.floor((now.getTime() - lastRestockDate.getTime()) / (24 * 60 * 60 * 1000))
      : null

    const daysOfStockLeft = velocity > 0 ? part.currentStock / velocity : null

    const isLowStock = part.currentStock <= part.minStockLevel
    const profitPerUnit = part.sellingPrice - part.costPrice
    const profitMarginPercent = part.sellingPrice > 0
      ? (profitPerUnit / part.sellingPrice) * 100
      : 0
    const stockValue = part.currentStock * part.costPrice
    const retailValue = part.currentStock * part.sellingPrice
    const totalPotentialProfit = part.currentStock * profitPerUnit

    const daysSinceCreated = Math.floor((now.getTime() - part.createdAt.getTime()) / (24 * 60 * 60 * 1000))

    // Compute recommendation
    const rec = computeRecommendation({
      salesVelocityPerDay: velocity,
      daysOfStockLeft,
      isLowStock,
      profitMarginPercent,
      lastSaleDaysAgo,
      daysSinceCreated,
      currentStock: part.currentStock,
    })

    return {
      partId: part.id,
      partNumber: part.partNumber,
      name: part.name,
      category: part.category,
      brand: part.brand,
      shopId: part.shopId,
      shopName: part.shop?.name ?? null,
      currentStock: part.currentStock,
      minStockLevel: part.minStockLevel,
      isLowStock,
      stockValue,
      retailValue,
      salesLast30Days: sales30,
      salesLast90Days: sales90,
      salesVelocityPerDay: velocity,
      lastSaleDate: lastSale,
      lastSaleDaysAgo,
      daysOfStockLeft,
      lastRestockDate,
      lastRestockDaysAgo,
      lastRestockQuantity: restock?.lastRestockQty ?? 0,
      costPrice: part.costPrice,
      sellingPrice: part.sellingPrice,
      profitPerUnit,
      profitMarginPercent,
      totalPotentialProfit,
      daysSinceCreated,
      recommendation: rec.recommendation,
      recommendationReason: rec.reason,
      suggestedRestockQuantity: rec.suggestedQuantity,
      priority: rec.priority,
    }
  })

  // ─── 5. Filter (low stock only?) + sort by priority ──────────────────
  const filtered = onlyLowStock ? analyses.filter((a) => a.isLowStock) : analyses
  filtered.sort((a, b) => {
    // Priority 1 first, then by daysOfStockLeft ascending (nulls last)
    if (a.priority !== b.priority) return a.priority - b.priority
    const aDays = a.daysOfStockLeft ?? Number.MAX_SAFE_INTEGER
    const bDays = b.daysOfStockLeft ?? Number.MAX_SAFE_INTEGER
    return aDays - bDays
  })

  // ─── 6. Build summary + per-shop breakdown ───────────────────────────
  const summary = {
    totalParts: analyses.length,
    lowStockCount: analyses.filter((a) => a.isLowStock).length,
    restockNowCount: analyses.filter((a) => a.recommendation === 'restock_now').length,
    restockSoonCount: analyses.filter((a) => a.recommendation === 'restock_soon').length,
    monitorCount: analyses.filter((a) => a.recommendation === 'monitor').length,
    discontinueCount: analyses.filter((a) => a.recommendation === 'discontinue').length,
    newProductCount: analyses.filter((a) => a.recommendation === 'new_product').length,
    noActionCount: analyses.filter((a) => a.recommendation === 'no_action').length,
    totalStockValue: analyses.reduce((s, a) => s + a.stockValue, 0),
    totalRetailValue: analyses.reduce((s, a) => s + a.retailValue, 0),
    totalPotentialProfit: analyses.reduce((s, a) => s + a.totalPotentialProfit, 0),
    deadStockValue: analyses
      .filter((a) => a.recommendation === 'discontinue')
      .reduce((s, a) => s + a.stockValue, 0),
  }

  // Per-shop breakdown — only computed when shopId=null (unified view)
  let perShopBreakdown: AnalysisReport['perShopBreakdown'] | undefined
  if (!shopId) {
    const shopMap = new Map<string, { shopName: string; parts: ProductAnalysis[] }>()
    for (const a of analyses) {
      const sid = a.shopId ?? '__unassigned__'
      const sname = a.shopName ?? 'Unassigned'
      if (!shopMap.has(sid)) shopMap.set(sid, { shopName: sname, parts: [] })
      shopMap.get(sid)!.parts.push(a)
    }
    perShopBreakdown = Array.from(shopMap.entries()).map(([shopId, v]) => ({
      shopId,
      shopName: v.shopName,
      totalParts: v.parts.length,
      lowStockCount: v.parts.filter((a) => a.isLowStock).length,
      restockNowCount: v.parts.filter((a) => a.recommendation === 'restock_now').length,
      totalStockValue: v.parts.reduce((s, a) => s + a.stockValue, 0),
    }))
  }

  return {
    parts: filtered,
    summary,
    filter: { ownerId, shopId, onlyLowStock },
    perShopBreakdown,
  }
}
