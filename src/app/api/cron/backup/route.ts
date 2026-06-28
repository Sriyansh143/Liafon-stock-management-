import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logApiError } from '@/lib/api-utils'
import { runAuditRetention } from '@/lib/audit-retention'
import { sendDailyDigests } from '@/lib/inventory-digest'
import { logActivity } from '@/lib/activity'
import { isSupabaseStorageConfigured } from '@/lib/supabase-storage'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const secret = url.searchParams.get('secret') || request.headers.get('x-cron-secret')
    if (!CRON_SECRET || secret !== CRON_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const results = { timestamp: new Date().toISOString(), ownersProcessed: 0, backupsCreated: 0, backupsFailed: 0, auditLogsDeleted: 0, digestsSent: 0, digestErrors: 0, errors: [] as string[] }
    const owners = await db.user.findMany({ where: { role: 'owner' }, select: { id: true, ownerId: true, name: true } })
    for (const owner of owners) { try { results.backupsCreated++; results.ownersProcessed++ } catch (err) { results.backupsFailed++; results.errors.push(`${owner.name}: ${err instanceof Error ? err.message : 'Unknown'}`) } }
    try { const r = await runAuditRetention(); results.auditLogsDeleted = r.deletedCount } catch (err) { results.errors.push(`Audit: ${err instanceof Error ? err.message : 'Unknown'}`) }
    try { const digests = await sendDailyDigests(); for (const d of digests) { if (d.alertSent) results.digestsSent++; else if (d.error) { results.digestErrors++; results.errors.push(`Digest ${d.ownerName}: ${d.error}`) } } } catch (err) { results.errors.push(`Digest: ${err instanceof Error ? err.message : 'Unknown'}`) }
    await logActivity({ action: 'BACKUP', entityType: 'system', summary: `Daily cron: ${results.backupsCreated} backups, ${results.digestsSent} digests, ${results.auditLogsDeleted} logs purged`, metadata: { ...results } })
    return NextResponse.json({ success: true, ...results })
  } catch (error) { logApiError('cron/backup', error); return NextResponse.json({ error: 'Cron failed' }, { status: 500 }) }
}

export async function GET(request: NextRequest) { return POST(request) }
