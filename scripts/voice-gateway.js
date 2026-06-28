const http = require('http')
const crypto = require('crypto')
const API_KEY = process.env.VOICE_GATEWAY_API_KEY || crypto.randomBytes(16).toString('hex')
const PORT = parseInt(process.env.PORT || '3001', 10)
const calls = new Map()

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
  if (req.method === 'POST' && url.pathname === '/call') { const body = await readBody(req); const callId = 'call_' + crypto.randomBytes(8).toString('hex'); calls.set(callId, { status: 'ringing', startedAt: Date.now() }); return sendJson(res, 200, { call_id: callId, status: 'ringing' }) }
  if (req.method === 'GET' && url.pathname.startsWith('/status/')) { const callId = url.pathname.slice(8); const call = calls.get(callId); if (!call) return sendJson(res, 404, { error: 'Not found' }); return sendJson(res, 200, { status: call.status, duration_sec: Math.floor((Date.now() - call.startedAt) / 1000) }) }
  if (req.method === 'GET' && url.pathname === '/') return sendJson(res, 200, { service: 'voice-gateway', active_calls: calls.size })
  sendJson(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => console.log(`[voice-gateway] Port ${PORT}, API key: ${API_KEY.slice(0, 8)}...`))
