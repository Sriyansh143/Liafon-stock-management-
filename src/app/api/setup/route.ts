import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardOwner, logApiError } from '@/lib/api-utils'
import { seedDatabase } from '@/lib/seed'
import { logUserActivity } from '@/lib/activity'
import type { SessionUser } from '@/lib/auth'

/**
 * GET /api/setup
 * Returns whether the app is in first-run state (no users yet).
 * The login page uses this to decide whether to show the
 * "Create Owner Account" setup form.
 */
export async function GET() {
  try {
    const [userCount, partCount, demoUserCount] = await Promise.all([
      db.user.count(),
      db.sparePart.count(),
      // Check if any of the 4 well-known demo emails exist
      db.user.count({
        where: {
          email: {
            in: [
              'owner@liafon.com',
              'admin@liafon.com',
              'manager@liafon.com',
              'user@liafon.com',
            ],
          },
        },
      }),
    ])
    return NextResponse.json({
      firstRun: userCount === 0,
      userCount,
      partCount,
      needsSeed: userCount > 0 && partCount === 0,
      // True only when demo users exist (so the login page can show
      // the "Quick Demo Login" buttons with the right passwords)
      hasDemoUsers: demoUserCount > 0,
    })
  } catch (error) {
    logApiError('setup/GET', error)
    return NextResponse.json(
      { error: 'Failed to check setup status', firstRun: false },
      { status: 500 }
    )
  }
}

/**
 * POST /api/setup
 * Body: { action: 'seed' } — seeds demo data.
 *
 * Auth rules (previously only `partCount === 0` was checked, which let
 * any unauthenticated caller re-trigger a seed after a factory reset):
 *   - If we're in true first-run state (no users), allow unauthenticated.
 *   - Otherwise, require owner auth.
 *   - In both cases, refuse if parts already exist (idempotent guard).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (body.action !== 'seed') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const [userCount, partCount] = await Promise.all([
      db.user.count(),
      db.sparePart.count(),
    ])
    const isFirstRun = userCount === 0

    // If parts already exist, refuse — both first-run and owner-initiated
    // seeds are for empty part tables only.
    if (partCount > 0) {
      return NextResponse.json(
        { error: 'Database already has parts. Use Settings → Backup to manage data.' },
        { status: 400 }
      )
    }

    // If we're NOT in first-run, require owner auth. This prevents an
    // unauthenticated attacker from re-seeding demo data after a
    // factory reset (which leaves users intact but wipes parts).
    let sessionUser: SessionUser | null = null
    if (!isFirstRun) {
      const [user, authErr] = await guardOwner(request)
      if (authErr) return authErr
      sessionUser = user
    }

    // Delegate to the shared seeder (no mock users — that's /api/seed's job).
    const counts = await seedDatabase(false)

    await logUserActivity(sessionUser, {
      action: 'SEED',
      entityType: 'system',
      summary: isFirstRun
        ? 'Demo data seeded via first-run setup'
        : 'Demo data seeded by owner via /api/setup',
      metadata: { counts, firstRun: isFirstRun },
    })

    return NextResponse.json({
      success: true,
      message: 'Demo data seeded successfully',
      counts,
    })
  } catch (error) {
    logApiError('setup/POST', error)
    return NextResponse.json(
      {
        error: 'Failed to seed demo data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
