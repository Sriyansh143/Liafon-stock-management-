/**
 * Voice call integration via free, open-source telephony stacks.
 *
 * ─── Why no Twilio? ─────────────────────────────────────────────────────────
 * Twilio charges per-minute for voice calls (~$0.015/min for India).
 * For an SMB auto-parts shop, that's overkill. The two open-source stacks
 * below provide FREE voice calling if you have a SIP trunk or a VoIP
 * provider (like VoIP.ms at $0.005/min, or even a free Google Voice
 * number for personal use).
 *
 * ─── Supported stacks ──────────────────────────────────────────────────────
 * 1. **FreeSWITCH** (https://freeswitch.org/) — MIT-licensed, more modern.
 *    Has a JSON-RPC API ("mod_event_socket") that this module talks to.
 *
 * 2. **Asterisk** (https://www.asterisk.org/) — GPL-licensed, the OG.
 *    Has a REST interface (ARI) we can call.
 *
 * 3. **Jitsi Meet** (https://jitsi.org/) — for video calls. Apache 2.0.
 *    Used when the user wants to "share screen with the customer" — the
 *    app generates a Jitsi room URL and sends it via WhatsApp/SMS.
 *
 * ─── Vercel deployment note ────────────────────────────────────────────────
 * Vercel serverless can't hold a long-lived socket to FreeSWITCH/Asterisk.
 * So this module makes HTTP calls to an external "voice gateway" — a small
 * Node.js process running on a VPS (or Railway/Render free tier) that has
 * the FreeSWITCH socket connection. The gateway exposes:
 *
 *   POST /call         — initiate a call
 *   GET  /status/:id   — get call status
 *   POST /hangup/:id   — hang up
 *
 * The gateway code is in `scripts/voice-gateway.js` (separate file).
 *
 * ─── When voice gateway is NOT configured ──────────────────────────────────
 * Falls back to generating a `tel:` deep link — clicking it on mobile opens
 * the phone dialer. No voice call is placed automatically, but the UX is
 * smooth.
 */

export interface VoiceCallParams {
  /** Phone number to call (international format, e.g. "919876543210"). */
  to: string
  /** Caller ID (the shop's phone number, must be registered with your SIP trunk). */
  from?: string
  /** Optional text to speak (uses TTS via FreeSWITCH's mod_tts_command). */
  ttsText?: string
  /** Optional audio file URL to play (mp3/wav). */
  audioUrl?: string
}

export interface VoiceCallResult {
  success: boolean
  callId?: string
  /** True if placed via external voice gateway (Mode B). */
  viaGateway: boolean
  /** If no gateway configured, contains a `tel:` link the user can click. */
  telLink?: string
  error?: string
}

/**
 * Initiate a voice call.
 *
 * If `VOICE_GATEWAY_URL` env var is set, routes through the external
 * FreeSWITCH/Asterisk gateway. Otherwise, returns a `tel:` deep link
 * for the user to click manually.
 */
export async function initiateVoiceCall(params: VoiceCallParams): Promise<VoiceCallResult> {
  const gatewayUrl = process.env.VOICE_GATEWAY_URL

  if (!gatewayUrl) {
    // ─── Fallback: tel: deep link ────────────────────────────────────────
    const normalized = params.to.replace(/[^\d+]/g, '')
    return {
      success: true,
      viaGateway: false,
      telLink: `tel:${normalized}`,
    }
  }

  // ─── Mode B: external voice gateway ──────────────────────────────────
  try {
    const res = await fetch(`${gatewayUrl}/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.VOICE_GATEWAY_API_KEY || '',
      },
      body: JSON.stringify({
        to: params.to,
        from: params.from,
        tts_text: params.ttsText,
        audio_url: params.audioUrl,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { success: false, viaGateway: true, error: `Gateway error: ${res.status} ${text}` }
    }
    const data = (await res.json()) as { call_id?: string; error?: string }
    return {
      success: !!data.call_id,
      callId: data.call_id,
      viaGateway: true,
      error: data.error,
    }
  } catch (err) {
    return {
      success: false,
      viaGateway: true,
      error: `Failed to reach voice gateway: ${err instanceof Error ? err.message : 'Unknown'}`,
    }
  }
}

/**
 * Get the status of a placed call (ringing, answered, hung up, etc.).
 * Only works when using the external gateway.
 */
export async function getCallStatus(callId: string): Promise<{
  status: 'unknown' | 'ringing' | 'answered' | 'hungup' | 'failed'
  durationSec?: number
}> {
  const gatewayUrl = process.env.VOICE_GATEWAY_URL
  if (!gatewayUrl) return { status: 'unknown' }
  try {
    const res = await fetch(`${gatewayUrl}/status/${callId}`, {
      headers: { 'x-api-key': process.env.VOICE_GATEWAY_API_KEY || '' },
    })
    if (!res.ok) return { status: 'unknown' }
    const data = (await res.json()) as { status?: string; duration_sec?: number }
    return {
      status: (data.status as 'ringing' | 'answered' | 'hungup' | 'failed') ?? 'unknown',
      durationSec: data.duration_sec,
    }
  } catch {
    return { status: 'unknown' }
  }
}

/**
 * Generate a Jitsi Meet room URL for video calls.
 * Jitsi is free + open source — no API key needed.
 *
 * The room name is randomized (8 chars). The URL opens Jitsi Meet in the
 * browser — no app install required.
 */
export function generateJitsiRoomUrl(customerName?: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const room = Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  const label = customerName ? `?userInfo.displayName="${encodeURIComponent(customerName)}"` : ''
  // Use the public Jitsi Meet instance (free, no setup).
  // For self-hosted, set JITSI_SERVER_URL env var.
  const server = process.env.JITSI_SERVER_URL || 'https://meet.jit.si'
  return `${server}/${room}${label}`
}

export function isVoiceConfigured(): boolean {
  return !!process.env.VOICE_GATEWAY_URL
}
