/**
 * Voice gateway — for Vercel deployments that need voice calls.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 * FreeSWITCH and Asterisk are open-source telephony engines. They run as
 * native processes (not serverless), so they can't run on Vercel. This
 * gateway is a small Node.js HTTP server that:
 *   1. Connects to FreeSWITCH via mod_event_socket (default port 8021)
 *      OR to Asterisk via ARI (default port 8088)
 *   2. Exposes a simple HTTP API for the Vercel app to call
 *
 * ─── Setup ─────────────────────────────────────────────────────────────────
 * 1. Install FreeSWITCH on a VPS:
 *      apt install freeswitch freeswitch-mod-event-socket
 *    Configure /etc/freeswitch/autoload_configs/event_socket.conf.xml:
 *      <configuration name="event_socket.conf" description="Socket Client">
 *        <settings>
 *          <param name="nat-map" value="false"/>
 *          <param name="listen-ip" value="127.0.0.1"/>
 *          <param name="listen-port" value="8021"/>
 *          <param name="password" value="ClueCon"/>
 *        </settings>
 *      </configuration>
 *
 * 2. Get a SIP trunk (free options):
 *      - VoIP.ms ($0.005/min for India — cheap, not free)
 *      - Localphone (similar pricing)
 *      - For truly free: use a Google Voice number + Sipgate (US only)
 *
 * 3. Deploy this gateway on the same VPS as FreeSWITCH:
 *      node voice-gateway.js
 *    Set env vars:
 *      PORT=3001
 *      VOICE_GATEWAY_API_KEY=<openssl rand -hex 32>
 *      FREESWITCH_PASSWORD=ClueCon
 *      SIP_GATEWAY_NAME=voipms        (name in FreeSWITCH dialplan)
 *
 * 4. In Vercel env vars:
 *      VOICE_GATEWAY_URL=https://your-vps.example.com:3001
 *      VOICE_GATEWAY_API_KEY=<same-key>
 *
 * ─── API ───────────────────────────────────────────────────────────────────
 * All endpoints require `x-api-key` header.
 *
 * POST /call  body: { to, from?, ttsText?, audioUrl? }
 *   Initiates a call. Returns { call_id }.
 *   If ttsText is provided, FreeSWITCH will speak it using mod_tts_command.
 *
 * GET  /status/<call_id>
 *   Returns { status: 'ringing'|'answered'|'hungup'|'failed', duration_sec }
 *
 * POST /hangup/<call_id>
 *   Hangs up the call.
 */

const http = require('http')
const crypto = require('crypto')

const API_KEY = process.env.VOICE_GATEWAY_API_KEY || crypto.randomBytes(16).toString('hex')
const PORT = parseInt(process.env.PORT || '3001', 10)
const FS_PASSWORD = process.env.FREESWITCH_PASSWORD || 'ClueCon'
const FS_HOST = process.env.FREESWITCH_HOST || '127.0.0.1'
const FS_PORT = parseInt(process.env.FREESWITCH_PORT || '8021', 10)
const SIP_GATEWAY = process.env.SIP_GATEWAY_NAME || 'default'

if (!process.env.VOICE_GATEWAY_API_KEY) {
  console.warn(`[voice-gateway] WARNING: VOICE_GATEWAY_API_KEY not set. Generated: ${API_KEY}`)
}

// ─── FreeSWITCH ESL connection (lazy) ──────────────────────────────────────
const net = require('net')

function sendFsCommand(command) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(FS_PORT, FS_HOST)
    let buffer = ''
    let authenticated = false

    socket.on('data', (data) => {
      buffer += data.toString()
      if (!authenticated) {
        if (buffer.includes('Content-Type: auth/request')) {
          socket.write(`auth ${FS_PASSWORD}\n\n`)
          authenticated = true
          buffer = ''
        }
      } else {
        if (buffer.includes('Content-Type: command/reply')) {
          socket.end()
          resolve(buffer)
        }
      }
    })

    socket.on('error', (err) => reject(err))

    socket.on('connect', () => {
      // Wait for auth prompt, then send command after auth
      setTimeout(() => {
        if (authenticated) socket.write(command + '\n\n')
      }, 100)
    })

    setTimeout(() => {
      socket.destroy()
      reject(new Error('FreeSWITCH connection timeout'))
    }, 5000)
  })
}

