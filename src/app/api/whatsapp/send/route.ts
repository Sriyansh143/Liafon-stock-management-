import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, apiBadRequest, logApiError } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'
import { getClientIP } from '@/lib/activity'
import { rateLimit } from '@/lib/rate-limit'

// Basic E.164-ish phone validation: optional leading + followed by 6-15 digits
const PHONE_RE = /^\+?\d{6,15}$/

// wa.me URLs truncate after ~2000 chars; cap our encoded payload well
// below that to avoid silent truncation.
const WAME_MAX_ENCODED_LEN = 1500

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr) return authErr

    // Rate-limit per user: 30 messages per 5 minutes. Prevents abuse
    // (e.g. spam-blasting customers) without hampering normal use.
    const ip = getClientIP(request)
    const rl = rateLimit('whatsapp-send', `${user?.id || ip}`, {
      max: 30,
      windowMs: 5 * 60 * 1000,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many WhatsApp messages. Try again in ${rl.retryAfterSec}s.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) return apiBadRequest('Invalid JSON body')

    const { phone, message, department } = body as {
      phone?: unknown
      message?: unknown
      department?: unknown
    }

    if (typeof phone !== 'string' || !phone.trim()) {
      return apiBadRequest('Phone number is required')
    }
    if (typeof message !== 'string' || !message.trim()) {
      return apiBadRequest('Message is required')
    }
    if (message.length > 4096) {
      return apiBadRequest('Message is too long (max 4096 characters)')
    }

    // Clean phone number - remove any non-digit characters except leading +
    const cleanPhone = phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')

    if (!PHONE_RE.test(cleanPhone)) {
      return apiBadRequest('Invalid phone number format')
    }

    const openwaApiUrl = process.env.OPENWA_API_URL
    const openwaApiKey = process.env.OPENWA_API_KEY
    const openwaSession = process.env.OPENWA_SESSION || 'default'

    // Try OpenWA API first
    if (openwaApiUrl && openwaApiKey) {
      try {
        const openwaResponse = await fetch(
          `${openwaApiUrl}/sessions/${openwaSession}/messages/text`,
          {
            method: 'POST',
            headers: {
              apikey: openwaApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chatId: `${cleanPhone}@c.us`,
              text: message,
            }),
          }
        )

        if (openwaResponse.ok) {
          await logUserActivity(user, {
            action: 'CREATE',
            entityType: 'whatsapp',
            entityId: cleanPhone,
            summary: `WhatsApp message sent to ${cleanPhone}`,
            metadata: { method: 'openwa', department: department || null },
          })
          return NextResponse.json({
            success: true,
            method: 'openwa',
            phone: cleanPhone,
            message: `Message sent via OpenWA to ${cleanPhone}`,
            department: department || undefined,
          })
        }

        // SECURITY: don't log the full response body — it can contain
        // session tokens or internal error details that persist in logs.
        // Status code + short status text is enough for debugging.
        console.error(
          `[whatsapp] OpenWA API error: status ${openwaResponse.status} ${openwaResponse.statusText}`
        )
      } catch (err) {
        // Log only a generic message; the underlying error may contain
        // network paths or credentials.
        console.error('[whatsapp] OpenWA connection error:', err instanceof Error ? err.message : 'unknown')
      }
    }

    // Fallback: return wa.me URL. Truncate the encoded message so the
    // URL stays under wa.me's ~2000-char limit (otherwise wa.me
    // silently truncates or rejects the request).
    let encodedMessage = encodeURIComponent(message)
    if (encodedMessage.length > WAME_MAX_ENCODED_LEN) {
      encodedMessage = encodedMessage.slice(0, WAME_MAX_ENCODED_LEN)
    }
    const waUrl = `https://wa.me/${cleanPhone.replace('+', '')}?text=${encodedMessage}`

    return NextResponse.json({
      success: true,
      method: 'wame',
      fallback: true,
      url: waUrl,
      phone: cleanPhone,
      message: 'OpenWA not configured or unavailable. Use wa.me link as fallback.',
      department: department || undefined,
    })
  } catch (error) {
    logApiError('whatsapp/send', error)
    return NextResponse.json(
      { error: 'Failed to send WhatsApp message' },
      { status: 500 }
    )
  }
}
