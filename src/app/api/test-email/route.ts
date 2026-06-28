import { NextRequest, NextResponse } from 'next/server'
import { guardAdmin, logApiError } from '@/lib/api-utils'
import { isEmailConfigured } from '@/lib/email'
import { getClientIP } from '@/lib/activity'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import nodemailer from 'nodemailer'

const testEmailSchema = z.object({
  to: z.string().trim().email('Recipient must be a valid email').max(160),
})

/**
 * POST /api/test-email
 * Admin+ only. Sends a test email to verify Gmail configuration.
 *
 * Body: { to: string } (the email address to send the test to)
 *
 * This endpoint bypasses the normal password-reset flow — it just
 * sends a simple "test" message to verify the SMTP connection works.
 */
export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    // Rate-limit per admin to 5 test emails per hour — prevents
    // accidential Gmail quota exhaustion from a stuck retry loop.
    const ip = getClientIP(request)
    const rl = rateLimit('test-email', `${user?.id || ip}`, {
      max: 5,
      windowMs: 60 * 60 * 1000,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many test emails. Try again in ${rl.retryAfterSec}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    // Validate `to` with Zod — previously it was just `String(body.to)`,
    // which accepted values like "foo@bar" or "a@b;c@d".
    const parsed = testEmailSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid recipient' },
        { status: 400 }
      )
    }
    const to = parsed.data.to

    const gmailUser = process.env.GMAIL_USER
    const gmailPass = process.env.GMAIL_APP_PASSWORD

    if (!gmailUser || !gmailPass) {
      return NextResponse.json({
        success: false,
        error: 'Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env file.',
        configured: false,
      }, { status: 400 })
    }

    // Create transporter and send test email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass },
    })

    const info = await transporter.sendMail({
      from: `"Liafon Stock Management" <${gmailUser}>`,
      to,
      subject: 'Liafon — Email Test Successful',
      text: `This is a test email from Liafon Stock Management.\n\nIf you received this, your Gmail configuration is working correctly.\n\nSent at: ${new Date().toISOString()}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;">
          <h2 style="color:#4f46e5;">Email Test Successful</h2>
          <p>This is a test email from <strong>Liafon Stock Management</strong>.</p>
          <p>If you received this, your Gmail configuration is working correctly. Password reset emails will now be sent to users who request them.</p>
          <p style="color:#666;font-size:12px;">Sent at: ${new Date().toISOString()}</p>
        </div>
      `,
    })

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${to}. Check the inbox.`,
      messageId: info.messageId,
    })
  } catch (error) {
    logApiError('test-email', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test email',
    }, { status: 500 })
  }
}
