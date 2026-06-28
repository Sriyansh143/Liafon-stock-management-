import { db } from '@/lib/db'

export function getAuditRetentionDays(): number {
  const raw = parseInt(process.env.AUDIT_RETENTION_DAYS || '365', 10)
  return !Number.isFinite(raw) || raw < 0 ? 365 : raw
}

export async function runAuditRetention(ownerId?: string) {
  const retentionDays = getAuditRetentionDays()
  if (retentionDays === 0) return { deletedCount: 0, cutoff: new Date().toISOString(), retentionDays: 0, enabled: false }
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)
  const where = ownerId ? { ownerId, createdAt: { lt: cutoff } } : { createdAt: { lt: cutoff } }
  const result = await db.activityLog.deleteMany({ where })
  return { deletedCount: result.count, cutoff: cutoff.toISOString(), retentionDays, enabled: true }
}

export async function getAuditLogStats(ownerId?: string) {
  const where = ownerId ? { ownerId } : {}
  const [count, oldest] = await Promise.all([db.activityLog.count({ where }), db.activityLog.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })])
  return { totalLogs: count, oldestLogAt: oldest?.createdAt ?? null, retentionDays: getAuditRetentionDays(), retentionEnabled: getAuditRetentionDays() > 0 }
}