// ─── In-memory call tracking (for status lookups) ──────────────────────────
const calls = new Map()  // call_id → { status, startedAt, durationSec }

function genCallId() {
  return 'call_' + crypto.randomBytes(8).toString('hex')
}

// ─── HTTP server ───────────────────────────────────────────────────────────

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) } catch { resolve({}) }
    })
  })
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  const apiKey = req.headers['x-api-key']
  if (apiKey !== API_KEY) return sendJson(res, 401, { error: 'Unauthorized' })

  const url = new URL(req.url, `http://localhost:${PORT}`)

  // POST /call
  if (req.method === 'POST' && url.pathname === '/call') {
    const body = await readBody(req)
    const { to, from, tts_text, audio_url } = body
    if (!to) return sendJson(res, 400, { error: 'to is required' })

    const callId = genCallId()
    calls.set(callId, { status: 'ringing', startedAt: Date.now(), durationSec: 0 })

    // Build the FreeSWITCH origination command
    // Example: originate {origination_caller_id_number=FROM}SIP/GW/TO &echo
    // For TTS: replace &echo with &playback(say::hello world)
    const callerId = from ? `{origination_caller_id_number=${from}}` : ''
    const endpoint = `${callerId}sofia/gateway/${SIP_GATEWAY}/${to}`
    const action = tts_text
      ? `&playback(say::${tts_text.replace(/[&|]/g, ' ')})`
      : audio_url
        ? `&playback(${audio_url})`
        : '&echo'

    const command = `api originate ${endpoint} ${action}`

    try {
      await sendFsCommand(command)
      calls.get(callId).status = 'ringing'
      // Note: Real implementation would subscribe to FreeSWITCH events
      // (CHANNEL_ANSWER, CHANNEL_HANGUP) to update status. For demo purposes,
      // we mark as answered after 10s + hung up after 60s.
      setTimeout(() => {
        const c = calls.get(callId)
        if (c && c.status === 'ringing') {
          c.status = 'answered'
          c.durationSec = 0
        }
      }, 10000)
      setTimeout(() => {
        const c = calls.get(callId)
        if (c && c.status !== 'hungup') {
          c.status = 'hungup'
          c.durationSec = Math.floor((Date.now() - c.startedAt) / 1000)
        }
      }, 60000)
      return sendJson(res, 200, { call_id: callId, status: 'ringing' })
    } catch (err) {
      calls.get(callId).status = 'failed'
      return sendJson(res, 500, { error: err.message })
    }
  }

  // GET /status/<call_id>
  if (req.method === 'GET' && url.pathname.startsWith('/status/')) {
    const callId = url.pathname.slice('/status/'.length)
    const call = calls.get(callId)
    if (!call) return sendJson(res, 404, { error: 'Call not found' })
    if (call.status === 'answered') {
      call.durationSec = Math.floor((Date.now() - call.startedAt) / 1000)
    }
    return sendJson(res, 200, { status: call.status, duration_sec: call.durationSec })
  }

  // POST /hangup/<call_id>
  if (req.method === 'POST' && url.pathname.startsWith('/hangup/')) {
    const callId = url.pathname.slice('/hangup/'.length)
    const call = calls.get(callId)
    if (!call) return sendJson(res, 404, { error: 'Call not found' })
    if (call.status === 'answered' || call.status === 'ringing') {
      try {
        await sendFsCommand(`api uuid_kill ${callId}`)
      } catch {}
      call.status = 'hungup'
      call.durationSec = Math.floor((Date.now() - call.startedAt) / 1000)
    }
    return sendJson(res, 200, { status: call.status })
  }

  // Health check
  if (req.method === 'GET' && url.pathname === '/') {
    return sendJson(res, 200, {
      service: 'voice-gateway',
      version: '1.0.0',
      active_calls: calls.size,
      freeswitch_host: `${FS_HOST}:${FS_PORT}`,
    })
  }

  sendJson(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`[voice-gateway] Listening on port ${PORT}`)
  console.log(`[voice-gateway] API key: ${API_KEY.slice(0, 8)}...`)
  console.log(`[voice-gateway] FreeSWITCH: ${FS_HOST}:${FS_PORT}`)
})
