/**
 * Cross-instance rate limiter backed by Upstash Redis.
 *
 * Vercel serverless functions are stateless — each instance has its own
 * in-memory `Map`. An attacker who triggers many cold starts can bypass
 * an in-memory limiter. Upstash Redis is the recommended cross-instance
 * limiter for Vercel (it's HTTP-based, works in serverless).
 *
 * When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, this
 * module uses Redis. Otherwise it transparently falls back to the existing
 * in-memory `src/lib/rate-limit.ts` so the app still works during local
 * dev or before Redis is configured.
 *
 * Setup:
 *   1. Create a free Upstash Redis database: https://upstash.com
 *   2. Copy the REST URL + token from the database dashboard
 *   3. Add to Vercel env vars:
 *      UPSTASH_REDIS_REST_URL=https://xxxxxx.upstash.io
 *      UPSTASH_REDIS_REST_TOKEN=xxxxxx
 *
 * The fallback in-memory limiter is exported as `rateLimitMemory` for
 * callers that explicitly want the local-only limiter.
 */

import { Redis } from '@upstash/redis'
import { rateLimit as rateLimitMemoryImpl } from '@/lib/rate-limit'

let cachedRedis: Redis | null = null

function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  cachedRedis = new Redis({ url, token })
  return cachedRedis
}

/** Check whether Upstash Redis is configured. */
export function isRedisRateLimitConfigured(): boolean {
  return getRedis() !== null
}

export interface RateLimitOptions {
  /** Max allowed attempts within the window. Default 10. */
  max?: number
  /** Window duration in milliseconds. Default 5 minutes. */
  windowMs?: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSec?: number
  remaining: number
  /** Whether this call was backed by Redis (true) or in-memory fallback (false). */
  distributed: boolean
}

/**
 * Distributed rate limit check using Upstash Redis's INCR + EXPIRE pattern.
 *
 * Atomicity: INCR + EXPIRE are issued as a single Upstash pipeline, which
 * is executed atomically by the Redis server. This means even with 100
 * concurrent serverless invocations, the counter is always consistent.
 *
 * Algorithm:
 *   1. INCR the key (returns the new count)
 *   2. If count === 1, set EXPIRE on the key (so it auto-resets after windowMs)
 *   3. If count > max, deny
 */
async function rateLimitRedis(
  namespace: string,
  identifier: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const redis = getRedis()!
  const max = options.max ?? 10
  const windowMs = options.windowMs ?? 5 * 60 * 1000
  const windowSec = Math.ceil(windowMs / 1000)
  const key = `rl:${namespace}:${identifier || 'unknown'}`

  // Pipeline both commands so they execute in a single round-trip
  // Note: Upstash's `expire` takes an optional 3rd arg as a string option
  // ("NX"|"XX"|"GT"|"LT"), not an object. "NX" = only set if no TTL exists.
  const pipeline = redis.pipeline()
  pipeline.incr(key)
  pipeline.expire(key, windowSec, 'NX')   // Only set TTL on first increment
  const results = await pipeline.exec()

  const count = (results[0] as unknown as { result: number })?.result ?? 0

  if (count > max) {
    // Already denied — compute retry-after from the key's TTL
    const ttl = await redis.ttl(key)
    return {
      allowed: false,
      retryAfterSec: ttl > 0 ? ttl : windowSec,
      remaining: 0,
      distributed: true,
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, max - count),
    distributed: true,
  }
}

/**
 * Cross-instance rate limit check.
 *
 * - If Upstash Redis is configured, uses Redis (works across all serverless instances).
 * - Otherwise, falls back to the in-memory limiter (per-instance only).
 *
 * The return value includes `distributed: boolean` so the caller can warn
 * the operator if they're running without Redis protection.
 */
export async function rateLimitDistributed(
  namespace: string,
  identifier: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  if (isRedisRateLimitConfigured()) {
    try {
      return await rateLimitRedis(namespace, identifier, options)
    } catch (err) {
      // If Redis is down, fall back to in-memory rather than blocking legit users.
      console.error('[rate-limit-redis] Redis error, falling back to in-memory:', err)
    }
  }

  const memResult = rateLimitMemoryImpl(namespace, identifier, options)
  return { ...memResult, distributed: false }
}

/**
 * Reset the rate-limit counter for a given key (e.g. after a successful login).
 * Works in both Redis and in-memory modes.
 */
export async function clearRateLimitDistributed(
  namespace: string,
  identifier: string
): Promise<void> {
  if (isRedisRateLimitConfigured()) {
    try {
      const redis = getRedis()!
      await redis.del(`rl:${namespace}:${identifier || 'unknown'}`)
      return
    } catch (err) {
      console.error('[rate-limit-redis] Redis clear error:', err)
    }
  }
  // In-memory fallback
  clearRateLimitMemory(namespace, identifier)
}

// Re-export the in-memory clear function under a clearer name
import { clearRateLimit as clearRateLimitMemory } from '@/lib/rate-limit'
