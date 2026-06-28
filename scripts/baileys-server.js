const http = require('http')
const crypto = require('crypto')

let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion
async function loadBaileys() {
  const baileys = await import('@whiskeysockets/baileys')
  makeWASocket = baileys.default
  useMultiFileAuthState = baileys.useMultiFileAuthState
  DisconnectReason = baileys.DisconnectReason
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion
}

const sessions = new Map()

async function getSocket(ownerId) {
  if (sessions.has(ownerId)) return sessions.get(ownerId)
  const { state, saveCreds } = await useMultiFileAuthState(`./auth-${ownerId}`)
  const { version } = await fetchLatestBaileysVersion()
  const session = { sock: null, qrCode: null, ready: false, phoneNumber: null }
  const sock = makeWASocket({ version, auth: state, printQRInTerminal: false })
  session.sock = sock
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) session.qrCode = qr
    if (connection === 'open') { session.ready = true; session.qrCode = null; session.phoneNumber = sock.user?.id?.split(':')[0] || null }
    else if (connection === 'close') { session.ready = false; const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut); if (shouldReconnect) { setTimeout(() => { sessions.delete(ownerId); getSocket(ownerId) }, 1000) } else { sessions.delete(ownerId); require('fs').rmSync(`./auth-${ownerId}`, { recursive: true, force: true }) } }
  })
  sessions.set(ownerId, session)
  return session
}

const API_KEY = process.env.BAILEYS_API_KEY || crypto.randomBytes(16).toString('hex')
const PORT = parseInt(process.env.PORT || '3000', 10)

function sendJson(res, statusCode, data) { res.writeHead(statusCode, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
function readBody(req) { return new Promise((resolve) => { let body = ''; req.on('data', (chunk) => body += chunk); req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}) } catch { resolve({}) } }) }) }

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const apiKey = req.headers['x-api-key']
  if (apiKey !== API_KEY) return sendJson(res, 401, { error: 'Unauthorized' })
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'GET' && url.pathname === '/status') { const ownerId = url.searchParams.get('ownerId'); if (!ownerId) return sendJson(res, 400, { error: 'ownerId required' }); try { const session = await getSocket(ownerId); return sendJson(res, 200, { connected: session.ready, qrCode: session.qrCode, phoneNumber: session.phoneNumber, viaExternalServer: true }) } catch (err) { return sendJson(res, 500, { error: err.message }) } }
  if (req.method === 'POST' && url.pathname === '/send') { const body = await readBody(req); const { ownerId, to, message } = body; if (!ownerId || !to || !message) return sendJson(res, 400, { error: 'ownerId, to, message required' }); try { const session = await getSocket(ownerId); if (!session.ready) return sendJson(res, 400, { error: 'Not connected' }); const result = await session.sock.sendMessage(to, { text: message }); return sendJson(res, 200, { success: true, messageId: result?.key?.id }) } catch (err) { return sendJson(res, 500, { error: err.message }) } }
  if (req.method === 'POST' && url.pathname === '/logout') { const ownerId = url.searchParams.get('ownerId'); if (!ownerId) return sendJson(res, 400, { error: 'ownerId required' }); const session = sessions.get(ownerId); if (session) { try { await session.sock.logout() } catch {} sessions.delete(ownerId); require('fs').rmSync(`./auth-${ownerId}`, { recursive: true, force: true }) } return sendJson(res, 200, { success: true }) }
  if (req.method === 'GET' && url.pathname === '/') return sendJson(res, 200, { service: 'baileys-server', sessions: sessions.size, uptime: process.uptime() })
  sendJson(res, 404, { error: 'Not found' })
})

async function main() { await loadBaileys(); server.listen(PORT, () => console.log(`[baileys-server] Port ${PORT}, API key: ${API_KEY.slice(0, 8)}...`)) }
main().catch((err) => { console.error('[baileys-server] Failed:', err); process.exit(1) })
