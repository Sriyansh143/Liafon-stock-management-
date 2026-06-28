import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardOwner, logApiError, apiBadRequest } from '@/lib/api-utils'
import { seedDatabase } from '@/lib/seed'
import { logUserActivity } from '@/lib/activity'

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardOwner(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const action = body.action
    if (!['seed', 'delete_mock'].includes(action)) return apiBadRequest('Invalid action. Use seed or delete_mock.')

    if (action === 'seed') {
      const existingParts = await db.sparePart.count({ where: { ownerId: user.ownerId } })
      if (existingParts > 0) return NextResponse.json({ error: 'Already have parts. Delete demo data first.' }, { status: 400 })
      const counts = await seedDatabase(false)
      await Promise.all([
        db.sparePart.updateMany({ where: { ownerId: 'seed-owner' }, data: { ownerId: user.ownerId } }),
        db.customer.updateMany({ where: { ownerId: 'seed-owner' }, data: { ownerId: user.ownerId } }),
        db.supplier.updateMany({ where: { ownerId: 'seed-owner' }, data: { ownerId: user.ownerId } }),
        db.department.updateMany({ where: { ownerId: 'seed-owner' }, data: { ownerId: user.ownerId } }),
        db.appSetting.updateMany({ where: { ownerId: 'seed-owner' }, data: { ownerId: user.ownerId } }),
        db.sale.updateMany({ where: { ownerId: 'seed-owner' }, data: { ownerId: user.ownerId } }),
        db.purchase.updateMany({ where: { ownerId: 'seed-owner' }, data: { ownerId: user.ownerId } }),
        db.stockLog.updateMany({ where: { ownerId: 'seed-owner' }, data: { ownerId: user.ownerId } }),
      ])
      await logUserActivity(user, { action: 'SEED', entityType: 'system', summary: 'Demo data seeded', metadata: { counts } })
      return NextResponse.json({ success: true, message: 'Demo data seeded', counts })
    }

    if (action === 'delete_mock') {
      const mockOwnerIds = ['seed-owner', 'demo', 'mock']
      const result = await db.$transaction([
        db.stockLog.deleteMany({ where: { ownerId: { in: mockOwnerIds } } }),
        db.sale.deleteMany({ where: { ownerId: { in: mockOwnerIds } } }),
        db.purchase.deleteMany({ where: { ownerId: { in: mockOwnerIds } } }),
        db.batch.deleteMany({ where: { ownerId: { in: mockOwnerIds } } }),
        db.sparePart.deleteMany({ where: { ownerId: { in: mockOwnerIds } } }),
        db.customer.deleteMany({ where: { ownerId: { in: mockOwnerIds } } }),
        db.supplier.deleteMany({ where: { ownerId: { in: mockOwnerIds } } }),
        db.department.deleteMany({ where: { ownerId: { in: mockOwnerIds } } }),
        db.appSetting.deleteMany({ where: { ownerId: { in: mockOwnerIds } } }),
      ])
      const totalDeleted = result.reduce((s, r) => s + r.count, 0)
      await logUserActivity(user, { action: 'DELETE', entityType: 'system', summary: `Deleted ${totalDeleted} mock data rows`, metadata: { totalDeleted } })
      return NextResponse.json({ success: true, message: `Deleted ${totalDeleted} mock rows`, totalDeleted })
    }
    return apiBadRequest('Unknown action')
  } catch (error) { logApiError('mock-data/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
