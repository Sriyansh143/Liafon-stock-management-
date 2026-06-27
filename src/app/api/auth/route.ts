import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  hashPassword,
  verifyPassword,
  setSessionCookies,
  clearSessionCookies,
  getSessionUser,
  type SessionUser,
} from '@/lib/auth'
import { validate, loginSchema } from '@/lib/validations'
import { apiBadRequest, apiUnauthorized, guardAuth, logApiError } from '@/lib/api-utils'
import { logActivity, getClientIP } from '@/lib/activity'
import { rateLimitDistributed, clearRateLimitDistributed, isRedisRateLimitConfigured } from '@/lib/redis-rate-limit'

// Two-tier rate limiter: in-memory (per-instance, fast) + Redis (cross-instance).
// On Vercel serverless, the in-memory limiter is per-instance — an attacker
// can bypass it by triggering cold starts. The Redis limiter catches those
// distributed attempts. When Redis isn't configured, we fall back to
// in-memory only (with a logged warning for the operator).
const LOGIN_WINDOW_MS = 5 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 10
const loginAttempts = new Map<string, { count: number; firstAt: number }>()

function rateLimitKey(ip: string, email: string) {
  return `${ip || 'unknown'}:${email.toLowerCase()}`
}

function checkRateLimitInMemory(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
    return { allowed: true }
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((entry.firstAt + LOGIN_WINDOW_MS - now) / 1000)
    return { allowed: false, retryAfterSec }
  }
  return { allowed: true }
}

function recordFailedAttempt(key: string) {
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now })
  } else {
    entry.count += 1
  }
}

function clearAttempts(key: string) {
  loginAttempts.delete(key)
}

// ─── Two-tier check: in-memory (fast, per-instance) + Redis (cross-instance) ──
// On Vercel serverless, each function instance has its own in-memory Map.
// An attacker can bypass it by triggering many cold starts. The Redis
// limiter catches those distributed attempts. When Redis isn't configured,
// we silently fall back to in-memory only (the operator gets a one-time
// warning in /api/auth GET response if they check the headers).
async function checkRateLimit(key: string): Promise<{ allowed: boolean; retryAfterSec?: number; distributed: boolean }> {
  // Tier 1: in-memory (always runs — fast, no network)
  const mem = checkRateLimitInMemory(key)
  if (!mem.allowed) {
    return { ...mem, distributed: false }
  }

  // Tier 2: Redis (only if configured)
  if (isRedisRateLimitConfigured()) {
    const dist = await rateLimitDistributed('login', key, {
      max: LOGIN_MAX_ATTEMPTS,
      windowMs: LOGIN_WINDOW_MS,
    })
    if (!dist.allowed) {
      return { allowed: false, retryAfterSec: dist.retryAfterSec, distributed: true }
    }
  }

  return { allowed: true, distributed: isRedisRateLimitConfigured() }
}

async function recordFailedAttemptDistributed(key: string) {
  // In-memory increment
  recordFailedAttempt(key)
  // Redis increment is implicit in rateLimitDistributed (INCR-based) —
  // no separate call needed. But we DON'T call clearRateLimitDistributed
  // here (only on success).
}

async function clearAttemptsDistributed(key: string) {
  clearAttempts(key)
  if (isRedisRateLimitConfigured()) {
    await clearRateLimitDistributed('login', key)
  }
}

