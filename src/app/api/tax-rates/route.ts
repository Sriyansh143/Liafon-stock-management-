import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAdmin, logApiError } from '@/lib/api-utils'
import { validate, createTaxRateSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'

/**
 * /api/tax-rates — CRUD for the TaxRate catalog (per-category GST rates).
 *
 * GET    /api/tax-rates                 — list all rates for the owner
 * POST   /api/tax-rates { category, rate, hsnCode, ... }  — create a new rate
 *
 * Each owner can have one rate per category (unique constraint in schema).
 * When a sale is created without an explicit taxRate, the API auto-looks
 * up the part's category here.
 *
 * Update + Delete live at /api/tax-rates/[id]/route.ts (NOT yet implemented
 * — for now, delete + recreate if you need to change a rate).
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const rates = await db.taxRate.findMany({
      where: { ownerId: user.ownerId },
      orderBy: { category: 'asc' },
    })

    return NextResponse.json({ rates, total: rates.length })
  } catch (error) {
    logApiError('tax-rates/GET', error)
    return NextResponse.json({ error: 'Failed to fetch tax rates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(createTaxRateSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    const { category, rate, hsnCode, description, isActive } = result.data

    // Upsert — if a rate for this category already exists, update it
    const taxRate = await db.taxRate.upsert({
      where: { ownerId_category: { ownerId: user.ownerId, category } },
      create: {
        ownerId: user.ownerId,
        category,
        rate,
        hsnCode,
        description,
        isActive,
      },
      update: {
        rate,
        hsnCode,
        description,
        isActive,
      },
    })

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'setting',
      entityId: taxRate.id,
      summary: `Tax rate set: ${category} = ${rate}%`,
      metadata: { category, rate, hsnCode },
    })

    return NextResponse.json(taxRate, { status: 201 })
  } catch (error) {
    logApiError('tax-rates/POST', error)
    return NextResponse.json({ error: 'Failed to save tax rate' }, { status: 500 })
  }
}
