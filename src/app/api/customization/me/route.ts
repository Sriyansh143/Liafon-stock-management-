import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { DEFAULT_CUSTOMIZATION } from '../route'

/**
 * GET /api/customization/me
 * Auth required (any role).
 *
 * Returns the FULL customization object (fields + pages), merged with
 * defaults — same shape as the admin-only GET /api/customization, but
 * accessible to any authenticated user so the client can pass it into
 * getFieldPermissions() / checkPagePermission() and honor owner
 * customizations on every page.
 *
 * The data is not sensitive (it's just booleans per role), so any
 * signed-in user may read it. Only admins can change it (via POST
 * /api/customization).
 */
export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const setting = await db.appSetting.findFirst({
      where: { ownerId: user.ownerId, key: 'customization' },
    })

    if (!setting) {
      return NextResponse.json({
        success: true,
        customization: DEFAULT_CUSTOMIZATION,
        isDefault: true,
      })
    }

    try {
      const parsed = JSON.parse(setting.value) as {
        fields?: Record<string, Record<string, boolean>>
        pages?: Record<string, Record<string, boolean>>
      }
      // Merge with defaults so new fields appear automatically
      const merged = {
        fields: { ...DEFAULT_CUSTOMIZATION.fields, ...(parsed.fields || {}) },
        pages: { ...DEFAULT_CUSTOMIZATION.pages, ...(parsed.pages || {}) },
      }
      return NextResponse.json({
        success: true,
        customization: merged,
        isDefault: false,
      })
    } catch {
      // Stored value was malformed — fall back to defaults
      return NextResponse.json({
        success: true,
        customization: DEFAULT_CUSTOMIZATION,
        isDefault: true,
      })
    }
  } catch (error) {
    logApiError('customization/me/GET', error)
    return NextResponse.json(
      { error: 'Failed to load customization' },
      { status: 500 }
    )
  }
}
