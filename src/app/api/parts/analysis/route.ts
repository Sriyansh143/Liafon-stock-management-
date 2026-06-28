import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin, logApiError } from '@/lib/api-utils'
import { analyzeParts } from '@/lib/product-analysis'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const sp = request.nextUrl.searchParams
    const shopIdParam = sp.get('shopId') || 'all'
    const onlyLowStock = sp.get('onlyLowStock') !== 'false'
    let shopId: string | null = null
    if (shopIdParam && shopIdParam !== 'all') {
      const shop = await db.shop.findFirst({ where: { id: shopIdParam, ownerId: user.ownerId }, select: { id: true } })
      if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 })
      shopId = shopIdParam
    }
    const report = await analyzeParts(user.ownerId, shopId, onlyLowStock)
    return NextResponse.json(report)
  } catch (error) { logApiError('parts/analysis/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
