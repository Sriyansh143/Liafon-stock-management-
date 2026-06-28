import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, logApiError, apiBadRequest } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: partId } = await params
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const part = await db.sparePart.findFirst({ where: { id: partId, ownerId: user.ownerId }, select: { id: true } })
    if (!part) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const [fromAlts, toAlts] = await Promise.all([
      db.partAlternative.findMany({ where: { partId, ownerId: user.ownerId }, include: { alternativePart: { select: { id: true, partNumber: true, name: true, brand: true, currentStock: true, sellingPrice: true, isActive: true, shopId: true, shop: { select: { name: true } } } } } }),
      db.partAlternative.findMany({ where: { alternativePartId: partId, ownerId: user.ownerId }, include: { part: { select: { id: true, partNumber: true, name: true, brand: true, currentStock: true, sellingPrice: true, isActive: true, shopId: true, shop: { select: { name: true } } } } } }),
    ])
    const alternatives = [...fromAlts.map(a => ({ ...a.alternativePart, reason: a.reason, linkId: a.id })), ...toAlts.map(a => ({ ...a.part, reason: a.reason, linkId: a.id }))]
    return NextResponse.json({ alternatives, total: alternatives.length })
  } catch (error) { logApiError('parts/[id]/alternatives/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: partId } = await params
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { alternativePartId, reason } = body
    if (!alternativePartId) return apiBadRequest('alternativePartId required')
    if (alternativePartId === partId) return apiBadRequest('Cannot be own alternative')
    const [p1, p2] = await Promise.all([db.sparePart.findFirst({ where: { id: partId, ownerId: user.ownerId }, select: { id: true, name: true } }), db.sparePart.findFirst({ where: { id: alternativePartId, ownerId: user.ownerId }, select: { id: true, name: true } })])
    if (!p1 || !p2) return NextResponse.json({ error: 'Part not found' }, { status: 404 })
    const existing = await db.partAlternative.findFirst({ where: { ownerId: user.ownerId, partId, alternativePartId } })
    let link
    if (existing) link = await db.partAlternative.update({ where: { id: existing.id }, data: { reason: reason || '' } })
    else link = await db.partAlternative.create({ data: { ownerId: user.ownerId, partId, alternativePartId, reason: reason || '' } })
    await logUserActivity(user, { action: 'CREATE', entityType: 'part', entityId: partId, summary: `Linked: ${p1.name} ↔ ${p2.name}`, metadata: { partId, alternativePartId } })
    return NextResponse.json(link, { status: 201 })
  } catch (error) { logApiError('parts/[id]/alternatives/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: partId } = await params
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const alternativePartId = request.nextUrl.searchParams.get('alternativePartId')
    if (!alternativePartId) return apiBadRequest('alternativePartId required')
    await db.partAlternative.deleteMany({ where: { ownerId: user.ownerId, OR: [{ partId, alternativePartId }, { partId: alternativePartId, alternativePartId: partId }] } })
    return NextResponse.json({ success: true })
  } catch (error) { logApiError('parts/[id]/alternatives/DELETE', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
