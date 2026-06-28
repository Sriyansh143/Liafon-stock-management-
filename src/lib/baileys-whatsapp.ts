/** Free WhatsApp via Baileys — no paid Twilio. */
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, type WASocket, type BaileysEventMap } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

function isServerless(): boolean { return process.env.VERCEL === '1' || !!process.env.BAILEYS_SERVER_URL }
function getBaileysServerUrl(): string | null { return process.env.BAILEYS_SERVER_URL || null }

interface InProcessSession { sock: WASocket; qrCode: string | null; ready: boolean }
const sessions = new Map<string, InProcessSession>()

async function getInProcessSocket(ownerId: string): Promise<InProcessSession> {
  const existing = sessions.get(ownerId)
  if (existing) return existing
  const authDir = process.env.VERCEL === '1' ? path.join(os.tmpdir(), `baileys-auth-${ownerId}`) : path.resolve(process.cwd(), 'data', 'baileys-auth', ownerId)
  await fs.mkdir(authDir, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()
  const session: InProcessSession = { sock: null as unknown as WASocket, qrCode: null, ready: false }
  const sock = makeWASocket({ version, auth: state, printQRInTerminal: false })
  session.sock = sock
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (update: BaileysEventMap['connection.update']) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) session.qrCode = qr
    if (connection === 'open') { session.ready = true; session.qrCode = null }
    else if (connection === 'close') {
      session.ready = false
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) { setTimeout(() => { sessions.delete(ownerId); void getInProcessSocket(ownerId) }, 1000) }
      else { sessions.delete(ownerId); void fs.rm(authDir, { recursive: true, force: true }) }
    }
  })
  sessions.set(ownerId, session)
  return session
}

export interface WhatsAppSendResult { success: boolean; messageId?: string; error?: string; viaExternalServer: boolean }
export interface WhatsAppStatusResult { connected: boolean; phoneNumber?: string; qrCode?: string | null; viaExternalServer: boolean; error?: string }

export async function sendWhatsApp(ownerId: string, to: string, message: string): Promise<WhatsAppSendResult> {
  const jid = `${to.replace(/[^\d]/g, '')}@s.whatsapp.net`
  const serverUrl = getBaileysServerUrl()
  if (serverUrl) {
    try {
      const res = await fetch(`${serverUrl}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.BAILEYS_API_KEY || '' }, body: JSON.stringify({ ownerId, to: jid, message }) })
      if (!res.ok) { const t = await res.text(); return { success: false, error: `Server error: ${res.status} ${t}`, viaExternalServer: true } }
      const data = (await res.json()) as WhatsAppSendResult
      return { ...data, viaExternalServer: true }
    } catch (err) { return { success: false, error: `Failed to reach server: ${err instanceof Error ? err.message : 'Unknown'}`, viaExternalServer: true } }
  }
  try {
    const session = await getInProcessSocket(ownerId)
    if (!session.ready) return { success: false, error: 'WhatsApp not connected. Scan QR first.', viaExternalServer: false }
    const result = await session.sock.sendMessage(jid, { text: message })
    return { success: true, messageId: result?.key?.id ?? undefined, viaExternalServer: false }
  } catch (err) { return { success: false, error: err instanceof Error ? err.message : 'Unknown', viaExternalServer: false } }
}

export async function getWhatsAppStatus(ownerId: string): Promise<WhatsAppStatusResult> {
  const serverUrl = getBaileysServerUrl()
  if (serverUrl) {
    try {
      const res = await fetch(`${serverUrl}/status?ownerId=${ownerId}`, { headers: { 'x-api-key': process.env.BAILEYS_API_KEY || '' } })
      if (!res.ok) return { connected: false, error: `Server error: ${res.status}`, viaExternalServer: true }
      return { ...(await res.json()) as WhatsAppStatusResult, viaExternalServer: true }
    } catch (err) { return { connected: false, error: `Failed to reach server: ${err instanceof Error ? err.message : 'Unknown'}`, viaExternalServer: true } }
  }
  try { const session = await getInProcessSocket(ownerId); return { connected: session.ready, qrCode: session.qrCode, viaExternalServer: false } }
  catch (err) { return { connected: false, error: err instanceof Error ? err.message : 'Unknown', viaExternalServer: false } }
}

export async function disconnectWhatsApp(ownerId: string): Promise<{ success: boolean }> {
  const serverUrl = getBaileysServerUrl()
  if (serverUrl) { try { await fetch(`${serverUrl}/logout?ownerId=${ownerId}`, { method: 'POST', headers: { 'x-api-key': process.env.BAILEYS_API_KEY || '' } }) } catch {} return { success: true } }
  const session = sessions.get(ownerId)
  if (session) { try { await session.sock.logout() } catch {} sessions.delete(ownerId) }
  return { success: true }
}

export function isWhatsAppConfigured(): boolean { return true }
export function isServerlessMode(): boolean { return isServerless() }
