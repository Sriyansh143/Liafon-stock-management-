import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, guardManager, logApiError, apiNotFound } from '@/lib/api-utils'
import { validate, stockAdjustSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'
import type { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Build date filter: if custom range is provided, use it; otherwise default to today
    const dateFilter: Prisma.DateTimeFilter = {}
    let dateLabel = 'Today'

    if (startDateParam || endDateParam) {
      if (startDateParam) {
        dateFilter.gte = new Date(startDateParam)
        dateFilter.gte.setHours(0, 0, 0, 0)
      }
      if (endDateParam) {
        dateFilter.lte = new Date(endDateParam)
        dateFilter.lte.setHours(23, 59, 59, 999)
      }
      dateLabel = `${startDateParam || 'Start'} to ${endDateParam || 'Now'}`
    } else {
      dateFilter.gte = today
    }

    const lowStockItems = await db.sparePart.findMany({
      where: { isActive: true },
      select: { id: true, currentStock: true, minStockLevel: true, name: true, partNumber: true },
      take: 1000,
    })
    const lowStockParts = lowStockItems.filter(
      (p) => p.currentStock <= p.minStockLevel
    )
    const lowStockCount = lowStockParts.length

    const [
      totalParts,
      periodSalesAgg,
      periodPurchasesAgg,
      periodSalesCount,
      periodPurchasesCount,
      recentActivity,
    ] = await Promise.all([
      db.sparePart.count({ where: { isActive: true } }),
      db.sale.aggregate({
        where: { date: dateFilter },
        _sum: { totalPrice: true },
      }),
      db.purchase.aggregate({
        where: { date: dateFilter },
        _sum: { totalCost: true },
      }),
      db.sale.count({ where: { date: dateFilter } }),
      db.purchase.count({ where: { date: dateFilter } }),
      db.stockLog.findMany({
        take: 15,
        orderBy: { createdAt: 'asc' },
        include: { part: true },
      }),
    ])

    const periodSalesTotal = periodSalesAgg._sum.totalPrice || 0
    const periodPurchasesTotal = periodPurchasesAgg._sum.totalCost || 0

    const [salesByDay, purchasesByDay, partsByCategory, topSellingRaw, inventoryValueAgg] =
      await Promise.all([
        db.sale.groupBy({
          by: ['date'],
          _sum: { totalPrice: true, quantity: true },
          where: { date: dateFilter },
          orderBy: { date: 'asc' },
          take: 30,
        }),
        db.purchase.groupBy({
          by: ['date'],
          _sum: { totalCost: true, quantity: true },
          where: { date: dateFilter },
          orderBy: { date: 'asc' },
          take: 30,
        }),
        db.sparePart.groupBy({
          by: ['category'],
          _count: true,
          where: { isActive: true },
        }),
        db.sale.groupBy({
          by: ['partId'],
          _sum: { quantity: true, totalPrice: true },
          where: { date: dateFilter },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 10,
        }),
        db.sparePart.aggregate({
          where: { isActive: true },
          _sum: {
            currentStock: true,
            costPrice: true,
            sellingPrice: true,
          },
        }),
      ])

    // Batch-fetch top selling parts (fix N+1: was Promise.all of findUnique)
    const topPartIds = topSellingRaw.map((t) => t.partId)
    const topParts = topPartIds.length
      ? await db.sparePart.findMany({
          where: { id: { in: topPartIds } },
          select: {
            id: true,
            name: true,
            partNumber: true,
            category: true,
            brand: true,
          },
        })
      : []
    const topPartsMap = new Map(topParts.map((p) => [p.id, p]))
    const topSellingParts = topSellingRaw.map((item) => ({
      ...item,
      part: topPartsMap.get(item.partId) || null,
    }))

    return NextResponse.json({
      totalParts,
      lowStockParts: lowStockCount,
      lowStockItems: lowStockCount,
      lowStockList: lowStockParts.slice(0, 20),
      periodSalesCount,
      periodPurchasesCount,
      periodSalesTotal,
      periodPurchasesTotal,
      // Backwards-compat: also expose as todayXxx for old clients
      todaySalesCount: periodSalesCount,
      todayPurchasesCount: periodPurchasesCount,
      todaySalesTotal: periodSalesTotal,
      todayPurchasesTotal: periodPurchasesTotal,
      dateLabel,
      recentActivity,
      salesByDay,
      purchasesByDay,
      partsByCategory,
      topSellingParts,
      inventoryValue: {
        totalUnits: inventoryValueAgg._sum.currentStock || 0,
        costValue: inventoryValueAgg._sum.costPrice || 0,
        retailValue: inventoryValueAgg._sum.sellingPrice || 0,
      },
    })
  } catch (error) {
    logApiError('stock/GET', error)
    return NextResponse.json({ error: 'Failed to fetch stock summary' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(stockAdjustSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    const { partId, newStock, notes } = result.data

    const outcome = await db.$transaction(async (tx) => {
      const part = await tx.sparePart.findUnique({ where: { id: partId } })
      if (!part) throw new Error('PART_NOT_FOUND')

      const previousStock = part.currentStock

      await tx.sparePart.update({
        where: { id: partId },
        data: { currentStock: newStock },
      })

      await tx.stockLog.create({        data: {
          ownerId: user.ownerId,
          partId,
          type: 'ADJUSTMENT',
          quantity: newStock - previousStock,
          previousStock,
          newStock,
          notes: notes || 'Manual stock adjustment',
        },
      })

      return { previousStock, newStock, partName: part.name, partNumber: part.partNumber }
    })

    await logUserActivity(user, {
      action: 'STOCK_ADJUST',
      entityType: 'part',
      entityId: partId,
      summary: `Stock adjusted for ${outcome.partName} (${outcome.partNumber}): ${outcome.previousStock} → ${outcome.newStock}`,
      metadata: {
        ownerId: user.ownerId,
        partId,
        previousStock: outcome.previousStock,
        newStock: outcome.newStock,
        notes: notes || '',
      },
    })

    return NextResponse.json({
      success: true,
      previousStock: outcome.previousStock,
      newStock: outcome.newStock,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'PART_NOT_FOUND') {
      return apiNotFound('Part not found')
    }
    logApiError('stock/POST', error)
    return NextResponse.json({ error: 'Failed to adjust stock' }, { status: 500 })
  }
}
