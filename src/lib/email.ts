import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Email service for sending transactional emails.
 *
 * ─── Supported providers ───────────────────────────────────────────────────
 *
 * This module supports BOTH:
 *
 * 1. Gmail (legacy / backward compat):
 *      GMAIL_USER=your-email@gmail.com
 *      GMAIL_APP_PASSWORD=your-16-char-app-password
 *
 * 2. Any SMTP provider (Outlook, SendGrid, SES, Mailgun, Zoho, etc.):
 *      SMTP_HOST=smtp.sendgrid.net
 *      SMTP_PORT=587                  (or 465 for SSL, 25 for unencrypted)
 *      SMTP_USER=apikey               (SendGrid uses "apikey" as the username)
 *      SMTP_PASS=SG.xxxxxxxx
 *      SMTP_FROM="Liafon <noreply@yourdomain.com>"
 *      SMTP_SECURE=false              (true for 465, false for 587)
 *
 *    Common providers:
 *      - Outlook/Hotmail: smtp.office365.com:587
 *      - SendGrid:         smtp.sendgrid.net:587 (user: "apikey")
 *      - Amazon SES:       email-smtp.us-east-1.amazonaws.com:587
 *      - Mailgun:          smtp.mailgun.org:587
 *      - Zoho Mail:        smtp.zoho.com:465 (SMTP_SECURE=true)
 *
 * SMTP_* vars take precedence over GMAIL_* vars when both are set.
 *
 * If NEITHER set of vars is configured, the email service is disabled
 * and password reset falls back to a dev mode that shows the reset link
 * directly in the UI (for local development only).
 *
 * ─── Extending ─────────────────────────────────────────────────────────────
 *
 * To send NEW types of emails (welcome, sale receipt, low-stock alert),
 * add a new `sendXxxEmail()` function below. Re-use the same transporter
 * (cached via `getTransporter()`). HTML-escape all user-provided strings
 * via `escapeHtml()` before interpolating into the HTML body.
 */

let transporter: Transporter | null = null
let cachedFromAddress: string | null = null

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

  // ─── SMTP provider (Outlook, SendGrid, SES, Mailgun, etc.) ────────────
  const smtpHost = process.env.SMTP_HOST
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10)
  const smtpSecure = process.env.SMTP_SECURE === 'true'

  if (smtpHost && smtpUser && smtpPass) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number.isFinite(smtpPort) ? smtpPort : 587,
      secure: smtpSecure,    // true for port 465, false for 587 (STARTTLS)
      auth: { user: smtpUser, pass: smtpPass },
    })
    cachedFromAddress = process.env.SMTP_FROM || smtpUser
    return transporter
  }

  // ─── Gmail (legacy backward compat) ───────────────────────────────────
  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD
  if (gmailUser && gmailPass) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass },
    })
    cachedFromAddress = gmailUser
    return transporter
  }

  return null
}

export function isEmailConfigured(): boolean {
  return getTransporter() !== null
}

/** Get the configured "from" address (used by all sendXxxEmail functions). */
export function getFromAddress(): string | null {
  getTransporter()   // ensures cachedFromAddress is populated
  return cachedFromAddress
}

// ─── Password Reset Email ───────────────────────────────────────────────────

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
      error: 'Email service is not configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS or GMAIL_USER/GMAIL_APP_PASSWORD in .env',
    }
  }

  const resetLink = `${params.baseUrl}/?reset-password=${params.resetToken}&email=${encodeURIComponent(params.to)}`

  // SECURITY: HTML-escape userName before interpolating into the HTML body.
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
      from: `"Liafon Stock Management" <${cachedFromAddress}>`,
      to: params.to,
      subject: 'Reset your password — Liafon Stock Management',
      text,
      html,
    })
    return { success: true, messageId: info.messageId }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}

// ─── Sale Receipt Email ─────────────────────────────────────────────────────

export interface SaleReceiptEmailParams {
  to: string
  customerName: string
  invoiceNumber: string
  date: string
  items: Array<{
    name: string
    partNumber: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }>
  subtotal: number
  taxAmount: number
  total: number
  currency: string
  shopName: string
}

/**
 * Send a sale receipt to the customer. Best-effort: caller swallows errors
 * because a failed email shouldn't block the sale from completing.
 */
