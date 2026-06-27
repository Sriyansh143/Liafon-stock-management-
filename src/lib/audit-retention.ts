/**
 * Audit log retention policy.
 *
 * Without a retention policy, the `ActivityLog` table grows forever.
 * On Vercel + Supabase free tier (500 MB), a busy shop can fill the
 * database in months. This module provides:
 *
 *   - `runAuditRetention(ownerId?)` — Delete logs older than the
 *     configured retention window. Idempotent + safe to call from a cron.
 *   - `getAuditRetentionDays()` — Read the configured retention (env-driven).
 *
 * The retention window is configured via the `AUDIT_RETENTION_DAYS` env var
 * (default: 365). Set to 0 to disable retention (keep forever).
 *
 * On Vercel, this is triggered by the same Vercel Cron that triggers
 * daily backups — see `src/app/api/cron/backup/route.ts`.
 */

import { db } from '@/lib/db'

/** Read the retention window from env. Returns 0 if retention is disabled. */
export function getAuditRetentionDays(): number {
  const raw = parseInt(process.env.AUDIT_RETENTION_DAYS || '365', 10)
  if (!Number.isFinite(raw) || raw < 0) return 365
  return raw
}

export interface RetentionResult {
  /** Number of logs deleted. */
  deletedCount: number
  /** ISO timestamp of the cutoff (logs older than this were deleted). */
  cutoff: string
  /** Retention window in days. */
  retentionDays: number
  /** Whether retention is enabled (false if retentionDays === 0). */
  enabled: boolean
}

/**
 * Delete activity logs older than the retention window.
 *
 * @param ownerId  Optional — if provided, only delete logs for that owner.
 *                 If omitted, deletes logs for ALL owners (used by the cron).
 *
 * Uses `deleteMany` with a single WHERE clause — no cursor, no batching.
 * For most SMBs this is fine (the table rarely exceeds 1M rows). For
 * very large tables, consider Prisma's cursor-based deletion in batches
 * of 10k to avoid long-running transactions.
 */
export async function runAuditRetention(ownerId?: string): Promise<RetentionResult> {
  const retentionDays = getAuditRetentionDays()

  if (retentionDays === 0) {
    return {
      deletedCount: 0,
      cutoff: new Date().toISOString(),
      retentionDays: 0,
      enabled: false,
    }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)

  const where = ownerId
    ? { ownerId, createdAt: { lt: cutoff } }
    : { createdAt: { lt: cutoff } }

  const result = await db.activityLog.deleteMany({ where })

  return {
    deletedCount: result.count,
    cutoff: cutoff.toISOString(),
    retentionDays,
    enabled: true,
  }
}

/**
 * Get a summary of audit log storage stats — useful for the Settings page
 * to show "X total logs, Y MB, oldest log: Z".
 */
export async function getAuditLogStats(ownerId?: string) {
  const where = ownerId ? { ownerId } : {}
  const [count, oldest] = await Promise.all([
    db.activityLog.count({ where }),
    db.activityLog.findFirst({
      where,
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ])

  return {
    totalLogs: count,
    oldestLogAt: oldest?.createdAt ?? null,
    retentionDays: getAuditRetentionDays(),
    retentionEnabled: getAuditRetentionDays() > 0,
  }
}
