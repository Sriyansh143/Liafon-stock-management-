import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, logApiError, apiBadRequest } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

/**
 * /api/parts/[id]/alternatives — manage interchangeable part numbers.
 *
 * GET    /api/parts/[id]/alternatives
 *   Returns all alternatives for the part (with their stock + price).
 *
 * POST   /api/parts/[id]/alternatives  body: { alternativePartId, reason? }
 *   Marks another part as an alternative. Used when a part is out of stock —
 *   the UI shows alternatives so the customer can substitute.
 *
 * DELETE /api/parts/[id]/alternatives?alternativePartId=<id>
 *   Removes an alternative link.
 *
 * ─── Why this matters for auto-parts ──────────────────────────────────────
 * OEM cross-referencing is the bread-and-butter of auto-parts shops.
 * One brake pad (e.g. Brembo P12345) might be interchangeable with:
 *   - Bosch B67890 (different brand, same fitment)
 *   - OEM 45678-XYZ (genuine part from the vehicle manufacturer)
 *   - Aftermarket XYZ-789 (cheaper alternative)
 *
 * When a customer asks for a part that's out of stock, the salesperson
 * can immediately suggest alternatives — no missed sales.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: partId } = await params
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    // Verify the part belongs to the owner
    const part = await db.sparePart.findFirst({
      where: { id: partId, ownerId: user.ownerId },
      select: { id: true },
    })
    if (!part) return NextResponse.json({ error: 'Part not found' }, { status: 404 })

    // Fetch all alternatives (both directions — if A is alternative to B,
    // then B is also alternative to A for browsing purposes)
    const [fromAlts, toAlts] = await Promise.all([
      db.partAlternative.findMany({
        where: { partId, ownerId: user.ownerId },
        include: {
          alternativePart: {
            select: {
              id: true, partNumber: true, name: true, brand: true,
              currentStock: true, sellingPrice: true, costPrice: true,
              isActive: true, shopId: true,
              shop: { select: { name: true } },
            },
          },
        },
      }),
      db.partAlternative.findMany({
        where: { alternativePartId: partId, ownerId: user.ownerId },
        include: {
          part: {
            select: {
              id: true, partNumber: true, name: true, brand: true,
              currentStock: true, sellingPrice: true, costPrice: true,
              isActive: true, shopId: true,
              shop: { select: { name: true } },
            },
          },
        },
      }),
    ])

    // Merge + dedupe
    const alternatives = [
      ...fromAlts.map((a) => ({ ...a.alternativePart, reason: a.reason, linkId: a.id })),
      ...toAlts.map((a) => ({ ...a.part, reason: a.reason, linkId: a.id })),
    ]

    return NextResponse.json({ alternatives, total: alternatives.length })
  } catch (error) {
    logApiError('parts/[id]/alternatives/GET', error)
    return NextResponse.json({ error: 'Failed to fetch alternatives' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: partId } = await params
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { alternativePartId, reason } = body as { alternativePartId?: string; reason?: string }
    if (!alternativePartId) return apiBadRequest('alternativePartId is required')
    if (alternativePartId === partId) return apiBadRequest('A part cannot be its own alternative')

    // Verify both parts belong to the owner
    const [part1, part2] = await Promise.all([
      db.sparePart.findFirst({ where: { id: partId, ownerId: user.ownerId }, select: { id: true, name: true } }),
      db.sparePart.findFirst({ where: { id: alternativePartId, ownerId: user.ownerId }, select: { id: true, name: true } }),
    ])
    if (!part1) return NextResponse.json({ error: 'Part not found' }, { status: 404 })
    if (!part2) return NextResponse.json({ error: 'Alternative part not found' }, { status: 404 })

    // Upsert (idempotent — if link already exists, update the reason).
    // Note: the unique constraint is on [partId, alternativePartId] (no ownerId).
    // We add ownerId to the where filter below to keep multi-tenant isolation.
    const existing = await db.partAlternative.findFirst({
      where: { ownerId: user.ownerId, partId, alternativePartId },
    })

    let link
    if (existing) {
      link = await db.partAlternative.update({
        where: { id: existing.id },
        data: { reason: reason || '' },
      })
    } else {
      link = await db.partAlternative.create({
        data: {
          ownerId: user.ownerId,
          partId,
          alternativePartId,
          reason: reason || '',
        },
      })
    }

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'part',
      entityId: partId,
      summary: `Linked alternative: ${part1.name} ↔ ${part2.name}${reason ? ` (${reason})` : ''}`,
      metadata: { partId, alternativePartId, reason },
    })

    return NextResponse.json(link, { status: 201 })
  } catch (error) {
    logApiError('parts/[id]/alternatives/POST', error)
    return NextResponse.json({ error: 'Failed to link alternative' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: partId } = await params
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const alternativePartId = searchParams.get('alternativePartId')
    if (!alternativePartId) return apiBadRequest('alternativePartId query param is required')

    // Delete in both directions
    await db.partAlternative.deleteMany({
      where: {
        ownerId: user.ownerId,
        OR: [
          { partId, alternativePartId },
          { partId: alternativePartId, alternativePartId: partId },
        ],
      },
    })

    await logUserActivity(user, {
      action: 'DELETE',
      entityType: 'part',
      entityId: partId,
      summary: `Removed alternative link`,
      metadata: { partId, alternativePartId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logApiError('parts/[id]/alternatives/DELETE', error)
    return NextResponse.json({ error: 'Failed to remove alternative' }, { status: 500 })
  }
}
