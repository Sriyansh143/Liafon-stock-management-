import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { logApiError } from '@/lib/api-utils'
import crypto from 'crypto'

/**
 * GET /api/license
 * Returns the license status for the CURRENTLY LOGGED-IN USER's owner.
 *
 * Multi-tenant: each owner has their own license in the License table.
 * Sub-users inherit their owner's license status.
 */

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8')
  const bBuf = Buffer.from(b, 'utf-8')
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

const MAX_LICENSE_DAYS = 3650

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser) {
      return NextResponse.json({ active: true, message: 'Not authenticated — access granted' })
    }

    // Fetch the owner's license from the License table
    const license = await db.license.findUnique({
      where: { ownerId: sessionUser.ownerId },
    })

    if (!license) {
      // No license record — create a 7-day trial
      const trialExpiresAt = new Date()
      trialExpiresAt.setDate(trialExpiresAt.getDate() + 7)

      const newLicense = await db.license.create({
        data: {
          ownerId: sessionUser.ownerId,
          licenseKey: `LIAFON-TRIAL-${Date.now().toString(36).toUpperCase()}`,
          customerName: sessionUser.name,
          status: 'trial',
          activatedAt: new Date(),
          expiresAt: trialExpiresAt,
          paymentStatus: 'pending',
          amount: 4999,
          currency: 'INR',
        },
      })

      const daysRemaining: number = 7
      return NextResponse.json({
        active: true,
        message: `Trial mode — ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`,
        trial: true,
        expired: false,
        daysRemaining,
        expiresAt: newLicense.expiresAt.toISOString(),
        licensed: false,
      })
    }

    // Check if license is expired
    const now = new Date()
    const isExpired = now > license.expiresAt
    const daysRemaining = Math.ceil(
      (license.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (isExpired) {
      // Auto-update status to expired
      if (license.status !== 'expired') {
        await db.license.update({
          where: { id: license.id },
          data: { status: 'expired' },
        })
      }

      return NextResponse.json({
        active: false,
        message: 'License expired. Please enter your license key to restore access.',
        trial: license.status === 'trial',
        expired: true,
        daysRemaining: 0,
        expiresAt: license.expiresAt.toISOString(),
        licensed: license.status === 'active',
      })
    }

    return NextResponse.json({
      active: true,
      message: license.status === 'trial'
        ? `Trial mode — ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`
        : 'License active',
      trial: license.status === 'trial',
      expired: false,
      daysRemaining,
      expiresAt: license.expiresAt.toISOString(),
      licensed: license.status === 'active',
      customer: license.customerName,
    })
  } catch (error) {
    logApiError('license/GET', error)
    return NextResponse.json({ active: true, message: 'License check failed — access granted' })
  }
}

/**
 * POST /api/license
 * Allows a user to activate/extend their OWN license by entering a license key.
 * No devKey required — the license key itself is the credential.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser(request)
    if (!sessionUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    // ── Activate license with a key (no devKey required) ──────────────
    // The user enters their license key. We validate it and extend the
    // expiry. The license key IS the credential — no separate devKey needed.
    if (body.action === 'activate' && body.licenseKey) {
      const licenseKey = String(body.licenseKey).trim().toUpperCase()
      if (licenseKey.length < 10) {
        return NextResponse.json({ error: 'Invalid license key format' }, { status: 400 })
      }

      // Get the owner's current license
      const license = await db.license.findUnique({
        where: { ownerId: sessionUser.ownerId },
      })

      if (!license) {
        return NextResponse.json({ error: 'No license record found' }, { status: 404 })
      }

      // Validate the license key
      // For now, accept any key that starts with "LIAFON-" and is 20+ chars
      // In production, you'd validate against a cloud license server
      if (!licenseKey.startsWith('LIAFON-') || licenseKey.length < 20) {
        return NextResponse.json({ error: 'Invalid license key format' }, { status: 400 })
      }

      // Activate the license
      const expiresInDays = typeof body.expiresInDays === 'number'
        ? Math.min(Math.max(1, Math.floor(body.expiresInDays)), MAX_LICENSE_DAYS)
        : 365

      const newExpiry = new Date()
      newExpiry.setDate(newExpiry.getDate() + expiresInDays)

      await db.license.update({
        where: { id: license.id },
        data: {
          licenseKey,
          status: 'active',
          paymentStatus: 'paid',
          expiresAt: newExpiry,
          ...(body.customer ? { customerName: String(body.customer).slice(0, 120) } : {}),
        },
      })

      return NextResponse.json({
        success: true,
        message: 'License activated successfully',
        expiresAt: newExpiry.toISOString(),
        daysRemaining: expiresInDays,
      })
    }

    // ── Developer-only actions (still require devKey) ─────────────────
    const { devKey, action } = body as { devKey?: string; action?: string }
    const expectedKey = process.env.LIAFON_DEV_KEY
    if (!expectedKey || expectedKey.length < 16) {
      return NextResponse.json(
        { error: 'License management is not configured on this server.' },
        { status: 503 }
      )
    }
    if (typeof devKey !== 'string' || !safeEqual(devKey, expectedKey)) {
      return NextResponse.json({ error: 'Invalid developer key' }, { status: 403 })
    }

    if (action === 'deactivate') {
      const targetOwnerId = body.ownerId || sessionUser.ownerId
      await db.license.updateMany({
        where: { ownerId: targetOwnerId },
        data: { status: 'suspended' },
      })
      return NextResponse.json({ success: true, message: 'License deactivated' })
    }

    if (action === 'set_expiry') {
      const { expiresInDays } = body as { expiresInDays?: number }
      if (typeof expiresInDays !== 'number' || !Number.isFinite(expiresInDays) || expiresInDays <= 0) {
        return NextResponse.json({ error: 'expiresInDays must be a positive number' }, { status: 400 })
      }
      if (expiresInDays > MAX_LICENSE_DAYS) {
        return NextResponse.json({ error: `expiresInDays exceeds maximum (${MAX_LICENSE_DAYS})` }, { status: 400 })
      }
      const targetOwnerId = body.ownerId || sessionUser.ownerId
      const expiry = new Date()
      expiry.setDate(expiry.getDate() + Math.floor(expiresInDays))
      await db.license.updateMany({
        where: { ownerId: targetOwnerId },
        data: { expiresAt: expiry, status: 'active' },
      })
      return NextResponse.json({ success: true, message: `Expiry set to ${expiry.toISOString()}` })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    logApiError('license/POST', error)
    return NextResponse.json({ error: 'License operation failed' }, { status: 500 })
  }
}
