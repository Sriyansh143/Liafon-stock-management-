import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { searchHsnCodes, getHsnCategories } from '@/lib/hsn'

/**
 * GET /api/hsn-codes?q=<search>&limit=50
 *   Search HSN codes by code OR description OR category.
 *
 * GET /api/hsn-codes?categories=true
 *   Returns distinct categories (for filter dropdowns).
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const q = searchParams.get('q') || ''
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const wantCategories = searchParams.get('categories') === 'true'

    if (wantCategories) {
      const categories = await getHsnCategories()
      return NextResponse.json({ categories })
    }

    const codes = await searchHsnCodes(q, limit)
    return NextResponse.json({ codes, total: codes.length })
  } catch (error) {
    logApiError('hsn-codes/GET', error)
    return NextResponse.json({ error: 'Failed to fetch HSN codes' }, { status: 500 })
  }
}
