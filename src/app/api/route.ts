import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Read version from package.json at build time. Next.js inlines this
// import at build, so the version stays in sync with package.json
// automatically. Previously this was hardcoded to '3.18.0' — would
// drift every time package.json was bumped.
// The path alias `@/` is configured to `./src/`, so `@/../package.json`
// resolves to `<projectRoot>/package.json`.
import packageJson from '@/../package.json'

const APP_VERSION: string = (packageJson as { version: string }).version

/**
 * GET /api
 * Health check endpoint. Returns server status + DB connectivity +
 * basic stats (no auth required — used by uptime monitors).
 */
export async function GET() {
  const start = Date.now()
  let dbOk = false
  let dbError: string | undefined
  let stats: { users: number; parts: number; sales: number } | undefined

  try {
    const [users, parts, sales] = await Promise.all([
      db.user.count(),
      db.sparePart.count(),
      db.sale.count(),
    ])
    dbOk = true
    stats = { users, parts, sales }
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'Liafon Stock Management',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    uptime_ms: Date.now() - start,
    database: {
      connected: dbOk,
      ...(dbError ? { error: dbError } : {}),
    },
    ...(stats ? { stats } : {}),
  })
}
