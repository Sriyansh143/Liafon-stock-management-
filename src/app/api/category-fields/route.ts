import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAdmin, logApiError, apiBadRequest, apiNotFound } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const category = request.nextUrl.searchParams.get('category')
    if (category) { const fields = await db.categoryField.findMany({ where: { ownerId: user.ownerId, category: { equals: category, mode: 'insensitive' } }, orderBy: { sortOrder: 'asc' } }); return NextResponse.json({ fields, category }) }
    const result = await db.categoryField.findMany({ where: { ownerId: user.ownerId }, distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } })
    return NextResponse.json({ categories: result.map(r => r.category) })
  } catch (error) { logApiError('category-fields/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { category, fieldName, fieldType, fieldOptions, isRequired, sortOrder } = body
    if (!category || !fieldName) return apiBadRequest('category + fieldName required')
    if (!['text', 'number', 'select', 'date', 'boolean'].includes(fieldType)) return apiBadRequest('Invalid fieldType')
    const field = await db.categoryField.upsert({ where: { ownerId_category_fieldName: { ownerId: user.ownerId, category, fieldName } }, create: { ownerId: user.ownerId, category, fieldName, fieldType, fieldOptions: JSON.stringify(fieldOptions || []), isRequired: isRequired ?? false, sortOrder: sortOrder ?? 0 }, update: { fieldType, fieldOptions: JSON.stringify(fieldOptions || []), isRequired: isRequired ?? false, sortOrder: sortOrder ?? 0 } })
    return NextResponse.json(field, { status: 201 })
  } catch (error) { logApiError('category-fields/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function DELETE(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return apiBadRequest('id required')
    await db.categoryField.deleteMany({ where: { id, ownerId: user.ownerId } })
    return NextResponse.json({ success: true })
  } catch (error) { logApiError('category-fields/DELETE', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
