import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardManager, logApiError } from '@/lib/api-utils'
import { validate, createDepartmentSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const departments = await db.department.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(departments)
  } catch (error) {
    logApiError('departments/GET', error)
    return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(createDepartmentSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    const { name, phone, role, email } = result.data

    const dept = await db.department.create({      data: {
        ownerId: user.ownerId,
        name,
        phone: phone.replace(/[^0-9]/g, ''),
        role: role || 'general',
        email: email || '',
      },
    })

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'department',
      entityId: dept.id,
      summary: `Department created: ${dept.name} (${dept.phone})`,
      metadata: { name: dept.name, phone: dept.phone, role: dept.role },
    })

    return NextResponse.json(dept, { status: 201 })
  } catch (error) {
    logApiError('departments/POST', error)
    return NextResponse.json({ error: 'Failed to create department' }, { status: 500 })
  }
}
