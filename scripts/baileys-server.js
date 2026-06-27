/**
 * Baileys external server — for Vercel deployments.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 * Vercel serverless functions can't hold a long-lived WebSocket connection
 * to WhatsApp's servers. So on Vercel, we need a separate Node.js process
 * running somewhere that:
 *   1. Holds the WhatsApp Web WebSocket connection
 *   2. Persists the auth state (so we don't re-pair on restart)
 *   3. Exposes a small HTTP API for the Vercel app to call
 *
 * This is that server. Deploy it for free on:
 *   - Railway.app (free tier: 500 hours/month)
 *   - Render.com (free tier: 750 hours/month, sleeps after 15 min idle)
 *   - Fly.io (free tier: 3 shared-cpu VMs)
 *   - Your own VPS (DigitalOcean droplet, Hetzner, etc.)
 *
 * ─── Setup ─────────────────────────────────────────────────────────────────
 * 1. Deploy this file as a Node.js service. Set env vars:
 *      PORT=3000
 *      BAILEYS_API_KEY=<generate-with-openssl-rand-hex-32>
 *    (use the SAME BAILEYS_API_KEY in Vercel env vars)
 *
 * 2. In Vercel env vars, set:
 *      BAILEYS_SERVER_URL=https://your-baileys-server.up.railway.app
 *      BAILEYS_API_KEY=<same-key>
 *
 * 3. Pair your WhatsApp account:
 *    - From your Vercel app, call GET /api/whatsapp/baileys/status
 *    - The app will proxy to this server's /status endpoint
 *    - Scan the returned QR code with your WhatsApp app
 *      (Settings → Linked Devices → Link a Device)
 *    - Status will change to "connected" within ~5 seconds
 *
 * ─── API ───────────────────────────────────────────────────────────────────
 * All endpoints require `x-api-key` header matching BAILEYS_API_KEY.
 *
 * GET  /status?ownerId=<id>
 *   Returns: { connected, qrCode, phoneNumber, viaExternalServer: true }
 *   If not connected, qrCode is a Base64 PNG to render in an <img>.
 *
 * POST /send  body: { ownerId, to, message }
 *   Returns: { success, messageId, error? }
 *
 * POST /logout?ownerId=<id>
 *   Logs out + clears the auth state for that owner.
 */

const http = require('http')
const crypto = require('crypto')

// ─── Lazy-load Baileys (so the server can boot even if Baileys isn't installed yet) ──
let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion
async function loadBaileys() {
  const baileys = await import('@whiskeysockets/baileys')
  makeWASocket = baileys.default
  useMultiFileAuthState = baileys.useMultiFileAuthState
  DisconnectReason = baileys.DisconnectReason
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion
}

// ─── Session store (in-memory + persisted to disk) ─────────────────────────
const sessions = new Map()  // ownerId → { sock, qrCode, ready, phoneNumber }

async function getSocket(ownerId) {
  if (sessions.has(ownerId)) return sessions.get(ownerId)

  const { state, saveCreds } = await useMultiFileAuthState(`./auth-${ownerId}`)
  const { version } = await fetchLatestBaileysVersion()

  const session = { sock: null, qrCode: null, ready: false, phoneNumber: null }
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
  })
  session.sock = sock

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) session.qrCode = qr
    if (connection === 'open') {
      session.ready = true
      session.qrCode = null
      session.phoneNumber = sock.user?.id?.split(':')[0] || null
    } else if (connection === 'close') {
      session.ready = false
      const shouldReconnect =
        (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut)
      if (shouldReconnect) {
        setTimeout(() => {
          sessions.delete(ownerId)
          getSocket(ownerId)
        }, 1000)
      } else {
        sessions.delete(ownerId)
        require('fs').rmSync(`./auth-${ownerId}`, { recursive: true, force: true })
      }
    }
  })

  sessions.set(ownerId, session)
  return session
}

// ─── HTTP server ───────────────────────────────────────────────────────────

const API_KEY = process.env.BAILEYS_API_KEY || crypto.randomBytes(16).toString('hex')
const PORT = parseInt(process.env.PORT || '3000', 10)

if (!process.env.BAILEYS_API_KEY) {
  console.warn(`[baileys-server] WARNING: BAILEYS_API_KEY not set. Generated one: ${API_KEY}`)
  console.warn('[baileys-server] Set this as BAILEYS_API_KEY in Vercel env vars.')
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        resolve({})
      }
    })
  })
}

const server = http.createServer(async (req, res) => {
  // CORS (allow Vercel app to call)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  // Auth check
  const apiKey = req.headers['x-api-key']
  if (apiKey !== API_KEY) {
    return sendJson(res, 401, { error: 'Unauthorized: invalid x-api-key' })
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  // GET /status?ownerId=<id>
  if (req.method === 'GET' && url.pathname === '/status') {
    const ownerId = url.searchParams.get('ownerId')
    if (!ownerId) return sendJson(res, 400, { error: 'ownerId is required' })
    try {
      const session = await getSocket(ownerId)
      return sendJson(res, 200, {
        connected: session.ready,
        qrCode: session.qrCode,
        phoneNumber: session.phoneNumber,
        viaExternalServer: true,
      })
    } catch (err) {
      return sendJson(res, 500, { error: err.message })
    }
  }

  // POST /send
  if (req.method === 'POST' && url.pathname === '/send') {
    const body = await readBody(req)
    const { ownerId, to, message } = body
    if (!ownerId || !to || !message) {
      return sendJson(res, 400, { error: 'ownerId, to, and message are required' })
    }
    try {
      const session = await getSocket(ownerId)
      if (!session.ready) {
        return sendJson(res, 400, { error: 'WhatsApp not connected. Scan QR first.' })
      }
      const result = await session.sock.sendMessage(to, { text: message })
      return sendJson(res, 200, { success: true, messageId: result?.key?.id })
    } catch (err) {
      return sendJson(res, 500, { error: err.message })
    }
  }

  // POST /logout?ownerId=<id>
  if (req.method === 'POST' && url.pathname === '/logout') {
    const ownerId = url.searchParams.get('ownerId')
    if (!ownerId) return sendJson(res, 400, { error: 'ownerId is required' })
    const session = sessions.get(ownerId)
    if (session) {
      try { await session.sock.logout() } catch {}
      sessions.delete(ownerId)
      require('fs').rmSync(`./auth-${ownerId}`, { recursive: true, force: true })
    }
    return sendJson(res, 200, { success: true })
  }

  // Health check
  if (req.method === 'GET' && url.pathname === '/') {
    return sendJson(res, 200, {
      service: 'baileys-server',
      version: '1.0.0',
      sessions: sessions.size,
      uptime: process.uptime(),
    })
  }

  sendJson(res, 404, { error: 'Not found' })
})

async function main() {
  await loadBaileys()
  server.listen(PORT, () => {
    console.log(`[baileys-server] Listening on port ${PORT}`)
    console.log(`[baileys-server] API key: ${API_KEY.slice(0, 8)}...`)
  })
}

main().catch((err) => {
  console.error('[baileys-server] Failed to start:', err)
  process.exit(1)
})
