import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logApiError } from '@/lib/api-utils'
import { runAuditRetention } from '@/lib/audit-retention'
import { isSupabaseStorageConfigured } from '@/lib/supabase-storage'
import { sendDailyDigests } from '@/lib/inventory-digest'
import { logActivity } from '@/lib/activity'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

/**
 * Vercel Cron endpoint — runs daily:
 *   1. Auto-backup for all owners (uploaded to Supabase Storage)
 *   2. Audit log retention cleanup
 *   3. Low-stock + near-expiry WhatsApp/email digest per owner
 *
 * Schedule: "0 23 * * *" (daily at 23:00 UTC) — configured in vercel.json.
 * SECURITY: Protected by CRON_SECRET.
 */

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(request: NextRequest) {
  try {
    // ─── Auth check ────────────────────────────────────────────────────
    const url = new URL(request.url)
    const secret = url.searchParams.get('secret') || request.headers.get('x-cron-secret')
    if (!CRON_SECRET || secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results = {
      timestamp: new Date().toISOString(),
      ownersProcessed: 0,
      backupsCreated: 0,
      backupsFailed: 0,
      auditLogsDeleted: 0,
      supabaseStorageEnabled: isSupabaseStorageConfigured(),
      digestsSent: 0,
      digestErrors: 0,
      errors: [] as string[],
    }

    // ─── 1. Daily backup for all owners ────────────────────────────────
    const owners = await db.user.findMany({
      where: { role: 'owner' },
      select: { id: true, ownerId: true, name: true },
    })

    const { handleBackupCronInternal } = await import('@/app/api/backup/_cron-handler')
    for (const owner of owners) {
      try {
        await handleBackupCronInternal('full', owner.ownerId || owner.id, owner.name)
        results.backupsCreated++
        results.ownersProcessed++
      } catch (err) {
        results.backupsFailed++
        results.errors.push(`Owner ${owner.name}: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }

    // ─── 2. Audit log retention ───────────────────────────────────────
    try {
      const retentionResult = await runAuditRetention()
      results.auditLogsDeleted = retentionResult.deletedCount
    } catch (err) {
      results.errors.push(`Audit retention: ${err instanceof Error ? err.message : 'Unknown'}`)
    }

    // ─── 3. Low-stock + near-expiry digest (Phase 4 quick-win) ────────
    try {
      const digests = await sendDailyDigests()
      for (const d of digests) {
        if (d.alertSent) results.digestsSent++
        else if (d.error) {
          results.digestErrors++
          results.errors.push(`Digest ${d.ownerName}: ${d.error}`)
        }
      }
    } catch (err) {
      results.errors.push(`Digest: ${err instanceof Error ? err.message : 'Unknown'}`)
    }

    // ─── 4. Log the cron run ──────────────────────────────────────────
    await logActivity({
      action: 'BACKUP',
      entityType: 'system',
      summary: `Daily cron: ${results.backupsCreated} backups, ${results.digestsSent} digests, ${results.auditLogsDeleted} logs purged`,
      metadata: { ...results },
    })

    return NextResponse.json({ success: true, ...results })
  } catch (error) {
    logApiError('cron/backup', error)
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}

// Vercel Cron sends GET requests by default (configurable). Support both.
export async function GET(request: NextRequest) {
  return POST(request)
}
