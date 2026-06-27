import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError, apiConflict } from '@/lib/api-utils'
import { validate, createPartSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'
import type { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')?.trim() || ''
    const category = searchParams.get('category') || ''
    const lowStock = searchParams.get('lowStock') === 'true'
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50))

    // ─── Cursor-based pagination (added for Vercel + scale) ──────────────
    // The legacy `?page=N&limit=M` query uses OFFSET under the hood, which
    // is O(N) on Postgres — bad for 50k+ parts. The new `?cursor=...` mode
    // uses `cursor: { id }` + `take: limit+1` (Prisma idiom) which is O(1).
    //
    // The client passes `?cursor=<lastPartId>` to fetch the next page.
    // We return `nextCursor` in the response — null when there are no more
    // pages. The `hasMore` flag is a convenience for UIs.
    //
    // Both modes coexist for backward compat — `?page=N` still works.
    const cursor = searchParams.get('cursor') || ''

    const where: Prisma.SparePartWhereInput = {}
    if (!includeInactive) where.isActive = true
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { partNumber: { contains: search } },
        { brand: { contains: search } },
        { vehicleModel: { contains: search } },
      ]
    }
    if (category && category !== 'all') {
      where.category = category
    }

    // ─── Cursor-based fast path (preferred for large tables) ─────────────
    if (cursor && !lowStock) {
      const parts = await db.sparePart.findMany({
        where,
        orderBy: { id: 'asc' },
        take: limit + 1,
        cursor: { id: cursor },
        skip: 1,   // Skip the cursor row itself
      })
      const hasMore = parts.length > limit
      const sliced = hasMore ? parts.slice(0, limit) : parts
      const nextCursor = hasMore ? sliced[sliced.length - 1].id : null
      const total = await db.sparePart.count({ where })
      return NextResponse.json({
        parts: sliced,
        total,
        limit,
        cursor,
        nextCursor,
        hasMore,
      })
    }

    // SQLite can't compare two columns directly in a WHERE clause.
    // For low-stock filtering we fetch the candidate page of parts then
    // filter in JS. If lowStock is false we use the standard fast path.
    if (lowStock) {
      // Fetch a larger candidate set (capped) and filter, then paginate.
      // This keeps the page correct without raw SQL.
      const candidates = await db.sparePart.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 1000,
      })
      const filtered = candidates.filter(
        (p) => p.currentStock <= p.minStockLevel
      )
      const total = filtered.length
      const parts = filtered.slice((page - 1) * limit, page * limit)
      return NextResponse.json({ parts, total, page, limit, hasMore: (page - 1) * limit + parts.length < total })
    }

    const [parts, total] = await Promise.all([
      db.sparePart.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.sparePart.count({ where }),
    ])

    return NextResponse.json({ parts, total, page, limit, hasMore: (page - 1) * limit + parts.length < total })
  } catch (error) {
    logApiError('parts/GET', error)
    return NextResponse.json({ error: 'Failed to fetch parts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    // ── Storage limit check: prevent free-tier users from exceeding limits ──
    const { checkStorageLimit } = await import('@/lib/plan-limits')
    const partLimit = await checkStorageLimit(user.ownerId, 'parts')
    if (!partLimit.allowed) {
      return NextResponse.json(
        { error: partLimit.message, upgradeRequired: true, code: 'STORAGE_LIMIT_EXCEEDED', current: partLimit.current, limit: partLimit.limit },
        { status: 402 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(createPartSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    const data = result.data

    const part = await db.sparePart.create({      data: {
        ownerId: user.ownerId,
        partNumber: data.partNumber,
        name: data.name,
        category: data.category,
        brand: data.brand,
        vehicleModel: data.vehicleModel,
        description: data.description,
        costPrice: data.costPrice,
        sellingPrice: data.sellingPrice,
        currentStock: data.currentStock,
        minStockLevel: data.minStockLevel,
        location: data.location,
        currency: process.env.DEFAULT_CURRENCY || 'INR',
      },
    })

    if (part.currentStock > 0) {
      await db.stockLog.create({        data: {
          ownerId: user.ownerId,
          partId: part.id,
          type: 'ADJUSTMENT',
          quantity: part.currentStock,
          previousStock: 0,
          newStock: part.currentStock,
          referenceId: part.id,
          notes: 'Initial stock on creation',
        },
      })
    }

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'part',
      entityId: part.id,
      summary: `New part added: ${part.name} (${part.partNumber})`,
      metadata: {
        ownerId: user.ownerId,
        partNumber: part.partNumber,
        name: part.name,
        category: part.category,
        initialStock: part.currentStock,
      },
    })

    return NextResponse.json(part, { status: 201 })
  } catch (error) {
    // Prisma P2002 = unique constraint violation
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return apiConflict('Part number already exists')
    }
    logApiError('parts/POST', error)
    return NextResponse.json({ error: 'Failed to create part' }, { status: 500 })
  }
}