// Periodic cleanup of stale rate-limit entries (every 10 minutes)
// Note: On Vercel serverless, this never fires (no long-running process).
// It's primarily for self-hosted deployments.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of loginAttempts.entries()) {
      if (now - v.firstAt > LOGIN_WINDOW_MS * 2) loginAttempts.delete(k)
    }
  }, 10 * 60 * 1000).unref?.()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) return apiBadRequest('Invalid JSON body')

    // ── Logout ─────────────────────────────────────────────────────────────
    if (body.action === 'logout') {
      // Best-effort: log the logout event before clearing cookies
      try {
        const user = await getSessionUser(request)
        if (user) {
          await logActivity({
            userId: user.id,
            action: 'LOGOUT',
            entityType: 'user',
            entityId: user.id,
            summary: `${user.name} signed out`,
            metadata: { email: user.email },
            ipAddress: getClientIP(request),
          })
        }
      } catch {
        // ignore
      }
      const cookies = await clearSessionCookies(request)
      return NextResponse.json(
        { success: true },
        { headers: { 'Set-Cookie': cookies } }
      )
    }

    // ── Change own password (self-service) ────────────────────────────────
    // Any authenticated user can change their own password. The current
    // password is verified first; the new password is then hashed and
    // stored. The user is NOT auto-signed-out here (the client does
    // that explicitly after the toast).
    if (body.action === 'change_password') {
      const { currentPassword, newPassword } = body as {
        currentPassword?: unknown
        newPassword?: unknown
      }
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return apiBadRequest('currentPassword and newPassword are required')
      }
      if (newPassword.length < 6) {
        return apiBadRequest('New password must be at least 6 characters')
      }
      if (currentPassword === newPassword) {
        return apiBadRequest('New password must be different from current')
      }

      // Verify the user is signed in (any role)
      const [sessionUser, authErr] = await guardAuth(request)
      if (authErr || !sessionUser) return authErr ?? apiUnauthorized()

      // Fetch the stored hash
      const user = await db.user.findUnique({
        where: { id: sessionUser.id },
        select: { id: true, email: true, password: true, name: true },
      })
      if (!user) {
        return apiUnauthorized('User not found')
      }

      // Verify current password
      const { valid } = await verifyPassword(currentPassword, user.password)
      if (!valid) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 }
        )
      }

      // Hash + store new password. Also bump passwordChangedAt so any
      // other sessions (e.g. on a different device) are invalidated.
      const newHash = await hashPassword(newPassword)
      await db.user.update({
        where: { id: user.id },
        data: {
          password: newHash,
          passwordChangedAt: new Date(),
        },
      })

      // Log the password change (best-effort)
      await logActivity({
        userId: user.id,
        action: 'UPDATE',
        entityType: 'user',
        entityId: user.id,
        summary: `${user.name} changed their own password`,
        metadata: { email: user.email, self: true },
        ipAddress: getClientIP(request),
      })

      return NextResponse.json({ success: true })
    }

    // ── Login ──────────────────────────────────────────────────────────────
    // NOTE: A legacy 'unlock' action used to live here, gated by the
    // APP_PASSWORD env var. It set a `liafon_dev=1` cookie that was
    // never checked anywhere else in the codebase. It was either dead
    // code or a latent backdoor — either way, it has been removed.
    const result = validate(loginSchema, body)
    if (!result.success) {
      return apiBadRequest(result.error)
    }
    const { email, password, twoFactorCode } = result.data

    const ip = getClientIP(request)
    const rlKey = rateLimitKey(ip, email)
    const rl = await checkRateLimit(rlKey)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${rl.retryAfterSec}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true, name: true, email: true, password: true, role: true,
        isActive: true, ownerId: true, lastLogin: true,
        twoFactorEnabled: true, twoFactorSecret: true,
      },
    })

    if (!user) {
      await recordFailedAttemptDistributed(rlKey)
      await logActivity({
        action: 'LOGIN_FAILED',
        entityType: 'user',
        summary: `Failed login attempt for ${email}`,
        metadata: { email, reason: 'no_such_user' },
        ipAddress: ip,
      })
      return apiUnauthorized('Invalid email or password')
    }
    if (!user.isActive) {
      await recordFailedAttemptDistributed(rlKey)
      await logActivity({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        summary: `Failed login attempt for ${user.email}`,
        metadata: { email: user.email, reason: 'inactive' },
        ipAddress: ip,
      })
      return NextResponse.json(
        { error: 'Account is deactivated. Contact the owner.' },
        { status: 403 }
      )
    }

    const { valid, needsRehash } = await verifyPassword(password, user.password)
    if (!valid) {
      await recordFailedAttemptDistributed(rlKey)
      await logActivity({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        summary: `Failed login attempt for ${user.email}`,
        metadata: { email: user.email, reason: 'wrong_password' },
        ipAddress: ip,
      })
      return apiUnauthorized('Invalid email or password')
    }

    // ─── 2FA verification (Phase 3) ──────────────────────────────────────
    // If the user has 2FA enabled, password verification alone isn't enough.
    // The caller must also submit a valid 6-digit TOTP code (or 8-char
    // backup code). If no code was submitted, return `requiresTwoFactor: true`
    // so the client can prompt for the code and retry.
    if (user.twoFactorEnabled) {
      // Parse the stored 2FA state
      let stored: { secret: string; backupCodesHashed: string[] }
      try {
        stored = JSON.parse(user.twoFactorSecret || '{}')
      } catch {
        return NextResponse.json(
          { error: '2FA state corrupted. Contact admin to reset.' },
          { status: 500 }
        )
      }

      if (!twoFactorCode) {
        // Don't clear the rate-limit counter — the user still needs to
        // complete 2FA. But also don't increment it (password was valid).
        return NextResponse.json(
          {
            requiresTwoFactor: true,
            userId: user.id,
            message: '2FA code required. Enter the 6-digit code from your authenticator app.',
          },
          { status: 200 }   // 200 (not 401) — the credentials WERE valid
        )
      }

      // Verify the TOTP code (or backup code)
      const { verifyTwoFactor } = await import('@/lib/totp')
      const result2fa = verifyTwoFactor(twoFactorCode, stored.secret, stored.backupCodesHashed)
      if (!result2fa.valid) {
        await recordFailedAttemptDistributed(rlKey)
        await logActivity({
          userId: user.id,
          action: 'LOGIN_FAILED',
          entityType: 'user',
          summary: `Failed 2FA for ${user.email}`,
          metadata: { email: user.email, reason: 'invalid_2fa' },
          ipAddress: ip,
        })
        return NextResponse.json(
          { error: 'Invalid 2FA code' },
          { status: 401 }
        )
      }

      // If a backup code was used, remove it from the stored list
      if (result2fa.usedBackupCode && result2fa.usedBackupCodeIndex !== undefined) {
        const { removeUsedBackupCode } = await import('@/lib/totp')
        const updatedBackupCodes = removeUsedBackupCode(
          stored.backupCodesHashed,
          result2fa.usedBackupCodeIndex
        )
        await db.user.update({
          where: { id: user.id },
          data: {
            twoFactorSecret: JSON.stringify({
              secret: stored.secret,
              backupCodesHashed: updatedBackupCodes,
            }),
          },
        })
      }
    }

    // Successful login — clear rate-limit counter
    await clearAttemptsDistributed(rlKey)

    // Upgrade legacy SHA-256 hash to bcrypt transparently. Also
    // bump passwordChangedAt so any pre-existing sessions that were
    // issued against the legacy hash get refreshed (the cookie will
    // be re-issued by the setSessionCookies call below).
    if (needsRehash) {
      const newHash = await hashPassword(password)
      await db.user.update({
        where: { id: user.id },
        data: {
          password: newHash,
          passwordChangedAt: new Date(),
        },
      })
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

    const sessionUser: SessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as SessionUser['role'],
      isActive: user.isActive,
      ownerId: user.ownerId,
    }

    const cookies = await setSessionCookies(sessionUser, request)
    await logActivity({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} signed in`,
      metadata: { email: user.email, role: user.role },
      ipAddress: ip,
    })
    return NextResponse.json(
      { success: true, user: sessionUser },
      { headers: { 'Set-Cookie': cookies.join(', ') } }
    )
  } catch (error) {
    logApiError('auth/POST', error)
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null })
    }
    // Fetch 2FA status + shopId separately (not part of the SessionUser cookie payload)
    let twoFactorEnabled = false
    let shopId: string | null = null
    try {
      const dbUser = await db.user.findUnique({
        where: { id: user.id },
        select: { twoFactorEnabled: true, shopId: true },
      })
      twoFactorEnabled = dbUser?.twoFactorEnabled ?? false
      shopId = dbUser?.shopId ?? null
    } catch {
      // ignore — return false
    }
    return NextResponse.json({
      authenticated: true,
      user: { ...user, twoFactorEnabled, shopId },
    })
  } catch {
    return NextResponse.json({ authenticated: false, user: null })
  }
}
