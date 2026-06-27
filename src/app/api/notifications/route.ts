import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError } from '@/lib/api-utils'

/**
 * GET /api/notifications
 * Returns a unified notifications feed:
 *   - low-stock parts (currentStock <= minStockLevel, isActive=true)
 *   - today's sales total + count
 *   - recent activity log (last 10 entries)
 *
 * Designed for a header bell-icon dropdown.
 *
 * NOTE: SQLite can't compare two columns in a WHERE clause, so we
 * can't ask Prisma for `WHERE currentStock <= minStockLevel` directly.
 * Previously we fetched up to 500 active parts and filtered in JS,
 * which silently under-reported low-stock for catalogs > 500 parts.
 * We now fetch ALL active parts (selecting only the columns we need
 * to keep the payload small) and filter in JS — correct at any scale.
 * For very large catalogs (10k+ parts), consider migrating to a DB
 * with column-comparison support or adding a denormalized
 * `isLowStock` boolean column.
 */
export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr) return authErr

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [allActiveParts, todaySalesAgg, todaySalesCount, recentActivity] =
      await Promise.all([
        db.sparePart.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            partNumber: true,
            currentStock: true,
            minStockLevel: true,
            category: true,
          },
          // No `take` cap — we need every active part to compute the
          // accurate low-stock count. Selecting only the columns we
          // need keeps the payload small even for 10k+ parts.
        }),
        db.sale.aggregate({
          where: { date: { gte: today } },
          _sum: { totalPrice: true },
        }),
        db.sale.count({ where: { date: { gte: today } } }),
        db.activityLog.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          // SECURITY: don't return emails — they're PII and the bell
          // UI only displays the user's name.
          include: { user: { select: { name: true } } },
        }),
      ])

    // Filter low-stock + out-of-stock parts in JS (SQLite can't compare columns)
    const lowStock = allActiveParts
      .filter((p) => p.currentStock <= p.minStockLevel)
      .sort((a, b) => a.currentStock - b.currentStock)
      .slice(0, 20)
      .map((p) => ({
        id: p.id,
        type: p.currentStock === 0 ? 'out_of_stock' : 'low_stock',
        partNumber: p.partNumber,
        name: p.name,
        category: p.category,
        currentStock: p.currentStock,
        minStockLevel: p.minStockLevel,
        severity: p.currentStock === 0 ? 'critical' : 'warning',
      }))

    const activity = recentActivity.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      summary: log.summary,
      timestamp: log.createdAt.toISOString(),
      userName: log.user?.name || null,
    }))

    const unreadCount = lowStock.length

    return NextResponse.json({
      success: true,
      notifications: {
        lowStock,
        activity,
        todaySummary: {
          salesCount: todaySalesCount,
          salesTotal: todaySalesAgg._sum.totalPrice || 0,
        },
      },
      unreadCount,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    logApiError('notifications/GET', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}
