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
 *
 * Header priority (most → least reliable on Vercel):
 *   1. x-vercel-forwarded-for   — Vercel's preferred header
 *   2. x-forwarded-for          — Standard proxy header (CDNs, nginx)
 *   3. x-real-ip                — Nginx / Cloudflare
 *   4. request.ip               — Next.js built-in (Vercel Edge runtime)
 *   5. '127.0.0.1'              — Ultimate fallback
 */
export function getClientIP(request?: Request | NextRequest): string {
  if (!request) return '127.0.0.1'
  const headers = new Headers(request.headers)

  // 1. Vercel's preferred header (most reliable on Vercel)
  const vercelFwd = headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  if (vercelFwd) return vercelFwd

  // 2. Standard proxy header (most common across CDNs)
  const xFwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (xFwd) return xFwd

  // 3. Nginx / Cloudflare
  const xRealIp = headers.get('x-real-ip')
  if (xRealIp) return xRealIp

  // 4. Next.js built-in IP (works on Vercel Edge runtime).
  //    `request.ip` exists on NextRequest at runtime but is NOT part of
  //    the standard Request type, so TypeScript can't narrow it via
  //    `'ip' in request` alone (it infers the property as `{}`).
  //    We cast through `unknown` and check `typeof` to narrow safely.
  if ('ip' in request) {
    const ip = (request as { ip?: unknown }).ip
    if (typeof ip === 'string' && ip.length > 0) return ip
  }

  // 5. Ultimate fallback (prevents empty string hashes)
  return '127.0.0.1'
}
