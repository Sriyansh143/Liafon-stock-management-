/**
 * Free WhatsApp integration via @whiskeysockets/baileys.
 *
 * ─── Why Baileys? ──────────────────────────────────────────────────────────
 * Baileys is the only production-grade open-source WhatsApp Web library
 * for Node.js. It connects directly to WhatsApp's Web API (no paid API
 * gateway like Twilio, MessageBird, or 360dialog needed).
 *
 * License: MIT (free for commercial use)
 * Repo:    https://github.com/WhiskeySockets/Baileys
 *
 * ─── How it works ──────────────────────────────────────────────────────────
 * 1. The owner pairs their WhatsApp account by scanning a QR code
 *    (same flow as web.whatsapp.com). The auth state is persisted to
 *    Supabase Storage (or local filesystem in dev) so it survives
 *    server restarts.
 *
 * 2. Once paired, the app can send messages from the owner's WhatsApp
 *    number — no per-message fees.
 *
 * ─── Limitations (IMPORTANT) ───────────────────────────────────────────────
 * - WhatsApp's ToS technically prohibits automated messaging. Use for
 *   transactional alerts (invoice, low-stock) only — NOT bulk marketing.
 * - One WhatsApp account per Baileys session. Multi-tenant apps need
 *   one session per owner (keyed by ownerId).
 * - On Vercel serverless, Baileys can't hold a persistent WebSocket
 *   connection. For production, run Baileys on a separate small VPS
 *   (or Railway/Render free tier) and expose a small HTTP API that
 *   Vercel calls. This module provides a "client mode" that talks to
 *   that external Baileys server.
 *
 * ─── Two deployment modes ──────────────────────────────────────────────────
 * Mode A (self-hosted / VPS):  Set BAILEYS_SERVER_URL= (empty). The app
 *   runs Baileys in-process. Best for self-hosted deployments.
 *
 * Mode B (Vercel):             Set BAILEYS_SERVER_URL=https://your-baileys-vps.up.railway.app
 *   The app makes HTTP calls to that external server, which runs the
 *   included `scripts/baileys-server.js` (separate Node.js process).
 *
 * In both modes, the API surface is the same — see `sendWhatsApp()`.
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type BaileysEventMap,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

// ─── Mode detection ────────────────────────────────────────────────────────

/** True if running in Vercel (or any environment without persistent WebSocket). */
function isServerless(): boolean {
  return process.env.VERCEL === '1' || !!process.env.BAILEYS_SERVER_URL
}

/** The external Baileys server URL (Mode B). */
function getBaileysServerUrl(): string | null {
  return process.env.BAILEYS_SERVER_URL || null
}

// ─── In-process socket (Mode A only) ───────────────────────────────────────

interface InProcessSession {
  sock: WASocket
  qrCode: string | null
  ready: boolean
}

const sessions = new Map<string, InProcessSession>()

/**
 * Get or create an in-process Baileys socket for an owner.
 * Only used in Mode A (self-hosted). On Vercel, use `sendWhatsApp()` which
 * routes to the external Baileys server.
 */
async function getInProcessSocket(ownerId: string): Promise<InProcessSession> {
  const existing = sessions.get(ownerId)
  if (existing) return existing

  // Auth state: persisted to /tmp on Vercel (ephemeral — note the limitation
  // in the file header). For self-hosted, persisted to ./data/baileys-auth.
  const authDir = process.env.VERCEL === '1'
    ? path.join(os.tmpdir(), `baileys-auth-${ownerId}`)
    : path.resolve(process.cwd(), 'data', 'baileys-auth', ownerId)
  await fs.mkdir(authDir, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(authDir)

  const { version } = await fetchLatestBaileysVersion()

  const session: InProcessSession = {
    sock: null as unknown as WASocket,
    qrCode: null,
    ready: false,
  }

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
  })
  session.sock = sock

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update: BaileysEventMap['connection.update']) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      session.qrCode = qr
    }
    if (connection === 'open') {
      session.ready = true
      session.qrCode = null
    } else if (connection === 'close') {
      session.ready = false
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        // Reconnect after 1s
        setTimeout(() => {
          sessions.delete(ownerId)
          void getInProcessSocket(ownerId)
        }, 1000)
      } else {
        // Logged out — clear auth state
        sessions.delete(ownerId)
        void fs.rm(authDir, { recursive: true, force: true })
      }
    }
  })

  sessions.set(ownerId, session)
  return session
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface WhatsAppSendResult {
  success: boolean
  messageId?: string
  error?: string
  /** True if sent via external Baileys server (Mode B). */
  viaExternalServer: boolean
}

