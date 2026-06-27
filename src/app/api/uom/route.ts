import { NextRequest, NextResponse } from 'next/server'
import { guardAuth } from '@/lib/api-utils'
import { COMMON_UOMS } from '@/lib/uom'

/**
 * GET /api/uom
 *   Returns the list of common UOMs (Unit of Measure) for dropdowns.
 *   Static list — no DB query needed.
 */

export async function GET(request: NextRequest) {
  const [user, authErr] = await guardAuth(request)
  if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  return NextResponse.json({
    uoms: COMMON_UOMS,
    total: COMMON_UOMS.length,
  })
}
