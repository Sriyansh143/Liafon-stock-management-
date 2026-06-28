import { db } from '@/lib/db'
import type { SessionUser } from '@/lib/auth'
import type { NextRequest } from 'next/server'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActivityAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'BACKUP'
  | 'RESTORE'
  | 'IMPORT'
  | 'EXPORT'
  | 'STOCK_ADJUST'
  | 'SEED'

export type ActivityEntity =
  | 'user'
  | 'part'
  | 'sale'
  | 'purchase'
  | 'department'
  | 'customer'
  | 'supplier'
  | 'backup'
  | 'setting'
  | 'system'
  | 'whatsapp'

export interface ActivityEntry {
  userId?: string | null
  ownerId?: string
  action: ActivityAction
  entityType: ActivityEntity
  entityId?: string
  summary: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

// ─── Logger ─────────────────────────────────────────────────────────────────

/**
 * Persist an activity log entry. Non-blocking: errors are swallowed so
 * the calling request never fails because of a logging issue.
 */
export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        ownerId: entry.ownerId || '',
        userId: entry.userId || null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId || '',
        summary: entry.summary,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : '{}',
        ipAddress: entry.ipAddress || '',
      },
    })
  } catch (err) {
    // Logging is best-effort; never fail the request because of it.
    console.error('[activity] Failed to log activity:', err)
  }
}

/**
 * Convenience wrapper that takes a SessionUser directly.
 */
export async function logUserActivity(
  user: SessionUser | null | undefined,
  entry: Omit<ActivityEntry, 'userId'>
): Promise<void> {
  return logActivity({ ...entry, userId: user?.id })
}

// ─── IP Address Helper ──────────────────────────────────────────────────────

/**
 * Extract the client IP from a request, handling Vercel proxy headers.
 * Falls back to '127.0.0.1' if no headers are found (prevents empty
 * string hashing issues in IP duplicate detection).
 */
export function getClientIP(request?: Request | NextRequest): string {
  if (!request) return '127.0.0.1'
  const headers = new Headers(request.headers)
  return (
    headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}
