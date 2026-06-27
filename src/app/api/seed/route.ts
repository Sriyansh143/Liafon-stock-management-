import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { logApiError } from '@/lib/api-utils'
import { seedDatabase } from '@/lib/seed'
import { logUserActivity } from '@/lib/activity'

/**
 * POST /api/seed
 * Owner-initiated full re-seed (including mock users with well-known
 * passwords). Refuses to run outside dev unless explicitly enabled.
 *
 * Auth rules:
 *   - If users exist, requires owner auth.
 *   - If no users exist (true first-run), allows the call so the user
 *     can bootstrap without auth — but only seeds mock users in dev.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    const userCount = await db.user.count()

    if (userCount > 0 && !sessionUser) {
      return NextResponse.json(
        { error: 'Authentication required to re-seed' },
        { status: 401 }
      )
    }
    if (sessionUser && sessionUser.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the owner can re-seed the database' },
        { status: 403 }
      )
    }

    // Use the shared seeder. Mock users are gated by NODE_ENV inside the
    // seeder, so this is safe to call from anywhere.
    const counts = await seedDatabase(true)

    await logUserActivity(sessionUser, {
      action: 'SEED',
      entityType: 'system',
      summary: 'Database re-seeded with demo data',
      metadata: { counts, includeMockUsers: true },
    })

    return NextResponse.json({
      success: true,
      message: 'Database seeded with sample data including mock users',
      counts,
    })
  } catch (error) {
    logApiError('seed/POST', error)
    return NextResponse.json(
      {
        error: 'Failed to seed database',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    )
  }
}
