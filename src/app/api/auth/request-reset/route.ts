import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiBadRequest, apiNotFound, logApiError } from '@/lib/api-utils'
import { sendPasswordResetEmail, isEmailConfigured } from '@/lib/email'
import { logActivity, getClientIP } from '@/lib/activity'
import { rateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'

/**
 * POST /api/auth/request-reset
 * Body: { email: string }
 *
 * Generates a password-reset token, stores it in the PasswordReset table
 * (expires in 30 minutes), and emails a verification link to the user
 * via Gmail (Nodemailer).
 *
 * For security, this endpoint ALWAYS returns 200 OK (even if the email
 * doesn't exist) so attackers can't enumerate which emails are registered.
 * The actual email is only sent if the user exists AND email is configured.
 *
 * If email is NOT configured (GMAIL_USER / GMAIL_APP_PASSWORD not set),
 * the endpoint returns the reset token in the response body for dev-mode
 * use (the client shows the link directly instead of emailing it).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) return apiBadRequest('Invalid body')

    const { email } = body as { email?: unknown }
    if (typeof email !== 'string' || !email.trim()) {
      return apiBadRequest('Email is required')
    }

    const normalizedEmail = email.toLowerCase().trim()
    const ip = getClientIP(request)

    // Rate-limit per IP+email to prevent email-bombing via Gmail
    // (which could trigger Gmail's own rate limits and cost the owner
    // money). 5 requests per hour per IP+email is generous for legit
    // users (who typically request a reset once) but blocks abusers.
    const rl = rateLimit('reset-request', `${ip}:${normalizedEmail}`, {
      max: 5,
      windowMs: 60 * 60 * 1000,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many reset requests. Try again in ${rl.retryAfterSec}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    // Always invalidate any existing unused tokens for this email
    await db.passwordReset.updateMany({
      where: { email: normalizedEmail, used: false },
      data: { used: true },
    })

    // Check if the user exists (but don't reveal this to the caller)
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true, isActive: true },
    })

    if (!user || !user.isActive) {
      // Log the attempt but return success (anti-enumeration)
      await logActivity({
        action: 'LOGIN_FAILED',
        entityType: 'user',
        summary: `Password reset requested for unknown email: ${normalizedEmail}`,
        metadata: { email: normalizedEmail, reason: 'no_such_user' },
        ipAddress: ip,
      })
      return NextResponse.json({
        success: true,
        message: 'If an account with that email exists, a reset link has been sent.',
      })
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 30) // 30-minute expiry

    await db.passwordReset.create({
      data: {
        email: normalizedEmail,
        token,
        expiresAt,
      },
    })

    // Determine the base URL for the reset link
    const baseUrl =
      process.env.APP_BASE_URL ||
      `${request.nextUrl.protocol}//${request.nextUrl.host}`

    // Try to send the email
    if (isEmailConfigured()) {
      const result = await sendPasswordResetEmail({
        to: normalizedEmail,
        userName: user.name,
        resetToken: token,
        baseUrl,
      })

      if (!result.success) {
        // SECURITY: previously this returned the devResetUrl to the
        // client when the email send failed (e.g. Gmail quota exceeded).
        // In production that leaks the reset token to anyone who can
        // trigger a reset. Now we log the failure server-side and
        // return a generic message. The token is still valid — if the
        // user retries and the email send succeeds, they'll get the
        // link. The owner can also look up the token in the DB if
        // the user gets locked out.
        console.error('[password-reset] Email send failed:', result.error)
        return NextResponse.json({
          success: true,
          message:
            'A reset link has been generated, but we could not send the email. ' +
            'Please contact the administrator or try again later.',
        })
      }

      await logActivity({
        userId: user.id,
        action: 'UPDATE',
        entityType: 'user',
        entityId: user.id,
        summary: `Password reset link emailed to ${normalizedEmail}`,
        metadata: { email: normalizedEmail },
        ipAddress: ip,
      })

      return NextResponse.json({
        success: true,
        message: 'A password reset link has been sent to your email. It will expire in 30 minutes.',
      })
    } else {
      // Dev mode — no email configured, return the link directly
      await logActivity({
        userId: user.id,
        action: 'UPDATE',
        entityType: 'user',
        entityId: user.id,
        summary: `Password reset token generated (dev mode — no email sent) for ${normalizedEmail}`,
        metadata: { email: normalizedEmail, devMode: true },
        ipAddress: ip,
      })

      return NextResponse.json({
        success: true,
        message: 'Email is not configured. Showing the reset link directly (dev mode).',
        devToken: token,
        devResetUrl: `${baseUrl}/?reset-password=${token}&email=${encodeURIComponent(normalizedEmail)}`,
      })
    }
  } catch (error) {
    logApiError('auth/request-reset', error)
    return NextResponse.json(
      { error: 'Failed to process password reset request' },
      { status: 500 }
    )
  }
}
