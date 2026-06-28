import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, logApiError, apiBadRequest, apiNotFound } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const partId = request.nextUrl.searchParams.get('partId')
    const activeOnly = request.nextUrl.searchParams.get('active') === 'true'
    await db.stockReservation.updateMany({ where: { ownerId: user.ownerId, isActive: true, expiresAt: { lt: new Date() } }, data: { isActive: false } })
    const where: Record<string, unknown> = { ownerId: user.ownerId }
    if (partId) where.partId = partId
    if (activeOnly) where.isActive = true
    const reservations = await db.stockReservation.findMany({ where, include: { part: { select: { name: true, partNumber: true, currentStock: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
    return NextResponse.json({ reservations, total: reservations.length })
  } catch (error) { logApiError('stock-reservation/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { partId, quantity, reason, hours } = body
    if (!partId) return apiBadRequest('partId required')
    if (!quantity || quantity <= 0) return apiBadRequest('quantity must be positive')
    const part = await db.sparePart.findFirst({ where: { id: partId, ownerId: user.ownerId } })
    if (!part) return apiNotFound('Part not found')
    const activeReservations = await db.stockReservation.aggregate({ where: { partId, ownerId: user.ownerId, isActive: true }, _sum: { quantity: true } })
    const reservedQty = activeReservations._sum.quantity ?? 0
    const availableQty = part.currentStock - reservedQty
    if (quantity > availableQty) return NextResponse.json({ error: `Cannot reserve ${quantity}. Available: ${availableQty}` }, { status: 400 })
    const expiresAt = new Date(); expiresAt.setHours(expiresAt.getHours() + (hours || 24))
    const reservation = await db.stockReservation.create({ data: { ownerId: user.ownerId, partId, quantity, reservedBy: user.id, reason: reason || '', expiresAt } })
    await logUserActivity(user, { action: 'CREATE', entityType: 'part', entityId: partId, summary: `Reserved ${quantity} × ${part.name} for ${hours || 24}h`, metadata: { reservationId: reservation.id, partId, quantity } })
    return NextResponse.json(reservation, { status: 201 })
  } catch (error) { logApiError('stock-reservation/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function DELETE(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return apiBadRequest('id required')
    const reservation = await db.stockReservation.findFirst({ where: { id, ownerId: user.ownerId } })
    if (!reservation) return apiNotFound('Reservation not found')
    await db.stockReservation.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch (error) { logApiError('stock-reservation/DELETE', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
