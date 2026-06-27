const path = require('path')

const dir = path.join(__dirname)

process.env.NODE_ENV = 'production'
process.chdir(__dirname)

const currentPort = parseInt(process.env.PORT, 10) || 3000
const hostname = process.env.HOSTNAME || '0.0.0.0'

let keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10)

// Load the Next.js config that was compiled into the standalone output
// (`.next/required-server-files.json`), instead of duplicating the
// config as a hardcoded JSON literal here. Previously this file held a
// 2 KB JSON blob that had to be hand-synced with `next.config.ts` —
// already out of sync (it set `poweredByHeader: true`, advertising
// Next.js to attackers, while `next.config.ts` had it disabled).
let nextConfig = null
try {
  const fs = require('fs')
  const requiredServerFilesPath = path.join(
    __dirname,
    '.next',
    'required-server-files.json'
  )
  const raw = fs.readFileSync(requiredServerFilesPath, 'utf-8')
  const parsed = JSON.parse(raw)
  nextConfig = parsed.config || null
  // Always force-disable the X-Powered-By header regardless of what
  // the compiled config says — defense in depth.
  if (nextConfig) {
    nextConfig.poweredByHeader = false
  }
} catch (err) {
  console.error('[server.js] Could not load .next/required-server-files.json:', err.message)
  console.error('[server.js] Did you run `npm run build`? Falling back to minimal config.')
  // Minimal fallback so the server can still boot (e.g. during dev testing)
  nextConfig = {
    distDir: './.next',
    output: 'standalone',
    poweredByHeader: false,
  }
}

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig)

require('next')
const { startServer } = require('next/dist/server/lib/start-server')

if (
  Number.isNaN(keepAliveTimeout) ||
  !Number.isFinite(keepAliveTimeout) ||
  keepAliveTimeout < 0
) {
  keepAliveTimeout = undefined
}

startServer({
  dir,
  isDev: false,
  config: nextConfig,
  hostname,
  port: currentPort,
  allowRetry: false,
  keepAliveTimeout,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
