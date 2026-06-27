import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAdmin, guardAuth, logApiError } from '@/lib/api-utils'
import { validate, customizationSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'

/**
 * GET /api/customization
 * Returns the current customization settings (field visibility per role).
 * Admin+ can access.
 *
 * Settings are stored in the AppSetting table with key 'customization'.
 * The value is a JSON string:
 * {
 *   "fields": {
 *     "costPrice": { "owner": true, "admin": true, "manager": true, "user": false },
 *     "profit": { "owner": true, "admin": true, "manager": true, "user": false },
 *     "valuation": { "owner": true, "admin": true, "manager": true, "user": false },
 *     ...
 *   },
 *   "pages": {
 *     "reports": { "owner": true, "admin": true, "manager": true, "user": false },
 *     "activity": { "owner": true, "admin": true, "manager": false, "user": false },
 *     ...
 *   }
 * }
 */

const DEFAULT_CUSTOMIZATION = {
  fields: {
    costPrice: { owner: true, admin: true, manager: true, user: false },
    profit: { owner: true, admin: true, manager: true, user: false },
    valuation: { owner: true, admin: true, manager: true, user: false },
    supplierCost: { owner: true, admin: true, manager: true, user: false },
  },
  pages: {
    dashboard: { owner: true, admin: true, manager: true, user: true },
    inventory: { owner: true, admin: true, manager: true, user: true },
    sales: { owner: true, admin: true, manager: true, user: true },
    purchases: { owner: true, admin: true, manager: true, user: false },
    departments: { owner: true, admin: true, manager: true, user: false },
    reports: { owner: true, admin: true, manager: true, user: false },
    activity: { owner: true, admin: true, manager: false, user: false },
    settings: { owner: true, admin: true, manager: false, user: false },
    users: { owner: true, admin: false, manager: false, user: false },
  },
}

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const setting = await db.appSetting.findFirst({
      where: { ownerId: user.ownerId, key: 'customization' },
    })

    if (!setting) {
      // Return defaults
      return NextResponse.json({
        success: true,
        customization: DEFAULT_CUSTOMIZATION,
        isDefault: true,
      })
    }

    try {
      const parsed = JSON.parse(setting.value)
      // Merge with defaults so new fields appear automatically
      const merged = {
        fields: { ...DEFAULT_CUSTOMIZATION.fields, ...parsed.fields },
        pages: { ...DEFAULT_CUSTOMIZATION.pages, ...parsed.pages },
      }
      return NextResponse.json({
        success: true,
        customization: merged,
        isDefault: false,
      })
    } catch {
      return NextResponse.json({
        success: true,
        customization: DEFAULT_CUSTOMIZATION,
        isDefault: true,
      })
    }
  } catch (error) {
    logApiError('customization/GET', error)
    return NextResponse.json({ error: 'Failed to load customization' }, { status: 500 })
  }
}

/**
 * POST /api/customization
 * Saves the customization settings. Admin+ only.
 * Body is validated against customizationSchema — previously any JSON
 * shape was accepted and stored verbatim, which could break the merge
 * logic on next GET or be used to bloat the AppSetting table.
 */
export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(customizationSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const json = JSON.stringify(result.data.customization)

    const existing = await db.appSetting.findFirst({
      where: { ownerId: user.ownerId, key: 'customization' },
    })
    if (existing) {
      await db.appSetting.update({ where: { id: existing.id }, data: { value: json } })
    } else {
      await db.appSetting.create({ data: { ownerId: user.ownerId, key: 'customization', value: json } })
    }

    await logUserActivity(user, {
      action: 'UPDATE',
      entityType: 'setting',
      summary: 'App customization updated',
      metadata: {
        ownerId: user.ownerId,
        keys: Object.keys(result.data.customization),
        sizeBytes: json.length,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logApiError('customization/POST', error)
    return NextResponse.json({ error: 'Failed to save customization' }, { status: 500 })
  }
}

/**
 * DELETE /api/customization
 * Resets customization to defaults. Admin+ only.
 */
export async function DELETE(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    await db.appSetting.deleteMany({ where: { ownerId: user.ownerId, key: 'customization' } })

    await logUserActivity(user, {
      action: 'DELETE',
      entityType: 'setting',
      summary: 'App customization reset to defaults',
    })

    return NextResponse.json({ success: true, customization: DEFAULT_CUSTOMIZATION })
  } catch (error) {
    logApiError('customization/DELETE', error)
    return NextResponse.json({ error: 'Failed to reset customization' }, { status: 500 })
  }
}

export { DEFAULT_CUSTOMIZATION }
