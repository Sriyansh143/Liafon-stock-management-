import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Email service for sending password-reset verification links via Gmail.
 *
 * Setup:
 *   1. Enable 2-Step Verification on your Gmail account
 *   2. Generate an App Password at https://myaccount.google.com/apppasswords
 *   3. Set these env vars in .env:
 *        GMAIL_USER=your-email@gmail.com
 *        GMAIL_APP_PASSWORD=your-16-char-app-password
 *   4. Set APP_BASE_URL to the URL users will click (e.g. http://localhost:3000)
 *
 * If GMAIL_USER / GMAIL_APP_PASSWORD are not set, the email service is
 * disabled and password reset falls back to a dev mode that shows the
 * reset link directly in the UI (for local development only).
 */

let transporter: Transporter | null = null
let fromAddress: string | null = null

/** HTML-escape a string for safe interpolation into HTML email bodies. */
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getTransporter(): Transporter | null {
  if (transporter) return transporter

  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD

  if (!gmailUser || !gmailPass) {
    return null
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  })

  fromAddress = gmailUser
  return transporter
}

export function isEmailConfigured(): boolean {
  return getTransporter() !== null
}

export interface PasswordResetEmailParams {
  to: string
  userName: string
  resetToken: string
  baseUrl: string
}

export async function sendPasswordResetEmail(
  params: PasswordResetEmailParams
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const transport = getTransporter()
  if (!transport) {
    return {
      success: false,
      error: 'Email service is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env',
    }
  }

  const resetLink = `${params.baseUrl}/?reset-password=${params.resetToken}&email=${encodeURIComponent(params.to)}`

  // SECURITY: HTML-escape userName before interpolating into the HTML
  // body. Previously a user named `<script>alert(1)</script>` would
  // inject script into the email — most clients strip scripts, but
  // some older Outlook versions may render markup.
  const safeUserName = escapeHtml(params.userName)
  const safeResetLink = escapeHtml(resetLink)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#4f46e5;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.3px;">
                Liafon Stock Management
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#1a1a1a;">
                Reset your password
              </h2>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#555;">
                Hi ${safeUserName},
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">
                We received a request to reset your password. Click the button below to
                set a new password. This link will expire in 30 minutes.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center">
                    <a href="${safeResetLink}"
                       style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#777;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:#4f46e5;word-break:break-all;">
                ${safeResetLink}
              </p>
              <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#777;">
                If you didn't request a password reset, you can safely ignore this email.
                Your password will not be changed.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;line-height:1.5;">
                This is an automated email from Liafon Stock Management.<br/>
                © ${new Date().getFullYear()} Liafon Software. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  const text = `Liafon Stock Management — Password Reset

Hi ${params.userName},

We received a request to reset your password. Click the link below to set a new password. This link will expire in 30 minutes.

${resetLink}

If you didn't request a password reset, you can safely ignore this email.

© ${new Date().getFullYear()} Liafon Software
`

  try {
    const info = await transport.sendMail({
      from: `"Liafon Stock Management" <${fromAddress}>`,
      to: params.to,
      subject: 'Reset your password — Liafon Stock Management',
      text,
      html,
    })
    // Renamed from `previewUrl` (which was a Nodemailer Ethereal concept)
    // to `messageId` (which is what this actually is for Gmail).
    return { success: true, messageId: info.messageId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}
