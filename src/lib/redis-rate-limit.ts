import { Redis } from '@upstash/redis'
import { rateLimit as rateLimitMemoryImpl, clearRateLimit as clearRateLimitMemory } from '@/lib/rate-limit'

let cachedRedis: Redis | null = null

function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis
  const url = process.env.UPSTASH_REDIS_REST_URL; const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  cachedRedis = new Redis({ url, token })
  return cachedRedis
}

export function isRedisRateLimitConfigured(): boolean { return getRedis() !== null }

export interface RateLimitOptions { max?: number; windowMs?: number }
export interface RateLimitResult { allowed: boolean; retryAfterSec?: number; remaining: number; distributed: boolean }

async function rateLimitRedis(namespace: string, identifier: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const redis = getRedis()!
  const max = options.max ?? 10; const windowMs = options.windowMs ?? 300000; const windowSec = Math.ceil(windowMs / 1000)
  const key = `rl:${namespace}:${identifier || 'unknown'}`
  const pipeline = redis.pipeline()
  pipeline.incr(key); pipeline.expire(key, windowSec, 'NX')
  const results = await pipeline.exec()
  const count = (results[0] as unknown as { result: number })?.result ?? 0
  if (count > max) { const ttl = await redis.ttl(key); return { allowed: false, retryAfterSec: ttl > 0 ? ttl : windowSec, remaining: 0, distributed: true } }
  return { allowed: true, remaining: Math.max(0, max - count), distributed: true }
}

export async function rateLimitDistributed(namespace: string, identifier: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  if (isRedisRateLimitConfigured()) { try { return await rateLimitRedis(namespace, identifier, options) } catch (err) { console.error('[rate-limit-redis] Redis error:', err) } }
  const mem = rateLimitMemoryImpl(namespace, identifier, options)
  return { ...mem, distributed: false }
}

export async function clearRateLimitDistributed(namespace: string, identifier: string) {
  if (isRedisRateLimitConfigured()) { try { await getRedis()!.del(`rl:${namespace}:${identifier || 'unknown'}`); return } catch {} }
  clearRateLimitMemory(namespace, identifier)
}
