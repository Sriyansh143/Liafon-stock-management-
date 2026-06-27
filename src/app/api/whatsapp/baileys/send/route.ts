import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, logApiError, apiBadRequest } from '@/lib/api-utils'
import { sendWhatsApp } from '@/lib/baileys-whatsapp'
import { logUserActivity } from '@/lib/activity'

/**
 * POST /api/whatsapp/baileys/send
 *
 * Send a WhatsApp message via free Baileys library (no paid Twilio API).
 *
 * Body: {
 *   to: string,         // Phone number in international format (e.g. "919876543210")
 *   message: string,    // Text to send
 * }
 *
 * The owner must first pair their WhatsApp account by scanning the QR
 * code from /api/whatsapp/baileys/status.
 *
 * On Vercel, this routes to the external Baileys server (BAILEYS_SERVER_URL).
 * Self-hosted: runs Baileys in-process.
 */

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { to, message } = body as { to?: string; message?: string }
    if (!to) return apiBadRequest('to (phone number) is required')
    if (!message) return apiBadRequest('message is required')

    // Basic phone format validation
    const normalized = to.replace(/[^\d]/g, '')
    if (normalized.length < 10 || normalized.length > 15) {
      return apiBadRequest('Invalid phone number. Use international format (e.g. 919876543210)')
    }

    const result = await sendWhatsApp(user.ownerId, normalized, message)

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'whatsapp',
      summary: `WhatsApp message sent to ${normalized}: ${message.slice(0, 50)}${message.length > 50 ? '...' : ''}`,
      metadata: {
        to: normalized,
        messageLength: message.length,
        success: result.success,
        viaExternalServer: result.viaExternalServer,
        messageId: result.messageId,
      },
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send WhatsApp message', viaExternalServer: result.viaExternalServer },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      viaExternalServer: result.viaExternalServer,
    })
  } catch (error) {
    logApiError('whatsapp/baileys/send/POST', error)
    return NextResponse.json({ error: 'Failed to send WhatsApp message' }, { status: 500 })
  }
}
