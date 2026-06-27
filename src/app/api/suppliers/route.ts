import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardManager, apiConflict, logApiError } from '@/lib/api-utils'
import { validate, createSupplierSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')?.trim() || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50))
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const where: Record<string, unknown> = includeInactive ? {} : { isActive: true }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { gstNumber: { contains: search } },
      ]
    }

    const [suppliers, total] = await Promise.all([
      db.supplier.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.supplier.count({ where }),
    ])

    return NextResponse.json({ suppliers, total, page, limit })
  } catch (error) {
    logApiError('suppliers/GET', error)
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(createSupplierSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const supplier = await db.supplier.create({
      data: {
        ownerId: user.ownerId,
        ...result.data,
      },
    })

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'supplier',
      entityId: supplier.id,
      summary: `Supplier added: ${supplier.name}`,
      metadata: { name: supplier.name, phone: supplier.phone },
    })

    return NextResponse.json(supplier, { status: 201 })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return apiConflict('Supplier already exists')
    }
    logApiError('suppliers/POST', error)
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
  }
}
