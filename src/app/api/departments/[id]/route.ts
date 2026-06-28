import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardManager, apiNotFound, logApiError } from '@/lib/api-utils'
import { validate, updateDepartmentSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    const { id } = await params
    const dept = await db.department.findFirst({ where: { id, ownerId: user.ownerId } })
    if (!dept) return apiNotFound('Department not found')
    return NextResponse.json(dept)
  } catch (error) {
    logApiError('departments/[id]/GET', error)
    return NextResponse.json({ error: 'Failed to fetch department' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(updateDepartmentSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const existing = await db.department.findFirst({ where: { id, ownerId: user.ownerId } })
    if (!existing) return apiNotFound('Department not found')

    const updateData: Record<string, unknown> = {}
    if (result.data.name !== undefined) updateData.name = result.data.name
    if (result.data.phone !== undefined)
      updateData.phone = result.data.phone.replace(/[^0-9]/g, '')
    if (result.data.role !== undefined) updateData.role = result.data.role
    if (result.data.email !== undefined) updateData.email = result.data.email
    if (result.data.isActive !== undefined) updateData.isActive = result.data.isActive

    const dept = await db.department.update({
      where: { id },
      data: updateData,
    })

    await logUserActivity(user, {
      action: 'UPDATE',
      entityType: 'department',
      entityId: id,
      summary: `Department updated: ${dept.name}`,
      metadata: { changedFields: Object.keys(updateData) },
    })

    return NextResponse.json(dept)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return apiNotFound('Department not found')
    }
    logApiError('departments/[id]/PUT', error)
    return NextResponse.json({ error: 'Failed to update department' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    const { id } = await params
    const existing = await db.department.findFirst({ where: { id, ownerId: user.ownerId } })
    if (!existing) return apiNotFound('Department not found')

    await db.department.update({
      where: { id },
      data: { isActive: false },
    })

    await logUserActivity(user, {
      action: 'DELETE',
      entityType: 'department',
      entityId: id,
      summary: `Department deactivated: ${existing.name}`,
      metadata: { name: existing.name },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return apiNotFound('Department not found')
    }
    logApiError('departments/[id]/DELETE', error)
    return NextResponse.json({ error: 'Failed to delete department' }, { status: 500 })
  }
}
