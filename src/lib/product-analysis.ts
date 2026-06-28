/** Product analysis — restock recommendation engine. */
import { db } from '@/lib/db'

export type RestockRecommendation = 'restock_now' | 'restock_soon' | 'monitor' | 'discontinue' | 'new_product' | 'no_action'

export interface ProductAnalysis {
  partId: string; partNumber: string; name: string; category: string; brand: string
  shopId: string | null; shopName: string | null
  currentStock: number; minStockLevel: number; isLowStock: boolean
  stockValue: number; retailValue: number
  salesLast30Days: number; salesLast90Days: number; salesVelocityPerDay: number
  lastSaleDate: Date | null; lastSaleDaysAgo: number | null; daysOfStockLeft: number | null
  lastRestockDate: Date | null; lastRestockDaysAgo: number | null; lastRestockQuantity: number
  costPrice: number; sellingPrice: number; profitPerUnit: number; profitMarginPercent: number; totalPotentialProfit: number
  daysSinceCreated: number
  recommendation: RestockRecommendation; recommendationReason: string
  suggestedRestockQuantity: number; priority: 1 | 2 | 3 | 4 | 5
}

export interface AnalysisReport {
  parts: ProductAnalysis[]
  summary: { totalParts: number; lowStockCount: number; restockNowCount: number; restockSoonCount: number; monitorCount: number; discontinueCount: number; newProductCount: number; noActionCount: number; totalStockValue: number; totalRetailValue: number; totalPotentialProfit: number; deadStockValue: number }
  filter: { ownerId: string; shopId: string | null; onlyLowStock: boolean }
  perShopBreakdown?: Array<{ shopId: string; shopName: string; totalParts: number; lowStockCount: number; restockNowCount: number; totalStockValue: number }>
}

export function computeRecommendation(input: { salesVelocityPerDay: number; daysOfStockLeft: number | null; isLowStock: boolean; profitMarginPercent: number; lastSaleDaysAgo: number | null; daysSinceCreated: number; currentStock: number }): { recommendation: RestockRecommendation; reason: string; suggestedQuantity: number; priority: 1 | 2 | 3 | 4 | 5 } {
  const { salesVelocityPerDay, daysOfStockLeft, isLowStock, profitMarginPercent, lastSaleDaysAgo, daysSinceCreated, currentStock } = input
  if (daysSinceCreated < 30) return { recommendation: 'new_product', reason: `Created ${daysSinceCreated} days ago — too early to judge.`, suggestedQuantity: 0, priority: 5 }
  if (lastSaleDaysAgo === null || lastSaleDaysAgo > 90) return { recommendation: 'discontinue', reason: `No sales in ${lastSaleDaysAgo ?? '∞'} days. Consider discounting.`, suggestedQuantity: 0, priority: 4 }
  if (salesVelocityPerDay > 1) {
    if (daysOfStockLeft !== null && daysOfStockLeft < 7) return { recommendation: 'restock_now', reason: `Selling ${salesVelocityPerDay.toFixed(1)}/day. Only ${daysOfStockLeft.toFixed(0)} days left. Order URGENTLY.`, suggestedQuantity: Math.ceil(salesVelocityPerDay * 30), priority: 1 }
    if (isLowStock || (daysOfStockLeft !== null && daysOfStockLeft < 30)) return { recommendation: 'restock_soon', reason: `Selling ${salesVelocityPerDay.toFixed(1)}/day. ${daysOfStockLeft?.toFixed(0) ?? '?'} days left.`, suggestedQuantity: Math.ceil(salesVelocityPerDay * 30), priority: 2 }
    return { recommendation: 'no_action', reason: `Healthy. ${daysOfStockLeft?.toFixed(0) ?? '?'} days left.`, suggestedQuantity: 0, priority: 5 }
  }
  if (salesVelocityPerDay >= 0.1) {
    if (isLowStock || (daysOfStockLeft !== null && daysOfStockLeft < 14)) {
      if (profitMarginPercent < 10) return { recommendation: 'monitor', reason: `Low margin (${profitMarginPercent.toFixed(1)}%) + medium sales.`, suggestedQuantity: Math.ceil(salesVelocityPerDay * 21), priority: 3 }
      return { recommendation: 'restock_now', reason: `Selling ${salesVelocityPerDay.toFixed(1)}/day, ${daysOfStockLeft?.toFixed(0) ?? '?'} days left. Margin ${profitMarginPercent.toFixed(1)}%.`, suggestedQuantity: Math.ceil(salesVelocityPerDay * 30), priority: 2 }
    }
    return { recommendation: 'no_action', reason: `Medium sales, ${daysOfStockLeft?.toFixed(0) ?? '?'} days left.`, suggestedQuantity: 0, priority: 5 }
  }
  if (salesVelocityPerDay > 0) return { recommendation: 'monitor', reason: `Slow seller (${salesVelocityPerDay.toFixed(2)}/day). Don't restock yet.`, suggestedQuantity: 0, priority: 4 }
  return { recommendation: 'monitor', reason: `No sales recently but stock is fresh.`, suggestedQuantity: 0, priority: 4 }
}