export async function sendSaleReceiptEmail(
  params: SaleReceiptEmailParams
): Promise<{ success: boolean; error?: string }> {
  const transport = getTransporter()
  if (!transport) return { success: false, error: 'Email not configured' }

  const safeCustomer = escapeHtml(params.customerName)
  const safeInvoice = escapeHtml(params.invoiceNumber)
  const safeShop = escapeHtml(params.shopName)

  const itemRows = params.items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">
          ${escapeHtml(item.name)}<br/>
          <span style="color:#9ca3af;font-size:11px;">${escapeHtml(item.partNumber)}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${item.unitPrice.toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${item.totalPrice.toFixed(2)}</td>
      </tr>
    `
    )
    .join('')

  const symbol = params.currency === 'INR' ? '₹' : params.currency + ' '

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${safeInvoice}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:#4f46e5;padding:24px 40px;">
          <h1 style="margin:0;color:#fff;font-size:18px;font-weight:600;">${safeShop}</h1>
          <p style="margin:4px 0 0;color:#e0e7ff;font-size:12px;">Invoice ${safeInvoice} · ${new Date(params.date).toLocaleDateString('en-IN')}</p>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 16px;font-size:14px;color:#555;">Hi ${safeCustomer},</p>
          <p style="margin:0 0 24px;font-size:14px;color:#555;">Thank you for your purchase. Here's your invoice:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:4px;">
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Item</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Qty</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Unit Price</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Total</th>
            </tr>
            ${itemRows}
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            <tr><td style="padding:4px 0;font-size:13px;color:#555;">Subtotal</td><td style="padding:4px 0;font-size:13px;text-align:right;color:#555;">${symbol}${params.subtotal.toFixed(2)}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#555;">Tax</td><td style="padding:4px 0;font-size:13px;text-align:right;color:#555;">${symbol}${params.taxAmount.toFixed(2)}</td></tr>
            <tr><td style="padding:12px 0;font-size:15px;font-weight:600;color:#1a1a1a;border-top:2px solid #e5e7eb;">Total</td><td style="padding:12px 0;font-size:15px;font-weight:600;color:#1a1a1a;border-top:2px solid #e5e7eb;text-align:right;">${symbol}${params.total.toFixed(2)}</td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            This is an automated receipt from ${safeShop}.<br/>
            © ${new Date().getFullYear()} ${safeShop}. All rights reserved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`

  try {
    await transport.sendMail({
      from: `"${safeShop}" <${cachedFromAddress}>`,
      to: params.to,
      subject: `Invoice ${safeInvoice} from ${safeShop}`,
      html,
    })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}

// ─── Low-Stock Alert Email ──────────────────────────────────────────────────

export interface LowStockAlertEmailParams {
  to: string
  shopName: string
  parts: Array<{ name: string; partNumber: string; currentStock: number; minStockLevel: number }>
}

/**
 * Send a low-stock alert email to the owner.
 * Caller decides when to trigger (typically from a cron job).
 */
export async function sendLowStockAlertEmail(
  params: LowStockAlertEmailParams
): Promise<{ success: boolean; error?: string }> {
  const transport = getTransporter()
  if (!transport) return { success: false, error: 'Email not configured' }

  const safeShop = escapeHtml(params.shopName)
  const itemRows = params.parts
    .map(
      (p) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${escapeHtml(p.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${escapeHtml(p.partNumber)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;color:#dc2626;font-weight:600;">${p.currentStock}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">${p.minStockLevel}</td>
      </tr>
    `
    )
    .join('')

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Low Stock Alert</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:#dc2626;padding:24px 40px;">
          <h1 style="margin:0;color:#fff;font-size:18px;font-weight:600;">⚠ Low Stock Alert — ${safeShop}</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <p style="margin:0 0 16px;font-size:14px;color:#555;">
            The following ${params.parts.length} ${params.parts.length === 1 ? 'part is' : 'parts are'} below their minimum stock level. Restock soon to avoid stockouts.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:4px;">
            <tr style="background:#f9fafb;">
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Part</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;">Number</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Current</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;">Min</th>
            </tr>
            ${itemRows}
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`

  try {
    await transport.sendMail({
      from: `"${safeShop}" <${cachedFromAddress}>`,
      to: params.to,
      subject: `⚠ Low Stock Alert — ${params.parts.length} items need restocking`,
      html,
    })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    }
  }
}
