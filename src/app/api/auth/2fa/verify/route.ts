import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, logApiError, apiBadRequest } from '@/lib/api-utils'
import { verifyTwoFactorCode, verifyTwoFactor, removeUsedBackupCode } from '@/lib/totp'
import { logUserActivity } from '@/lib/activity'

interface PendingSetup {
  secret: string
  backupCodesHashed: string[]
  pendingEnable?: boolean
}

/**
 * POST /api/auth/2fa/verify
 *
 * Two distinct use cases:
 *
 * 1. Complete 2FA enablement:
 *    Body: { action: 'enable', code: '123456' }
 *    Verifies the user's first TOTP code + flips twoFactorEnabled to true.
 *
 * 2. Verify during login:
 *    Body: { action: 'login', userId: '<id>', code: '123456' }
 *    Used by /api/auth POST when 2FA is enabled. The login flow:
 *      - User submits email + password
 *      - If valid + 2FA enabled → returns { requiresTwoFactor: true, userId }
 *      - User submits code → calls this endpoint with action='login'
 *      - If valid → returns session cookies (login completes)
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { action, code } = body as { action?: string; code?: string }
    if (!code || typeof code !== 'string') {
      return apiBadRequest('code is required (6-digit TOTP or 8-char backup code)')
    }

    // ─── Action: enable (complete setup) ─────────────────────────────────
    if (action === 'enable') {
      const [user, authErr] = await guardAuth(request)
      if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

      const dbUser = await db.user.findUnique({
        where: { id: user.id },
        select: { id: true, email: true, twoFactorSecret: true, twoFactorEnabled: true },
      })
      if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
      if (dbUser.twoFactorEnabled) {
        return NextResponse.json({ error: '2FA is already enabled' }, { status: 400 })
      }
      if (!dbUser.twoFactorSecret) {
        return NextResponse.json({ error: 'No pending 2FA setup. Call /api/auth/2fa/enable first.' }, { status: 400 })
      }

      // Parse the pending setup
      let setup: PendingSetup
      try {
        setup = JSON.parse(dbUser.twoFactorSecret) as PendingSetup
      } catch {
        return NextResponse.json({ error: 'Invalid stored 2FA state. Restart setup.' }, { status: 500 })
      }

      if (!setup.secret) {
        return NextResponse.json({ error: 'Invalid stored 2FA state. Restart setup.' }, { status: 500 })
      }

      // Verify the TOTP code (only TOTP, not backup codes — backup codes
      // are for emergency login, not for completing setup)
      if (!verifyTwoFactorCode(code, setup.secret)) {
        return NextResponse.json({ error: 'Invalid 2FA code. Try again.' }, { status: 400 })
      }

      // ─── Enable 2FA ───────────────────────────────────────────────────
      // Store the secret (without pendingEnable flag) + keep backup codes
      await db.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: JSON.stringify({
            secret: setup.secret,
            backupCodesHashed: setup.backupCodesHashed,
          }),
        },
      })

      await logUserActivity(user, {
        action: 'UPDATE',
        entityType: 'user',
        entityId: user.id,
        summary: `2FA enabled for ${dbUser.email}`,
        metadata: { email: dbUser.email },
      })

      return NextResponse.json({
        success: true,
        message: '2FA enabled successfully. Save your backup codes in a safe place.',
      })
    }

    // ─── Action: login (verify during login flow) ────────────────────────
    if (action === 'login') {
      const { userId } = body as { userId?: string }
      if (!userId) return apiBadRequest('userId is required for login verification')

      const dbUser = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true, isActive: true, ownerId: true, twoFactorSecret: true, twoFactorEnabled: true, passwordChangedAt: true },
      })
      if (!dbUser || !dbUser.isActive || !dbUser.twoFactorEnabled) {
        return NextResponse.json({ error: 'Invalid user or 2FA not enabled' }, { status: 400 })
      }

      let setup: PendingSetup
      try {
        setup = JSON.parse(dbUser.twoFactorSecret!) as PendingSetup
      } catch {
        return NextResponse.json({ error: 'Invalid stored 2FA state' }, { status: 500 })
      }

      // Verify TOTP or backup code
      const result = verifyTwoFactor(code, setup.secret, setup.backupCodesHashed)
      if (!result.valid) {
        return NextResponse.json({ error: result.error || 'Invalid 2FA code' }, { status: 400 })
      }

      // If a backup code was used, remove it from the stored list
      if (result.usedBackupCode && result.usedBackupCodeIndex !== undefined) {
        const updatedBackupCodes = removeUsedBackupCode(setup.backupCodesHashed, result.usedBackupCodeIndex)
        await db.user.update({
          where: { id: dbUser.id },
          data: {
            twoFactorSecret: JSON.stringify({
              secret: setup.secret,
              backupCodesHashed: updatedBackupCodes,
            }),
          },
        })
      }

      // Issue session cookies (login complete)
      const { setSessionCookies } = await import('@/lib/auth')
      const sessionUser = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role as 'owner' | 'admin' | 'manager' | 'user',
        isActive: dbUser.isActive,
        ownerId: dbUser.ownerId || dbUser.id,
      }
      const cookies = await setSessionCookies(sessionUser, request)
      await logUserActivity(sessionUser, {
        action: 'LOGIN',
        entityType: 'user',
        entityId: dbUser.id,
        summary: `${dbUser.name} signed in (2FA verified)`,
        metadata: { email: dbUser.email, twoFactor: true, usedBackupCode: result.usedBackupCode },
      })

      const response = NextResponse.json({ success: true, user: sessionUser })
      response.headers.set('Set-Cookie', cookies.join(', '))
      return response
    }

    return apiBadRequest(`Unknown action: ${action}. Use 'enable' or 'login'.`)
  } catch (error) {
    logApiError('auth/2fa/verify/POST', error)
    return NextResponse.json({ error: 'Failed to verify 2FA' }, { status: 500 })
  }
}
