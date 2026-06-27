import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin, logApiError } from '@/lib/api-utils'
import { analyzeParts } from '@/lib/product-analysis'
import { db } from '@/lib/db'

/**
 * GET /api/parts/analysis
 *
 * Query params:
 *   shopId=<id>     — analyze only this shop (location-wise / branch-wise)
 *   shopId=all      — analyze ALL shops unified, with per-shop breakdown
 *   onlyLowStock=true  — only return parts at/below min stock (default: true)
 *
 * Returns a comprehensive analysis per part:
 *   - Sales velocity (last 30 + 90 days)
 *   - Days of stock left
 *   - Last sale date + days ago
 *   - Last restock date + days ago
 *   - Profit margin + total potential profit
 *   - Recommendation: 'restock_now' | 'restock_soon' | 'monitor' | 'discontinue' | 'new_product' | 'no_action'
 *   - Suggested restock quantity
 *   - Priority (1=urgent → 5=lowest)
 *
 * When shopId=all, also returns `perShopBreakdown` — comparison view across
 * all branches with their low-stock counts + stock values.
 *
 * ─── The user's exact ask ──────────────────────────────────────────────────
 * "product analysis to be made before showing alert that stock is low
 *  based on how long it has been in inventory how much profit is it
 *  profitable to buy again and also show to user if this stock need to
 *  be restocked after showing analysis to him for each low inventory
 *  product analysis has to be made location wise and branch wise and
 *  also unified all branches and comparison shown to user"
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const shopIdParam = searchParams.get('shopId') || 'all'
    const onlyLowStock = searchParams.get('onlyLowStock') !== 'false'   // default true

    // Determine shopId filter
    let shopId: string | null = null
    if (shopIdParam && shopIdParam !== 'all') {
      // Validate that the shop belongs to the owner (multi-tenant safety)
      const shop = await db.shop.findFirst({
        where: { id: shopIdParam, ownerId: user.ownerId },
        select: { id: true },
      })
      if (!shop) {
        return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
      }
      shopId = shopIdParam
    }

    const report = await analyzeParts(user.ownerId, shopId, onlyLowStock)

    return NextResponse.json(report)
  } catch (error) {
    logApiError('parts/analysis/GET', error)
    return NextResponse.json(
      { error: 'Failed to generate analysis', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