export async function analyzeParts(ownerId: string, shopId: string | null, onlyLowStock = true): Promise<AnalysisReport> {
  const now = new Date()
  const last30 = new Date(now.getTime() - 30 * 86400000)
  const last90 = new Date(now.getTime() - 90 * 86400000)

  const parts = await db.sparePart.findMany({ where: { ownerId, ...(shopId ? { shopId } : {}), isActive: true }, include: { shop: { select: { name: true } } }, orderBy: { updatedAt: 'desc' } })
  if (parts.length === 0) return { parts: [], summary: { totalParts: 0, lowStockCount: 0, restockNowCount: 0, restockSoonCount: 0, monitorCount: 0, discontinueCount: 0, newProductCount: 0, noActionCount: 0, totalStockValue: 0, totalRetailValue: 0, totalPotentialProfit: 0, deadStockValue: 0 }, filter: { ownerId, shopId, onlyLowStock } }

  const partIds = parts.map((p) => p.id)
  const [s30, s90, lastSales, lastPurchases] = await Promise.all([
    db.sale.groupBy({ by: ['partId'], where: { partId: { in: partIds }, date: { gte: last30 } }, _sum: { quantity: true } }),
    db.sale.groupBy({ by: ['partId'], where: { partId: { in: partIds }, date: { gte: last90 } }, _sum: { quantity: true } }),
    db.sale.groupBy({ by: ['partId'], where: { partId: { in: partIds }, date: { gte: last90 } }, _max: { date: true } }),
    db.purchase.groupBy({ by: ['partId'], where: { partId: { in: partIds } }, _max: { date: true }, _sum: { quantity: true } }),
  ])
  const m30 = new Map(s30.map((s) => [s.partId, s._sum.quantity ?? 0]))
  const m90 = new Map(s90.map((s) => [s.partId, s._sum.quantity ?? 0]))
  const lm = new Map(lastSales.map((s) => [s.partId, s._max.date]))
  const rm = new Map(lastPurchases.map((p) => [p.partId, { lastRestockDate: p._max.date, lastRestockQty: p._sum.quantity ?? 0 }]))

  const analyses: ProductAnalysis[] = parts.map((part) => {
    const sales30 = m30.get(part.id) ?? 0, sales90 = m90.get(part.id) ?? 0
    const velocity = sales90 / 90
    const lastSale = lm.get(part.id) ?? null
    const lastSaleDaysAgo = lastSale ? Math.floor((now.getTime() - lastSale.getTime()) / 86400000) : null
    const restock = rm.get(part.id)
    const lastRestockDate = restock?.lastRestockDate ?? null
    const lastRestockDaysAgo = lastRestockDate ? Math.floor((now.getTime() - lastRestockDate.getTime()) / 86400000) : null
    const daysOfStockLeft = velocity > 0 ? part.currentStock / velocity : null
    const isLowStock = part.currentStock <= part.minStockLevel
    const profitPerUnit = part.sellingPrice - part.costPrice
    const profitMarginPercent = part.sellingPrice > 0 ? (profitPerUnit / part.sellingPrice) * 100 : 0
    const stockValue = part.currentStock * part.costPrice
    const retailValue = part.currentStock * part.sellingPrice
    const totalPotentialProfit = part.currentStock * profitPerUnit
    const daysSinceCreated = Math.floor((now.getTime() - part.createdAt.getTime()) / 86400000)
    const rec = computeRecommendation({ salesVelocityPerDay: velocity, daysOfStockLeft, isLowStock, profitMarginPercent, lastSaleDaysAgo, daysSinceCreated, currentStock: part.currentStock })
    return { partId: part.id, partNumber: part.partNumber, name: part.name, category: part.category, brand: part.brand, shopId: part.shopId, shopName: part.shop?.name ?? null, currentStock: part.currentStock, minStockLevel: part.minStockLevel, isLowStock, stockValue, retailValue, salesLast30Days: sales30, salesLast90Days: sales90, salesVelocityPerDay: velocity, lastSaleDate: lastSale, lastSaleDaysAgo, daysOfStockLeft, lastRestockDate, lastRestockDaysAgo, lastRestockQuantity: restock?.lastRestockQty ?? 0, costPrice: part.costPrice, sellingPrice: part.sellingPrice, profitPerUnit, profitMarginPercent, totalPotentialProfit, daysSinceCreated, recommendation: rec.recommendation, recommendationReason: rec.reason, suggestedRestockQuantity: rec.suggestedQuantity, priority: rec.priority }
  })

  const filtered = onlyLowStock ? analyses.filter((a) => a.isLowStock) : analyses
  filtered.sort((a, b) => { if (a.priority !== b.priority) return a.priority - b.priority; const ad = a.daysOfStockLeft ?? Number.MAX_SAFE_INTEGER; const bd = b.daysOfStockLeft ?? Number.MAX_SAFE_INTEGER; return ad - bd })

  const summary = { totalParts: analyses.length, lowStockCount: analyses.filter((a) => a.isLowStock).length, restockNowCount: analyses.filter((a) => a.recommendation === 'restock_now').length, restockSoonCount: analyses.filter((a) => a.recommendation === 'restock_soon').length, monitorCount: analyses.filter((a) => a.recommendation === 'monitor').length, discontinueCount: analyses.filter((a) => a.recommendation === 'discontinue').length, newProductCount: analyses.filter((a) => a.recommendation === 'new_product').length, noActionCount: analyses.filter((a) => a.recommendation === 'no_action').length, totalStockValue: analyses.reduce((s, a) => s + a.stockValue, 0), totalRetailValue: analyses.reduce((s, a) => s + a.retailValue, 0), totalPotentialProfit: analyses.reduce((s, a) => s + a.totalPotentialProfit, 0), deadStockValue: analyses.filter((a) => a.recommendation === 'discontinue').reduce((s, a) => s + a.stockValue, 0) }

  let perShopBreakdown: AnalysisReport['perShopBreakdown'] | undefined
  if (!shopId) {
    const sm = new Map<string, { shopName: string; parts: ProductAnalysis[] }>()
    for (const a of analyses) { const sid = a.shopId ?? '__unassigned__'; const sname = a.shopName ?? 'Unassigned'; if (!sm.has(sid)) sm.set(sid, { shopName: sname, parts: [] }); sm.get(sid)!.parts.push(a) }
    perShopBreakdown = Array.from(sm.entries()).map(([shopId, v]) => ({ shopId, shopName: v.shopName, totalParts: v.parts.length, lowStockCount: v.parts.filter((a) => a.isLowStock).length, restockNowCount: v.parts.filter((a) => a.recommendation === 'restock_now').length, totalStockValue: v.parts.reduce((s, a) => s + a.stockValue, 0) }))
  }

  return { parts: filtered, summary, filter: { ownerId, shopId, onlyLowStock }, perShopBreakdown }
}
