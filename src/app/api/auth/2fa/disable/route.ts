import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, logApiError, apiBadRequest } from '@/lib/api-utils'
import { verifyPassword } from '@/lib/auth'
import { verifyTwoFactorCode } from '@/lib/totp'
import { logUserActivity } from '@/lib/activity'

interface StoredSetup {
  secret: string
  backupCodesHashed: string[]
}

/**
 * POST /api/auth/2fa/disable
 *
 * Disables 2FA for the authenticated user. Requires BOTH:
 *   - currentPassword: to prevent session hijacking from disabling 2FA
 *   - code: a valid TOTP code (proves the user has the authenticator app)
 *
 * After disabling, the stored secret + backup codes are wiped.
 */

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { currentPassword, code } = body as { currentPassword?: string; code?: string }
    if (!currentPassword) return apiBadRequest('currentPassword is required')
    if (!code) return apiBadRequest('code is required (6-digit TOTP)')

    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, password: true, twoFactorEnabled: true, twoFactorSecret: true },
    })
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (!dbUser.twoFactorEnabled) {
      return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 })
    }

    // Verify password
    const { valid: pwValid } = await verifyPassword(currentPassword, dbUser.password)
    if (!pwValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 })
    }

    // Verify TOTP code
    let setup: StoredSetup
    try {
      setup = JSON.parse(dbUser.twoFactorSecret!) as StoredSetup
    } catch {
      return NextResponse.json({ error: 'Invalid stored 2FA state' }, { status: 500 })
    }
    if (!verifyTwoFactorCode(code, setup.secret)) {
      return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 400 })
    }

    // Disable + wipe stored secret
    await db.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    })

    await logUserActivity(user, {
      action: 'UPDATE',
      entityType: 'user',
      entityId: user.id,
      summary: `2FA disabled for ${dbUser.email}`,
      metadata: { email: dbUser.email },
    })

    return NextResponse.json({
      success: true,
      message: '2FA disabled. You can re-enable it anytime from Settings.',
    })
  } catch (error) {
    logApiError('auth/2fa/disable/POST', error)
    return NextResponse.json({ error: 'Failed to disable 2FA' }, { status: 500 })
  }
}
