import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import type { UserRole, AppPage } from '@/store/app-store'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
  isActive: boolean
  ownerId: string // Multi-tenant: which owner does this user belong to?
}

/**
 * Internal shape of the cookie payload. Includes `iat` (issued-at,
 * epoch-ms) so we can invalidate the session when the user changes
 * their password (passwordChangedAt > iat → reject).
 */
interface SessionCookiePayload {
  id: string
  name: string
  email: string
  role: UserRole
  isActive: boolean
  ownerId: string
  iat: number
}

export interface AuthResult {
  authorized: boolean
  user?: SessionUser
  error?: string
  status?: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

// Bcrypt rounds: 12 is the current OWASP-recommended minimum (2023).
// Previously this was 10, which was the default when bcrypt was first
// adopted. Modern hardware can crack bcrypt-10 hashes faster than
// when 10 was chosen. The `needsRehash` upgrade path (currently used
// for legacy SHA-256 migration) can also bump bcrypt-10 hashes to
// bcrypt-12 on next successful login — but for simplicity we leave
// existing bcrypt-10 hashes alone (they're still secure enough for
// most threat models) and only use 12 for new hashes.
const BCRYPT_ROUNDS = 12
const SESSION_COOKIE = 'liafon_auth'
const USER_COOKIE = 'liafon_user'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

// Legacy SHA-256 fallback salt (kept only to migrate legacy hashes)
const LEGACY_SALT = 'liafon_stock_2024_salt'

// ─── Password Hashing ───────────────────────────────────────────────────────

import crypto from 'crypto'

function legacyHashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + LEGACY_SALT).digest('hex')
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

/**
 * Verify a password against a stored hash. Transparently supports both
 * the new bcrypt hashes and the legacy SHA-256 hashes. If the legacy
 * hash matches, the caller should re-hash and persist the new hash.
 *
 * Also flags bcrypt hashes with fewer than 12 rounds as `needsRehash`
 * (OWASP 2023 minimum) so they get opportunistically upgraded on the
 * next successful login — same infrastructure used for legacy SHA-256.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  // Bcrypt hashes start with $2a$, $2b$, or $2y$
  if (stored.startsWith('$2')) {
    const valid = await bcrypt.compare(password, stored)
    if (!valid) return { valid: false, needsRehash: false }
    // Upgrade bcrypt hashes with fewer than 12 rounds. The cost factor
    // is encoded in the hash as `$2b$<cost>$...`.
    const costMatch = /^\$2[aby]\$(\d+)\$/.exec(stored)
    const cost = costMatch ? parseInt(costMatch[1], 10) : 10
    return { valid: true, needsRehash: cost < BCRYPT_ROUNDS }
  }

  // Legacy SHA-256 path
  if (stored === legacyHashPassword(password)) {
    return { valid: true, needsRehash: true }
  }

  return { valid: false, needsRehash: false }
}

// ─── Cookie Helpers ─────────────────────────────────────────────────────────

function isHttps(request?: NextRequest): boolean {
  if (request) {
    const xfp = request.headers.get('x-forwarded-proto')
    if (xfp) return xfp.includes('https')
    return request.nextUrl.protocol === 'https:'
  }
  return process.env.NODE_ENV === 'production'
}

function buildSessionCookie(value: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

function buildUserCookie(value: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${USER_COOKIE}=${value}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export async function setSessionCookies(
  user: SessionUser,
  request?: NextRequest
): Promise<string[]> {
  const secure = isHttps(request)
  // Include an issued-at timestamp in the cookie so we can invalidate
  // the session when the user changes/resets their password.
  const payload: SessionCookiePayload = { ...user, iat: Date.now() }
  const userPayload = encodeURIComponent(JSON.stringify(payload))
  return [
    buildSessionCookie('1', SESSION_MAX_AGE_SECONDS, secure),
    buildUserCookie(userPayload, SESSION_MAX_AGE_SECONDS, secure),
  ]
}

export async function clearSessionCookies(request?: NextRequest): Promise<string> {
  const secure = isHttps(request)
  const parts = [
    `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
    `${USER_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`,
  ]
  if (secure) {
    return parts.map((p) => `${p}; Secure`).join(', ')
  }
  return parts.join(', ')
}

// ─── Auth Verification ──────────────────────────────────────────────────────

/**
 * Reads the session cookie and validates the user against the database.
 * Returns the live user record so isActive / role changes take effect
 * immediately (no stale cookie session).
 *
 * Also enforces password-changed-at invalidation: if the user has
 * changed their password (or had it reset) after this session cookie
 * was issued, the session is rejected and the user must sign in again.
 * This prevents a compromised session cookie from continuing to work
 * after the user resets their password.
 */
