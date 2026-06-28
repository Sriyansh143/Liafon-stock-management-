import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, apiNotFound, apiConflict, logApiError } from '@/lib/api-utils'
import { validate, updatePartSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'
import type { Prisma } from '@prisma/client'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    const { id } = await params
    const part = await db.sparePart.findFirst({
      where: { id, ownerId: user.ownerId },
      include: {
        sales: { orderBy: { createdAt: 'desc' }, take: 10 },
        purchases: { orderBy: { createdAt: 'desc' }, take: 10 },
        stockLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
    if (!part) return apiNotFound('Part not found')
    return NextResponse.json(part)
  } catch (error) {
    logApiError('parts/[id]/GET', error)
    return NextResponse.json({ error: 'Failed to fetch part' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(updatePartSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Filter out undefined values so we don't accidentally null fields
    const updateData: Prisma.SparePartUpdateInput = Object.fromEntries(
      Object.entries(result.data).filter(([, v]) => v !== undefined)
    )

    // Verify the part exists before updating (Prisma P2025 → 404 fallback)
    const existing = await db.sparePart.findFirst({ where: { id, ownerId: user.ownerId } })
    if (!existing) return apiNotFound('Part not found')

    // Note: we intentionally don't pre-check partNumber uniqueness here.
    // Two concurrent PUTs could both pass a pre-check and one would hit
    // the P2002 catch below — the catch handles it correctly. Skipping
    // the pre-check saves a query in the common case.

    const part = await db.sparePart.update({
      where: { id, ownerId: user.ownerId },
      data: updateData,
    })

    await logUserActivity(user, {
      action: 'UPDATE',
      entityType: 'part',
      entityId: id,
      summary: `Part updated: ${part.name} (${part.partNumber})`,
      metadata: { partNumber: part.partNumber, changedFields: Object.keys(updateData) },
    })

    return NextResponse.json(part)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return apiNotFound('Part not found')
    }
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return apiConflict('Part number already in use by another part')
    }
    logApiError('parts/[id]/PUT', error)
    return NextResponse.json({ error: 'Failed to update part' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    const { id } = await params
    const existing = await db.sparePart.findFirst({ where: { id, ownerId: user.ownerId } })
    if (!existing) return apiNotFound('Part not found')

    // Soft-delete by deactivating, so historical sales/purchases keep their FK
    await db.sparePart.update({
      where: { id, ownerId: user.ownerId },
      data: { isActive: false },
    })

    await logUserActivity(user, {
      action: 'DELETE',
      entityType: 'part',
      entityId: id,
      summary: `Part deactivated: ${existing.name} (${existing.partNumber})`,
      metadata: { partNumber: existing.partNumber },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return apiNotFound('Part not found')
    }
    logApiError('parts/[id]/DELETE', error)
    return NextResponse.json({ error: 'Failed to delete part' }, { status: 500 })
  }
}
