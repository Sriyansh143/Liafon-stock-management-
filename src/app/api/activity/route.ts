import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardOwner, logApiError } from '@/lib/api-utils'
import type { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardOwner(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50))
    const action = searchParams.get('action')?.trim() || ''
    const entityType = searchParams.get('entityType')?.trim() || ''
    const userId = searchParams.get('userId')?.trim() || ''
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: Prisma.ActivityLogWhereInput = { ownerId: user.ownerId }
    if (action) where.action = action
    if (entityType) where.entityType = entityType
    if (userId) where.userId = userId
    // Date-range filter — essential for audit-log review. Previously
    // the only filters were action/entityType/userId, which made it
    // hard to investigate "what happened yesterday".
    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {}
      if (startDate) {
        const d = new Date(startDate)
        if (!isNaN(d.getTime())) dateFilter.gte = d
      }
      if (endDate) {
        const d = new Date(endDate)
        if (!isNaN(d.getTime())) {
          // Include the entire end-date day
          d.setHours(23, 59, 59, 999)
          dateFilter.lte = d
        }
      }
      where.createdAt = dateFilter
    }

    const [logs, total] = await Promise.all([
      db.activityLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.activityLog.count({ where }),
    ])

    return NextResponse.json({ logs, total, page, limit })
  } catch (error) {
    logApiError('activity/GET', error)
    return NextResponse.json({ error: 'Failed to fetch activity log' }, { status: 500 })
  }
}
