import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { getWhatsAppStatus, disconnectWhatsApp } from '@/lib/baileys-whatsapp'

/**
 * GET /api/whatsapp/baileys/status
 *
 * Returns the WhatsApp connection status for the authenticated owner.
 * If not connected, returns a QR code (Base64 PNG data URL) that the
 * owner scans with their WhatsApp app (Settings → Linked Devices →
 * Link a Device → scan QR).
 *
 * The QR code expires after ~60 seconds — call this endpoint again to
 * get a fresh one.
 *
 * POST /api/whatsapp/baileys/status
 *   Body: { action: 'logout' }
 *   Logs out of WhatsApp + clears the session.
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const status = await getWhatsAppStatus(user.ownerId)
    return NextResponse.json(status)
  } catch (error) {
    logApiError('whatsapp/baileys/status/GET', error)
    return NextResponse.json({ error: 'Failed to get WhatsApp status' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    if (body.action !== 'logout') {
      return NextResponse.json({ error: 'Unknown action. Use { action: "logout" }.' }, { status: 400 })
    }

    const result = await disconnectWhatsApp(user.ownerId)
    return NextResponse.json({ success: result.success })
  } catch (error) {
    logApiError('whatsapp/baileys/status/POST', error)
    return NextResponse.json({ error: 'Failed to disconnect WhatsApp' }, { status: 500 })
  }
}
