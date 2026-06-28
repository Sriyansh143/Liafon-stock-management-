import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const isDev = process.env.NODE_ENV !== 'production'

// ─── Vercel Serverless Optimization ──────────────────────────────────────
// Vercel spins up a new serverless function for every request. If 100 users
// hit the app, this could open 100 database connections, crashing Supabase.
//
// Solution:
// 1. Use the Prisma singleton pattern (cache client on globalThis)
// 2. Configure the connection URL to use Supabase's Connection Pooler
//    (PgBouncer). The pooler URL uses port 6543 instead of 5432.
//    Format: postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:6543/postgres?pgbouncer=true
// 3. Set `connection_limit=1` to prevent connection exhaustion.
//
// In your .env / Vercel env vars, set:
//   DIRECT_URL=postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:5432/postgres
//   DATABASE_URL=postgresql://postgres:PASSWORD@db.xxxxxx.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1

/**
 * Normalize the DATABASE_URL for Vercel + Supabase:
 *
 * 1. If the URL points at a Supabase pooler (port 6543) but is missing
 *    `?pgbouncer=true`, append it. PgBouncer requires this flag for
 *    Prisma to work — without it, prepared statements leak across
 *    transactions and Prisma throws "prepared statement ... does not exist".
 *
 * 2. If `connection_limit` is missing, default it to 1. Each serverless
 *    function instance should hold at most one DB connection.
 *
 * For non-Supabase / non-pooler URLs, this is a no-op.
 */
function normalizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url
  // Only auto-patch Supabase pooler URLs (port 6543) — leave everything else alone.
  if (!url.includes(':6543')) return url

  const [base, query = ''] = url.split('?')
  const params = new URLSearchParams(query)

  if (!params.has('pgbouncer')) params.set('pgbouncer', 'true')
  if (!params.has('connection_limit')) params.set('connection_limit', '1')

  // `pgbouncer=true` is incompatible with Prisma's default prepared-statement
  // cache. Prisma 5+ does this automatically when it sees pgbouncer=true,
  // but adding the explicit param doesn't hurt and makes the intent visible.
  if (!params.has('prepare')) params.set('prepare', 'false')

  return `${base}?${params.toString()}`
}

const resolvedDatabaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL)

if (process.env.DATABASE_URL && resolvedDatabaseUrl !== process.env.DATABASE_URL) {
  if (process.env.NODE_ENV !== 'production') console.log(
    '[db] Auto-patched DATABASE_URL: appended pgbouncer=true / connection_limit=1 / prepare=false. ' +
      'Set these explicitly in your Vercel env vars to silence this.'
  )
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev ? ['warn', 'error'] : ['error'],
    datasources: {
      db: {
        url: resolvedDatabaseUrl,
      },
    },
  })

if (isDev) globalForPrisma.prisma = db

// Gracefully disconnect on process exit so dev servers and tests
// don't leave dangling DB connections.
//
// NOTE: On Vercel serverless, this only fires on a "warm" invocation
// that ends with beforeExit — most invocations are frozen mid-flight.
// The Prisma singleton pattern above is what actually keeps
// connection counts manageable; this SIGINT/SIGTERM handler is
// primarily for `next dev` and self-hosted `node server.js`.
if (typeof process !== 'undefined') {
  const cleanup = async () => {
    try {
      await db.$disconnect()
    } catch {
      // ignore
    }
  }
  process.once('beforeExit', cleanup)
  process.once('SIGINT', () => {
    void cleanup().finally(() => process.exit(0))
  })
  process.once('SIGTERM', () => {
    void cleanup().finally(() => process.exit(0))
  })
}
