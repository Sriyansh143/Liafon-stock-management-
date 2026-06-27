import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAdmin, logApiError, apiBadRequest, apiNotFound } from '@/lib/api-utils'
import {
  getFieldsForCategory, getCategoriesWithFields,
  upsertCategoryField, deleteCategoryField, type CategoryFieldType,
} from '@/lib/custom-fields'
import { logUserActivity } from '@/lib/activity'

/**
 * /api/category-fields — manage custom fields per part category.
 *
 * GET /api/category-fields?category=<cat>
 *   List fields for a category. If no category provided, returns all categories
 *   that have fields defined.
 *
 * POST /api/category-fields
 *   Create/update a field. Body: { category, fieldName, fieldType, fieldOptions?, isRequired?, sortOrder? }
 *
 * DELETE /api/category-fields?id=<fieldId>
 *   Delete a field (cascades to PartMeta values).
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const category = request.nextUrl.searchParams.get('category')
    if (category) {
      const fields = await getFieldsForCategory(user.ownerId, category)
      return NextResponse.json({ fields, category })
    }
    // No category → list all categories that have fields
    const categories = await getCategoriesWithFields(user.ownerId)
    return NextResponse.json({ categories })
  } catch (error) {
    logApiError('category-fields/GET', error)
    return NextResponse.json({ error: 'Failed to fetch fields' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { category, fieldName, fieldType, fieldOptions, isRequired, sortOrder } = body as {
      category?: string
      fieldName?: string
      fieldType?: CategoryFieldType
      fieldOptions?: string[]
      isRequired?: boolean
      sortOrder?: number
    }

    if (!category) return apiBadRequest('category is required')
    if (!fieldName) return apiBadRequest('fieldName is required')
    if (!fieldType || !['text', 'number', 'select', 'date', 'boolean'].includes(fieldType)) {
      return apiBadRequest('fieldType must be text/number/select/date/boolean')
    }
    if (fieldType === 'select' && (!Array.isArray(fieldOptions) || fieldOptions.length === 0)) {
      return apiBadRequest('fieldOptions (string array) is required for select type')
    }

    const field = await upsertCategoryField(user.ownerId, {
      category, fieldName, fieldType,
      fieldOptions: fieldOptions || [],
      isRequired: isRequired ?? false,
      sortOrder: sortOrder ?? 0,
    })

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'setting',
      entityId: field.id,
      summary: `Custom field "${fieldName}" added to category "${category}"`,
      metadata: { category, fieldName, fieldType },
    })

    return NextResponse.json(field, { status: 201 })
  } catch (error) {
    logApiError('category-fields/POST', error)
    return NextResponse.json({ error: 'Failed to save field' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return apiBadRequest('id query param is required')

    // Verify ownership before deleting
    const existing = await db.categoryField.findFirst({
      where: { id, ownerId: user.ownerId },
      select: { id: true, fieldName: true, category: true },
    })
    if (!existing) return apiNotFound('Field not found')

    await deleteCategoryField(user.ownerId, id)
    await logUserActivity(user, {
      action: 'DELETE',
      entityType: 'setting',
      entityId: id,
      summary: `Custom field "${existing.fieldName}" deleted from category "${existing.category}"`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logApiError('category-fields/DELETE', error)
    return NextResponse.json({ error: 'Failed to delete field' }, { status: 500 })
  }
}