export async function getSessionUser(request?: NextRequest): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const authCookie = cookieStore.get(SESSION_COOKIE)
    const userCookie = cookieStore.get(USER_COOKIE)

    if (!authCookie || authCookie.value !== '1' || !userCookie?.value) {
      return null
    }

    let parsed: SessionCookiePayload
    try {
      parsed = JSON.parse(decodeURIComponent(userCookie.value))
    } catch {
      return null
    }

    if (!parsed?.id || !parsed?.role) return null

    // Verify against DB so deactivated users / role changes are honored
    const dbUser = await db.user.findUnique({
      where: { id: parsed.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        ownerId: true,
        passwordChangedAt: true,
      },
    })

    if (!dbUser || !dbUser.isActive) return null

    // Invalidate sessions issued before the most recent password change.
    if (typeof parsed.iat === 'number') {
      const passwordChangedMs = dbUser.passwordChangedAt
        ? new Date(dbUser.passwordChangedAt).getTime()
        : 0
      if (parsed.iat < passwordChangedMs - 1000) {
        return null
      }
    }

    // Re-shape to match the SessionUser interface
    // If ownerId is empty (legacy user), use the user's own ID
    return {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role as UserRole,
      isActive: dbUser.isActive,
      ownerId: dbUser.ownerId || dbUser.id,
    }
  } catch {
    return null
  }
}

/**
 * Require any authenticated user.
 * Usage:
 *   const auth = await requireAuth(request)
 *   if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: auth.status })
 */
export async function requireAuth(request?: NextRequest): Promise<AuthResult> {
  const user = await getSessionUser(request)
  if (!user) {
    return { authorized: false, error: 'Authentication required', status: 401 }
  }
  return { authorized: true, user }
}

/**
 * Require a user whose role is in the allowed list.
 */
export async function requireRole(
  allowedRoles: UserRole[],
  request?: NextRequest
): Promise<AuthResult> {
  const auth = await requireAuth(request)
  if (!auth.authorized) return auth
  if (!auth.user || !allowedRoles.includes(auth.user.role)) {
    return {
      authorized: false,
      error: 'You do not have permission to perform this action',
      status: 403,
    }
  }
  return auth
}

/**
 * Require the owner role.
 */
export async function requireOwner(request?: NextRequest): Promise<AuthResult> {
  return requireRole(['owner'], request)
}

/**
 * Require admin or owner.
 */
export async function requireAdmin(request?: NextRequest): Promise<AuthResult> {
  return requireRole(['owner', 'admin'], request)
}

/**
 * Require manager, admin, or owner.
 */
export async function requireManager(request?: NextRequest): Promise<AuthResult> {
  return requireRole(['owner', 'admin', 'manager'], request)
}

// ─── Page Access Helper ─────────────────────────────────────────────────────

const ROLE_ACCESS: Record<UserRole, AppPage[]> = {
  owner: ['dashboard', 'inventory', 'sales', 'purchases', 'departments', 'reports', 'analysis', 'shops', 'purchase-orders', 'stock-transfers', 'stock-count', 'activity', 'settings', 'users'],
  admin: ['dashboard', 'inventory', 'sales', 'purchases', 'departments', 'reports', 'analysis', 'shops', 'purchase-orders', 'stock-transfers', 'stock-count', 'settings'],
  manager: ['dashboard', 'inventory', 'sales', 'purchases', 'reports', 'analysis', 'purchase-orders', 'stock-transfers', 'stock-count'],
  user: ['dashboard', 'inventory', 'sales'],
}

export function canAccessPage(role: UserRole, page: AppPage): boolean {
  return ROLE_ACCESS[role]?.includes(page) ?? false
}

export function allowedPages(role: UserRole): AppPage[] {
  return ROLE_ACCESS[role] ?? ROLE_ACCESS.user
}