export interface WhatsAppStatusResult {
  connected: boolean
  /** The phone number currently paired (without @s.whatsapp.net suffix). */
  phoneNumber?: string
  /** A fresh QR code to scan (Base64 PNG data URL) — only when not connected. */
  qrCode?: string | null
  viaExternalServer: boolean
  /** Error message (only set when the external server is unreachable). */
  error?: string
}

/**
 * Send a WhatsApp message. Routes to in-process Baileys (Mode A) or to the
 * external Baileys server (Mode B) based on env vars.
 *
 * @param ownerId  The owner ID (used to look up the right session)
 * @param to       Phone number in international format (e.g. "919876543210")
 * @param message  Text to send
 */
export async function sendWhatsApp(
  ownerId: string,
  to: string,
  message: string
): Promise<WhatsAppSendResult> {
  // Normalize phone (strip +, spaces, dashes)
  const normalizedPhone = to.replace(/[^\d]/g, '')
  const jid = `${normalizedPhone}@s.whatsapp.net`

  // ─── Mode B: external Baileys server (Vercel) ──────────────────────────
  const serverUrl = getBaileysServerUrl()
  if (serverUrl) {
    try {
      const res = await fetch(`${serverUrl}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.BAILEYS_API_KEY || '',
        },
        body: JSON.stringify({ ownerId, to: jid, message }),
      })
      if (!res.ok) {
        const text = await res.text()
        return { success: false, error: `Baileys server error: ${res.status} ${text}`, viaExternalServer: true }
      }
      const data = (await res.json()) as { success: boolean; messageId?: string; error?: string }
      return { ...data, viaExternalServer: true }
    } catch (err) {
      return {
        success: false,
        error: `Failed to reach Baileys server: ${err instanceof Error ? err.message : 'Unknown'}`,
        viaExternalServer: true,
      }
    }
  }

  // ─── Mode A: in-process Baileys (self-hosted) ─────────────────────────
  try {
    const session = await getInProcessSocket(ownerId)
    if (!session.ready) {
      return {
        success: false,
        error: 'WhatsApp not connected. Scan the QR code first.',
        viaExternalServer: false,
      }
    }
    const result = await session.sock.sendMessage(jid, { text: message })
    return {
      success: true,
      messageId: result?.key?.id ?? undefined,
      viaExternalServer: false,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      viaExternalServer: false,
    }
  }
}

/**
 * Get the connection status + (if disconnected) a fresh QR code to scan.
 * The QR code is a Base64 data URL that can be rendered directly in an <img> tag.
 */
export async function getWhatsAppStatus(ownerId: string): Promise<WhatsAppStatusResult> {
  // Mode B: external server
  const serverUrl = getBaileysServerUrl()
  if (serverUrl) {
    try {
      const res = await fetch(`${serverUrl}/status?ownerId=${ownerId}`, {
        headers: { 'x-api-key': process.env.BAILEYS_API_KEY || '' },
      })
      if (!res.ok) {
        return { connected: false, viaExternalServer: true, error: `Server error: ${res.status}` } as WhatsAppStatusResult & { error: string }
      }
      const data = (await res.json()) as WhatsAppStatusResult
      return { ...data, viaExternalServer: true }
    } catch (err) {
      return {
        connected: false,
        error: `Failed to reach Baileys server: ${err instanceof Error ? err.message : 'Unknown'}`,
        viaExternalServer: true,
      }
    }
  }

  // Mode A: in-process
  try {
    const session = await getInProcessSocket(ownerId)
    return {
      connected: session.ready,
      qrCode: session.qrCode,
      viaExternalServer: false,
    }
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : 'Unknown',
      viaExternalServer: false,
    }
  }
}

/**
 * Disconnect + clear the Baileys session for an owner (logs out of WhatsApp).
 * Used when the owner wants to unpair their number.
 */
export async function disconnectWhatsApp(ownerId: string): Promise<{ success: boolean }> {
  const serverUrl = getBaileysServerUrl()
  if (serverUrl) {
    try {
      await fetch(`${serverUrl}/logout?ownerId=${ownerId}`, {
        method: 'POST',
        headers: { 'x-api-key': process.env.BAILEYS_API_KEY || '' },
      })
    } catch {
      // ignore
    }
    return { success: true }
  }

  const session = sessions.get(ownerId)
  if (session) {
    try {
      await session.sock.logout()
    } catch {
      // ignore
    }
    sessions.delete(ownerId)
  }
  return { success: true }
}

export function isWhatsAppConfigured(): boolean {
  // Always "configured" — Mode A works without env vars (in-process)
  return true
}

export function isServerlessMode(): boolean {
  return isServerless()
}
