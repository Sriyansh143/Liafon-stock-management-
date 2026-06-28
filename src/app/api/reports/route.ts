import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardManager, logApiError } from '@/lib/api-utils'

const ALLOWED_DAYS = [7, 14, 30, 60, 90, 180, 365]

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'daily'
    const daysRaw = parseInt(searchParams.get('days') || '30', 10)
    // Whitelist allowed day-ranges to avoid arbitrary input
    const days = ALLOWED_DAYS.includes(daysRaw) ? daysRaw : 30

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    if (type === 'daily') {
      // Use groupBy (single round-trip per stream) instead of findMany + reduce
      const [salesData, purchasesData] = await Promise.all([
        db.sale.groupBy({
          by: ['date'],
          _sum: { totalPrice: true, quantity: true },
          where: { ownerId: user?.ownerId || "", date: { gte: startDate } },
          orderBy: { date: 'asc' },
        }),
        db.purchase.groupBy({
          by: ['date'],
          _sum: { totalCost: true, quantity: true },
          where: { ownerId: user?.ownerId || "", date: { gte: startDate } },
          orderBy: { date: 'asc' },
        }),
      ])

      // Build a Map<dateStr, purchase> for O(1) lookup (was O(n×m) find inside map)
      const purchasesByDate = new Map(
        purchasesData.map((p) => [p.date.toISOString().split('T')[0], p])
      )

      const profitData = salesData.map((sale) => {
        const dateStr = sale.date.toISOString().split('T')[0]
        const purchase = purchasesByDate.get(dateStr)
        return {
          date: dateStr,
          sales: sale._sum.totalPrice || 0,
          purchases: purchase?._sum.totalCost || 0,
          itemsSold: sale._sum.quantity || 0,
          itemsPurchased: purchase?._sum.quantity || 0,
          // Net cash flow = sales - purchases (positive = net inflow)
          net: (sale._sum.totalPrice || 0) - (purchase?._sum.totalCost || 0),
        }
      })

      // Compute summary totals in one pass
      const summary = profitData.reduce(
        (acc, d) => {
          acc.totalSales += d.sales
          acc.totalPurchases += d.purchases
          acc.totalItemsSold += d.itemsSold
          acc.totalItemsPurchased += d.itemsPurchased
          return acc
        },
        {
          totalSales: 0,
          totalPurchases: 0,
          totalItemsSold: 0,
          totalItemsPurchased: 0,
          totalNet: 0,
        }
      )
      summary.totalNet = summary.totalSales - summary.totalPurchases

      return NextResponse.json({ type: 'daily', data: profitData, summary, days })
    }

    if (type === 'category') {
      // Use a single groupBy on sales joined to parts via a sub-query, then
      // batch-fetch part categories instead of include: { part: true } which
      // loads every sale row + its full part record.
      const [categoryData, salesByPart] = await Promise.all([
        db.sparePart.groupBy({
          by: ['category'],
          _count: true,
          _sum: { currentStock: true, costPrice: true, sellingPrice: true },
          where: { ownerId: user?.ownerId || "", isActive: true },
        }),
        db.sale.groupBy({
          by: ['partId'],
          _sum: { totalPrice: true, quantity: true },
          where: { ownerId: user?.ownerId || "", date: { gte: startDate } },
        }),
      ])

      // Batch-fetch parts to get their category for each partId in salesByPart
      const partIds = salesByPart.map((s) => s.partId)
      const parts = partIds.length
        ? await db.sparePart.findMany({
            where: { id: { in: partIds } },
            select: { id: true, category: true },
          })
        : []
      const partCategoryMap = new Map(parts.map((p) => [p.id, p.category]))

      // Aggregate sales totals by category
      const categorySalesMap = new Map<string, { revenue: number; qty: number }>()
      for (const s of salesByPart) {
        const cat = partCategoryMap.get(s.partId)
        if (!cat) continue
        const prev = categorySalesMap.get(cat) ?? { revenue: 0, qty: 0 }
        prev.revenue += s._sum.totalPrice || 0
        prev.qty += s._sum.quantity || 0
        categorySalesMap.set(cat, prev)
      }

      // Note: the previous version called `c._sum.costPrice` "totalCostValue"
      // which was actually the sum of UNIT cost prices across parts (a
      // meaningless number). The real "cost value" is sum(unitCost × stock)
      // — but Prisma's groupBy can't multiply two columns. We compute it
      // correctly here by fetching parts with both fields.
      const partsForValuation = await db.sparePart.findMany({
        where: { ownerId: user?.ownerId || "", isActive: true },
        select: { category: true, costPrice: true, sellingPrice: true, currentStock: true },
      })
      const valuationByCat = new Map<
        string,
        { costValue: number; retailValue: number; stockUnits: number }
      >()
      for (const p of partsForValuation) {
        const v = valuationByCat.get(p.category) ?? { costValue: 0, retailValue: 0, stockUnits: 0 }
        v.costValue += p.costPrice * p.currentStock
        v.retailValue += p.sellingPrice * p.currentStock
        v.stockUnits += p.currentStock
        valuationByCat.set(p.category, v)
      }

      const enriched = categoryData.map((c) => {
        const sales = categorySalesMap.get(c.category) ?? { revenue: 0, qty: 0 }
        const val = valuationByCat.get(c.category) ?? { costValue: 0, retailValue: 0, stockUnits: 0 }
        return {
          category: c.category,
          partsCount: c._count,
          stockUnits: val.stockUnits,
          costValue: val.costValue,
          retailValue: val.retailValue,
          potentialProfit: val.retailValue - val.costValue,
          salesRevenue: sales.revenue,
          salesQty: sales.qty,
        }
      })

      const summary = enriched.reduce(
        (acc, c) => {
          acc.totalParts += c.partsCount
          acc.totalStockUnits += c.stockUnits
          acc.totalCostValue += c.costValue
          acc.totalRetailValue += c.retailValue
          acc.totalSalesRevenue += c.salesRevenue
          return acc
        },
        {
          totalParts: 0,
          totalStockUnits: 0,
          totalCostValue: 0,
          totalRetailValue: 0,
          totalSalesRevenue: 0,
          totalPotentialProfit: 0,
        }
      )
      summary.totalPotentialProfit = summary.totalRetailValue - summary.totalCostValue

      return NextResponse.json({ type: 'category', data: enriched, summary, days })
    }

    if (type === 'profit') {
      // Per-part profitability report — uses groupBy instead of findMany
      const salesByPart = await db.sale.groupBy({
        by: ['partId'],
        _sum: { totalPrice: true, quantity: true },
        where: { ownerId: user?.ownerId || "", date: { gte: startDate } },
        orderBy: { _sum: { totalPrice: 'desc' } },
      })

      // Batch-fetch parts (one query, not N+1)
      const parts = await db.sparePart.findMany({
        where: { id: { in: salesByPart.map((s) => s.partId) } },
        select: { id: true, name: true, partNumber: true, costPrice: true, category: true },
      })
      const partMap = new Map(parts.map((p) => [p.id, p]))

      const data = salesByPart
        .map((s) => {
          const part = partMap.get(s.partId)
          if (!part) return null
          const revenue = s._sum.totalPrice || 0
          const cost = part.costPrice * (s._sum.quantity || 0)
          const profit = revenue - cost
          const margin = revenue > 0 ? (profit / revenue) * 100 : 0
          return {
            partId: s.partId,
            partName: part.name,
            partNumber: part.partNumber,
            category: part.category,
            quantity: s._sum.quantity || 0,
            revenue,
            cost,
            profit,
            margin,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.profit - a.profit)

      const summary = data.reduce(
        (acc, d) => {
          acc.totalRevenue += d.revenue
          acc.totalCost += d.cost
          acc.totalProfit += d.profit
          acc.totalUnits += d.quantity
          return acc
        },
        { totalRevenue: 0, totalCost: 0, totalProfit: 0, totalUnits: 0, avgMargin: 0 }
      )
      summary.avgMargin = summary.totalRevenue > 0
        ? (summary.totalProfit / summary.totalRevenue) * 100
        : 0

      return NextResponse.json({ type: 'profit', data, summary, days })
    }

    if (type === 'lowstock') {
      // Bonus report type: low-stock items with supplier info
      const parts = await db.sparePart.findMany({
        where: { ownerId: user?.ownerId || "", isActive: true },
        select: {
          id: true,
          partNumber: true,
          name: true,
          category: true,
          brand: true,
          currentStock: true,
          minStockLevel: true,
          costPrice: true,
          sellingPrice: true,
          location: true,
        },
        take: 2000,
      })
      const lowStock = parts
        .filter((p) => p.currentStock <= p.minStockLevel)
        .sort((a, b) => {
          // Out-of-stock first, then by deficit (most-negative first)
          const aDeficit = a.currentStock - a.minStockLevel
          const bDeficit = b.currentStock - b.minStockLevel
          return aDeficit - bDeficit
        })
        .map((p) => ({
          id: p.id,
          partNumber: p.partNumber,
          name: p.name,
          category: p.category,
          brand: p.brand,
          currentStock: p.currentStock,
          minStockLevel: p.minStockLevel,
          deficit: p.minStockLevel - p.currentStock,
          severity: p.currentStock === 0 ? 'critical' : 'warning',
          restockValue: (p.minStockLevel - p.currentStock) * p.costPrice,
          location: p.location,
        }))

      const summary = {
        totalLowStock: lowStock.length,
        criticalCount: lowStock.filter((l) => l.severity === 'critical').length,
        warningCount: lowStock.filter((l) => l.severity === 'warning').length,
        totalRestockValue: lowStock.reduce((s, l) => s + l.restockValue, 0),
      }

      return NextResponse.json({ type: 'lowstock', data: lowStock, summary, days })
    }

    return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
  } catch (error) {
    logApiError('reports/GET', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
