import { NextRequest, NextResponse } from 'next/server'
import { guardOwner, logApiError } from '@/lib/api-utils'
import { runAuditRetention, getAuditLogStats } from '@/lib/audit-retention'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardOwner(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const stats = await getAuditLogStats(user.ownerId)
    return NextResponse.json({ success: true, ...stats })
  } catch (error) { logApiError('audit/cleanup/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardOwner(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const result = await runAuditRetention(user.ownerId)
    await logUserActivity(user, { action: 'DELETE', entityType: 'system', summary: `Audit cleanup: ${result.deletedCount} logs purged`, metadata: { ...result } })
    return NextResponse.json({ success: true, ...result })
  } catch (error) { logApiError('audit/cleanup/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
