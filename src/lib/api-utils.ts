import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, requireRole, type SessionUser } from '@/lib/auth'

// ─── Standard API Error Helpers ─────────────────────────────────────────────

export function apiError(
  message: string,
  status: number = 500,
  details?: unknown
): NextResponse {
  return NextResponse.json({ error: message, details }, { status })
}

export function apiUnauthorized(message = 'Authentication required'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function apiForbidden(message = 'You do not have permission'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 })
}

export function apiBadRequest(message = 'Bad request', details?: unknown): NextResponse {
  return NextResponse.json({ error: message, details }, { status: 400 })
}

export function apiNotFound(message = 'Resource not found'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 })
}

export function apiConflict(message = 'Resource conflict'): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 })
}

// ─── Auth Guard Helpers ─────────────────────────────────────────────────────
//
// Returns a tuple [user, errorResponse]. If errorResponse is non-null,
// the caller should immediately return it. Otherwise user is guaranteed
// to be defined.
//
//   const [user, err] = await guardAuth(request)
//   if (err) return err
//   // user is now SessionUser

export async function guardAuth(
  request?: NextRequest
): Promise<[SessionUser | null, NextResponse | null]> {
  const auth = await requireAuth(request)
  if (!auth.authorized || !auth.user) {
    return [null, apiUnauthorized(auth.error)]
  }
  return [auth.user, null]
}

export async function guardOwner(
  request?: NextRequest
): Promise<[SessionUser | null, NextResponse | null]> {
  const auth = await requireRole(['owner'], request)
  if (!auth.authorized || !auth.user) {
    return [null, auth.status === 403 ? apiForbidden(auth.error) : apiUnauthorized(auth.error)]
  }
  return [auth.user, null]
}

export async function guardAdmin(
  request?: NextRequest
): Promise<[SessionUser | null, NextResponse | null]> {
  const auth = await requireRole(['owner', 'admin'], request)
  if (!auth.authorized || !auth.user) {
    return [null, auth.status === 403 ? apiForbidden(auth.error) : apiUnauthorized(auth.error)]
  }
  return [auth.user, null]
}

export async function guardManager(
  request?: NextRequest
): Promise<[SessionUser | null, NextResponse | null]> {
  const auth = await requireRole(['owner', 'admin', 'manager'], request)
  if (!auth.authorized || !auth.user) {
    return [null, auth.status === 403 ? apiForbidden(auth.error) : apiUnauthorized(auth.error)]
  }
  return [auth.user, null]
}

// ─── Retry Wrapper for DB Operations ────────────────────────────────────────

export async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  baseDelayMs = 100
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code: string }).code
        // Only retry on connection / transaction conflict errors
        if (code !== 'P2034' && code !== 'P1001') {
          throw error
        }
      } else {
        throw error
      }
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError
}

// ─── Logging Helper ─────────────────────────────────────────────────────────

export interface LogApiErrorContext {
  /** The incoming request, used to extract method/URL/userId. */
  request?: NextRequest
  /** The authenticated user (if any) — for correlating logs to users. */
  user?: { id?: string; email?: string } | null
  /** Additional structured context to log. */
  extra?: Record<string, unknown>
}

/**
 * Log an API error with route name, request method/URL, user ID, and
 * stack trace. Previously this only logged the route + error, which
 * made it hard to debug production issues (no URL, no method, no user
 * correlation).
 */
export function logApiError(
  route: string,
  error: unknown,
  context?: LogApiErrorContext | Record<string, unknown>
): void {
  const ts = new Date().toISOString()
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  // Extract request info if a NextRequest was passed
  let method: string | undefined
  let url: string | undefined
  let userId: string | undefined
  let userEmail: string | undefined
  let extra: Record<string, unknown> | undefined

  if (context) {
    // Backwards-compat: callers can pass a plain object as the 3rd arg
    if ('request' in context && context.request) {
      const req = (context as LogApiErrorContext).request
      if (req) {
        method = req.method
        url = req.url
      }
    }
    if ('user' in context) {
      const u = (context as LogApiErrorContext).user
      if (u) {
        userId = u.id
        userEmail = u.email
      }
    }
    if ('extra' in context) {
      extra = (context as LogApiErrorContext).extra
    } else if (!('request' in context) && !('user' in context)) {
      // Old-style: treat the whole context object as extra
      extra = context as Record<string, unknown>
    }
  }

  const logLine = [
    `[${ts}]`,
    `[API:${route}]`,
    method ? `[${method}]` : '',
    url ? `[${url}]` : '',
    userId ? `[user:${userId}]` : '',
    userEmail ? `[${userEmail}]` : '',
    message,
  ]
    .filter(Boolean)
    .join(' ')

  console.error(logLine, extra ?? '', stack ?? '')
}
