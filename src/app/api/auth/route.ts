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

// Simple in-memory rate limiter for login attempts per IP+email.
// Limits to 10 attempts per 5-minute window. Resets on success.
const LOGIN_WINDOW_MS = 5 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 10
const loginAttempts = new Map<string, { count: number; firstAt: number }>()

function rateLimitKey(ip: string, email: string) {
  return `${ip || 'unknown'}:${email.toLowerCase()}`
}

function checkRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
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

// Periodic cleanup of stale rate-limit entries (every 10 minutes)
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
    const { email, password } = result.data

    const ip = getClientIP(request)
    const rlKey = rateLimitKey(ip, email)
    const rl = checkRateLimit(rlKey)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${rl.retryAfterSec}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    if (!user) {
      recordFailedAttempt(rlKey)
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
      recordFailedAttempt(rlKey)
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
      recordFailedAttempt(rlKey)
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

    // Successful login — clear rate-limit counter
    clearAttempts(rlKey)

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
    return NextResponse.json({ authenticated: true, user })
  } catch {
    return NextResponse.json({ authenticated: false, user: null })
  }
}
