import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { apiBadRequest, logApiError } from '@/lib/api-utils'
import { logActivity, getClientIP } from '@/lib/activity'
import { z } from 'zod'

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  email: z.string().email('Valid email is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
})

/**
 * POST /api/auth/reset-password
 * Body: { token, email, newPassword }
 *
 * Verifies the password-reset token (must exist, be unused, not expired,
 * and match the email). If valid, hashes the new password and updates
 * the user account. The token is marked as used so it can't be reused.
 *
 * This endpoint is unauthenticated (the user isn't logged in when they
 * click the reset link from their email).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) return apiBadRequest('Invalid body')

    const result = resetPasswordSchema.safeParse(body)
    if (!result.success) {
      return apiBadRequest(result.error.issues[0]?.message || 'Validation failed')
    }

    const { token, email, newPassword } = result.data
    const normalizedEmail = email.toLowerCase().trim()
    const ip = getClientIP(request)

    // Find the reset token
    const resetRecord = await db.passwordReset.findFirst({
      where: {
        token,
        email: normalizedEmail,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!resetRecord) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link. Please request a new one.' },
        { status: 400 }
      )
    }

    // Find the user
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true, isActive: true },
    })

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'Account not found or deactivated' },
        { status: 400 }
      )
    }

    // Hash the new password
    const hashedPassword = await hashPassword(newPassword)

    // Update the user's password and bump passwordChangedAt so any
    // existing sessions (e.g. on the attacker's device) are
    // invalidated. The user will need to sign in again on every device.
    await db.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    })

    // Mark the token as used
    await db.passwordReset.update({
      where: { id: resetRecord.id },
      data: { used: true },
    })

    // Invalidate ALL other unused tokens for this email
    await db.passwordReset.updateMany({
      where: { email: normalizedEmail, used: false, id: { not: resetRecord.id } },
      data: { used: true },
    })

    await logActivity({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} reset their password via email verification`,
      metadata: { email: normalizedEmail, method: 'email_reset' },
      ipAddress: ip,
    })

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully. You can now sign in with your new password.',
    })
  } catch (error) {
    logApiError('auth/reset-password', error)
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    )
  }
}
