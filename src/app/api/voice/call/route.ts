import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError, apiBadRequest } from '@/lib/api-utils'
import { initiateVoiceCall, generateJitsiRoomUrl, isVoiceConfigured } from '@/lib/voice-call'

/**
 * POST /api/voice/call
 *
 * Initiate a voice call OR generate a video call room URL.
 *
 * Body: {
 *   action: 'call' | 'video_room',
 *   to?: string,         // For 'call' — phone number
 *   from?: string,       // For 'call' — caller ID (shop phone)
 *   ttsText?: string,    // For 'call' — text to speak
 *   customerName?: string,  // For 'video_room' — display name
 * }
 *
 * ─── Free + open-source ────────────────────────────────────────────────────
 * - Voice calls route through FreeSWITCH (MIT) or Asterisk (GPL) via a
 *   self-hosted voice gateway. NO per-minute Twilio charges.
 * - Video calls use Jitsi Meet (Apache 2.0) — free public instance
 *   (meet.jit.si) or self-hosted.
 *
 * If no voice gateway is configured, returns a `tel:` deep link for the
 * user to click manually (opens phone dialer on mobile).
 */

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { action } = body as { action?: string }

    // ─── Generate Jitsi video room ──────────────────────────────────────
    if (action === 'video_room') {
      const { customerName } = body as { customerName?: string }
      const roomUrl = generateJitsiRoomUrl(customerName)
      return NextResponse.json({
        success: true,
        roomUrl,
        provider: 'jitsi',
        message: 'Share this URL with the customer. Jitsi works in any browser — no app install needed.',
      })
    }

    // ─── Initiate voice call ────────────────────────────────────────────
    if (action === 'call') {
      const { to, from, ttsText } = body as { to?: string; from?: string; ttsText?: string }
      if (!to) return apiBadRequest('to (phone number) is required')

      const result = await initiateVoiceCall({ to, from, ttsText })
      if (!result.success && !result.telLink) {
        return NextResponse.json({ error: result.error }, { status: 500 })
      }
      return NextResponse.json({
        success: true,
        callId: result.callId,
        viaGateway: result.viaGateway,
        telLink: result.telLink,
        message: result.viaGateway
          ? 'Call initiated via voice gateway.'
          : 'No voice gateway configured. Click the telLink to open the phone dialer.',
      })
    }

    return apiBadRequest(`Unknown action: ${action}. Use 'call' or 'video_room'.`)
  } catch (error) {
    logApiError('voice/call/POST', error)
    return NextResponse.json({ error: 'Failed to initiate voice call' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    return NextResponse.json({
      voiceConfigured: isVoiceConfigured(),
      gatewayUrl: process.env.VOICE_GATEWAY_URL || null,
      jitsiServerUrl: process.env.JITSI_SERVER_URL || 'https://meet.jit.si',
      supportedActions: ['call', 'video_room'],
      note: 'Voice calls require a self-hosted FreeSWITCH/Asterisk gateway (open source, free). Video calls use Jitsi (free, no setup).',
    })
  } catch (error) {
    logApiError('voice/call/GET', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
