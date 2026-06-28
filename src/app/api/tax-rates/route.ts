import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAdmin, logApiError } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const rates = await db.taxRate.findMany({ where: { ownerId: user.ownerId }, orderBy: { category: 'asc' } })
    return NextResponse.json({ rates, total: rates.length })
  } catch (error) { logApiError('tax-rates/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { category, rate, hsnCode, description, isActive } = body
    if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })
    const taxRate = await db.taxRate.upsert({ where: { ownerId_category: { ownerId: user.ownerId, category } }, create: { ownerId: user.ownerId, category, rate: rate || 0, hsnCode: hsnCode || '', description: description || '', isActive: isActive ?? true }, update: { rate: rate || 0, hsnCode: hsnCode || '', description: description || '', isActive: isActive ?? true } })
    await logUserActivity(user, { action: 'CREATE', entityType: 'setting', entityId: taxRate.id, summary: `Tax rate: ${category} = ${rate}%`, metadata: { category, rate } })
    return NextResponse.json(taxRate, { status: 201 })
  } catch (error) { logApiError('tax-rates/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
