import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, apiConflict, logApiError } from '@/lib/api-utils'
import { validate, createCustomerSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
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
      ]
    }

    const [customers, total] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.customer.count({ where }),
    ])

    return NextResponse.json({ customers, total, page, limit })
  } catch (error) {
    logApiError('customers/GET', error)
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(createCustomerSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const customer = await db.customer.create({
      data: {
        ownerId: user.ownerId,
        ...result.data,
      },
    })

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'customer',
      entityId: customer.id,
      summary: `Customer added: ${customer.name}`,
      metadata: { name: customer.name, phone: customer.phone },
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return apiConflict('Customer already exists')
    }
    logApiError('customers/POST', error)
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }
}
