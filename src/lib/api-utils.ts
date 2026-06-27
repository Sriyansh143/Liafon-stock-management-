import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAuth, requireRole, type SessionUser } from '@/lib/auth'

// ─── Standard API Error Helpers ─────────────────────────────────────────────
// Concise arrow-function factories — each returns a NextResponse with the
// appropriate status + JSON body. Intentionally tiny: a one-liner is more
// readable than a 3-line function for these.

export const apiError = (message: string, status = 500, details?: unknown): NextResponse =>
  NextResponse.json({ error: message, details }, { status })

export const apiUnauthorized = (message = 'Authentication required'): NextResponse =>
  NextResponse.json({ error: message }, { status: 401 })

export const apiForbidden = (message = 'You do not have permission'): NextResponse =>
  NextResponse.json({ error: message }, { status: 403 })

export const apiBadRequest = (message = 'Bad request', details?: unknown): NextResponse =>
  NextResponse.json({ error: message, details }, { status: 400 })

export const apiNotFound = (message = 'Resource not found'): NextResponse =>
  NextResponse.json({ error: message }, { status: 404 })

export const apiConflict = (message = 'Resource conflict'): NextResponse =>
  NextResponse.json({ error: message }, { status: 409 })

// ─── Auth Guard Helpers ─────────────────────────────────────────────────────
//
// Returns a tuple [user, errorResponse]. If errorResponse is non-null,
// the caller should immediately return it. Otherwise user is guaranteed
// to be defined.
//
//   const [user, err] = await guardAuth(request)
//   if (err) return err
//   // user is now SessionUser

/** Tuple type for guard return values — DRY alias used by all guards. */
export type GuardResult = [SessionUser | null, NextResponse | null]

/**
 * Build the standard guard response tuple from an AuthResult.
 * Extracted as a helper so all role guards share the same shape logic.
 */
function createGuardResponse(
  auth: { authorized: boolean; user?: SessionUser; error?: string; status?: number }
): GuardResult {
  if (!auth.authorized || !auth.user) {
    return [null, auth.status === 403 ? apiForbidden(auth.error) : apiUnauthorized(auth.error)]
  }
  return [auth.user, null]
}

/** Require any authenticated user. */
export const guardAuth = async (request?: NextRequest): Promise<GuardResult> =>
  createGuardResponse(await requireAuth(request))

/** Require the owner role. */
export const guardOwner = async (request?: NextRequest): Promise<GuardResult> =>
  createGuardResponse(await requireRole(['owner'], request))

/** Require admin or owner. */
export const guardAdmin = async (request?: NextRequest): Promise<GuardResult> =>
  createGuardResponse(await requireRole(['owner', 'admin'], request))

/** Require manager, admin, or owner. */
export const guardManager = async (request?: NextRequest): Promise<GuardResult> =>
  createGuardResponse(await requireRole(['owner', 'admin', 'manager'], request))

// ─── Retry Wrapper for DB Operations ────────────────────────────────────────

/**
 * Interface for errors that can be inspected for a Prisma `code` field.
 * Used by `withRetry` to decide whether an error is retryable.
 */
interface RetryableError {
  code?: string
}

/** Returns true if the error is a transient DB connection / transaction conflict. */
function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as RetryableError).code
  // P2034 = transaction conflict (write conflict in a concurrent tx)
  // P1001 = can't reach database server (transient network blip)
  return code === 'P2034' || code === 'P1001'
}

/**
 * Retry an async operation on transient DB errors (Prisma P2034 / P1001).
 * Uses exponential backoff with jitter to avoid thundering herd.
 */
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
      if (!isRetryableError(error)) throw error
      // Exponential backoff: 100ms, 200ms, 400ms + up to 50ms random jitter
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
 * Log an API error with route name, request method/URL, user ID, and stack.
 * Single-line format for easy log aggregation (Datadog, Vercel logs, etc.).
 */
export function logApiError(
  route: string,
  error: unknown,
  context?: LogApiErrorContext | Record<string, unknown>
): void {
  const ts = new Date().toISOString()
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  let method: string | undefined
  let url: string | undefined
  let userId: string | undefined
  let userEmail: string | undefined
  let extra: Record<string, unknown> | undefined

  if (context) {
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
