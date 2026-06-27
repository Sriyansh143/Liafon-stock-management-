import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardOwner, logApiError } from '@/lib/api-utils'
import { runAuditRetention, getAuditLogStats } from '@/lib/audit-retention'
import { logUserActivity } from '@/lib/activity'

/**
 * /api/audit/cleanup — owner-only audit log management.
 *
 * GET  /api/audit/cleanup                  — return stats (total logs, oldest, retention days)
 * POST /api/audit/cleanup                  — run retention now (deletes old logs)
 *
 * The cleanup is also run automatically by the daily Vercel Cron job
 * (see /api/cron/backup). This endpoint lets the owner trigger it manually
 * or check the current state.
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardOwner(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const stats = await getAuditLogStats(user.ownerId)
    return NextResponse.json({ success: true, ...stats })
  } catch (error) {
    logApiError('audit/cleanup/GET', error)
    return NextResponse.json({ error: 'Failed to fetch audit stats' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardOwner(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const result = await runAuditRetention(user.ownerId)

    await logUserActivity(user, {
      action: 'DELETE',
      entityType: 'system',
      summary: `Audit log cleanup: ${result.deletedCount} logs older than ${result.retentionDays} days deleted`,
      metadata: { ...result },
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    logApiError('audit/cleanup/POST', error)
    return NextResponse.json({ error: 'Failed to run audit cleanup' }, { status: 500 })
  }
}
