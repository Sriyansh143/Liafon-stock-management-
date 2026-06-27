/**
 * In-memory rate limiter for Next.js API routes.
 *
 * Limits are per-key (typically IP + identifier). Designed for the
 * single-process standalone server — for multi-instance deployments,
 * swap this out for a Redis-backed limiter.
 *
 * Usage:
 *   const rl = rateLimit('reset-request', ip, { max: 5, windowMs: 60_000 })
 *   if (!rl.allowed) {
 *     return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
 *   }
 *
 * Each unique `key` gets its own counter. Stale entries are cleaned up
 * automatically on read and via a periodic background sweep.
 */

interface RateLimitEntry {
  count: number
  firstAt: number
}

interface RateLimitOptions {
  /** Max allowed attempts within the window. Default 10. */
  max?: number
  /** Window duration in milliseconds. Default 5 minutes. */
  windowMs?: number
}

interface RateLimitResult {
  allowed: boolean
  retryAfterSec?: number
  remaining: number
}

const buckets = new Map<string, RateLimitEntry>()

// Periodic cleanup of stale entries (every 10 minutes).
// .unref() so the timer doesn't keep Node.js alive.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    // Use a generous multiplier so we don't delete entries that are
    // about to roll over into a new window.
    for (const [k, v] of buckets.entries()) {
      // Entries without a windowMs map (we store that on the bucket
      // name implicitly via the lookup) — use 10 min as a safe default.
      if (now - v.firstAt > 10 * 60 * 1000) buckets.delete(k)
    }
  }, 10 * 60 * 1000).unref?.()
}

/**
 * Check rate limit for a given key.
 *
 * @param namespace Logical group (e.g. 'reset-request', 'whatsapp-send')
 * @param identifier Per-user/IP identifier (e.g. IP address or IP+email)
 * @param options    max + windowMs
 */
export function rateLimit(
  namespace: string,
  identifier: string,
  options: RateLimitOptions = {}
): RateLimitResult {
  const max = options.max ?? 10
  const windowMs = options.windowMs ?? 5 * 60 * 1000
  const compositeKey = `${namespace}:${identifier || 'unknown'}`
  const now = Date.now()

  const entry = buckets.get(compositeKey)
  if (!entry || now - entry.firstAt > windowMs) {
    buckets.set(compositeKey, { count: 1, firstAt: now })
    return { allowed: true, remaining: max - 1 }
  }

  if (entry.count >= max) {
    const retryAfterSec = Math.ceil((entry.firstAt + windowMs - now) / 1000)
    return { allowed: false, retryAfterSec, remaining: 0 }
  }

  entry.count += 1
  return { allowed: true, remaining: max - entry.count }
}

/**
 * Reset the counter for a given key (e.g. after a successful login).
 * Useful for "reset on success" patterns.
 */
export function clearRateLimit(namespace: string, identifier: string): void {
  buckets.delete(`${namespace}:${identifier || 'unknown'}`)
}
