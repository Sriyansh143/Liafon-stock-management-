import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { generateTwoFactorSetup } from '@/lib/totp'
import { verifyPassword } from '@/lib/auth'
import { logUserActivity } from '@/lib/activity'

/**
 * POST /api/auth/2fa/enable
 *
 * Initiates 2FA setup for the authenticated user.
 *
 * Body: { currentPassword: string }
 *
 * Returns:
 *   - otpauthUrl: otpauth:// URL — render as QR code for the user to scan
 *   - secret: Base32 secret (for manual entry)
 *   - backupCodes: 8 one-time backup codes (show ONCE)
 *
 * The user's `twoFactorSecret` is stored in DB but `twoFactorEnabled` is
 * NOT yet true. The user must verify a code via /api/auth/2fa/verify
 * to complete enablement.
 *
 * SECURITY: requires currentPassword to prevent session hijacking from
 * silently enabling 2FA (which would lock the real user out).
 */

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { currentPassword } = body as { currentPassword?: string }
    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required to enable 2FA' }, { status: 400 })
    }

    // Verify password
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, password: true, twoFactorEnabled: true, twoFactorSecret: true },
    })
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const { valid } = await verifyPassword(currentPassword, dbUser.password)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 })
    }

    if (dbUser.twoFactorEnabled) {
      return NextResponse.json({ error: '2FA is already enabled for this account' }, { status: 400 })
    }

    // Generate new secret + backup codes
    const setup = generateTwoFactorSetup(dbUser.email)

    // Store the secret + hashed backup codes (NOT yet enabled)
    // We store backup codes hashed in `twoFactorSecret` field as JSON
    // { secret, backupCodes: string[] } — wait, that conflates two things.
    // Better: add a separate column. But to avoid a schema migration right now,
    // we encode both in twoFactorSecret as JSON until verified.
    await db.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: JSON.stringify({
          secret: setup.secret,
          backupCodesHashed: setup.backupCodesHashed,
          pendingEnable: true,
        }),
      },
    })

    await logUserActivity(user, {
      action: 'UPDATE',
      entityType: 'user',
      entityId: user.id,
      summary: `2FA setup initiated for ${user.email}`,
      metadata: { email: user.email },
    })

    return NextResponse.json({
      success: true,
      otpauthUrl: setup.otpauthUrl,
      secret: setup.secret,
      backupCodes: setup.backupCodes,
      message: 'Scan the QR code with your authenticator app, then verify a code to complete setup.',
    })
  } catch (error) {
    logApiError('auth/2fa/enable/POST', error)
    return NextResponse.json({ error: 'Failed to initiate 2FA setup' }, { status: 500 })
  }
}
