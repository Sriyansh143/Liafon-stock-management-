import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, type SessionUser } from '@/lib/auth'
import { guardOwner, apiConflict, apiNotFound, logApiError } from '@/lib/api-utils'
import { validate, createUserSchema, updateUserSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'
import type { Prisma } from '@prisma/client'

const PUBLIC_USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
} as const

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardOwner(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })

    const users = await db.user.findMany({ where: { ownerId: user.ownerId },
      select: PUBLIC_USER_FIELDS,
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ success: true, users })
  } catch (error) {
    logApiError('users/GET', error)
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // ── Registration (Multi-tenant: multiple owners allowed) ──────────
    // Anyone can register as a new owner. The first user becomes owner
    // automatically. Subsequent users can be:
    //   - New owners (public registration — gets their own ownerId + license)
    //   - Sub-users (created by an existing owner — shares owner's license)
    //
    // No auth required for public registration. If the caller IS
    // authenticated as an owner, they can create sub-users under their account.
    const userCount = await db.user.count()
    const isFirstRun = userCount === 0

    let currentUser: SessionUser | null = null
    // Try to authenticate — but DON'T require it for public registration
    try {
      const [user, authErr] = await guardOwner(request)
      if (!authErr && user) currentUser = user
    } catch {
      // Not authenticated — that's fine for public registration
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(createUserSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    const { name, email, password, role } = result.data

    // Determine role:
    // - First run: force owner
    // - Authenticated owner creating a user: use the role they specified
    // - Public registration (no auth): default to owner (new tenant)
    let effectiveRole: string
    if (isFirstRun) {
      effectiveRole = 'owner'
    } else if (currentUser && currentUser.role === 'owner') {
      effectiveRole = role // Owner is creating a sub-user
    } else {
      // Public registration — new owner (multi-tenant)
      effectiveRole = 'owner'
    }

    // ── IP duplicate detection for new owner registrations ────────────
    if (effectiveRole === 'owner' && !isFirstRun) {
      const { checkIpDuplicate, getClientIP } = await import('@/lib/plan-limits')
      const ip = getClientIP(request)
      const ipCheck = await checkIpDuplicate(ip)
      if (!ipCheck.allowed) {
        return NextResponse.json(
          { error: ipCheck.message, code: 'IP_DUPLICATE_BLOCKED' },
          { status: 403 }
        )
      }
    }

    // ── Sub-user limit check ──────────────────────────────────────────
    if (currentUser && effectiveRole !== 'owner') {
      const { checkStorageLimit } = await import('@/lib/plan-limits')
      const userLimit = await checkStorageLimit(currentUser.ownerId, 'users')
      if (!userLimit.allowed) {
        return NextResponse.json(
          { error: userLimit.message, upgradeRequired: true, code: 'USER_LIMIT_EXCEEDED' },
          { status: 402 }
        )
      }
    }

    // Determine ownerId + IP hash
    const ownerId = currentUser?.ownerId || 'PENDING'
    const { getClientIP: getIP, hashIP } = await import('@/lib/plan-limits')
    const clientIP = getIP(request)
    const ipHash = effectiveRole === 'owner' ? hashIP(clientIP) : null

    const hashedPassword = await hashPassword(password)
    const user = await db.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: effectiveRole,
        ownerId: ownerId === 'PENDING' ? 'TEMP' : ownerId,
        ...(ipHash ? { ipHash } : {}),
      },
      select: PUBLIC_USER_FIELDS,
    })

    // If this is a new owner (first-run or public registration), set ownerId = user.id
    if (ownerId === 'PENDING') {
      await db.user.update({
        where: { id: user.id },
        data: { ownerId: user.id },
      })

      // Create a 7-day trial license for the new owner
      const trialExpiresAt = new Date()
      trialExpiresAt.setDate(trialExpiresAt.getDate() + 7)

      const licenseKey = `LIAFON-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

      await db.license.create({
        data: {
          ownerId: user.id,
          licenseKey,
          customerName: name,
          status: 'trial',
          activatedAt: new Date(),
          expiresAt: trialExpiresAt,
          paymentStatus: 'pending',
          amount: 4999,
          currency: 'INR',
        },
      })

      // If a license key was provided during registration, activate it
      if (body.licenseKey && typeof body.licenseKey === 'string') {
        await db.license.update({
          where: { ownerId: user.id },
          data: {
            licenseKey: body.licenseKey,
            status: 'active',
            paymentStatus: 'paid',
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 365 days
          },
        })
      }
    }

    // Update the user object with the correct ownerId
    const userWithOwner = await db.user.findUnique({
      where: { id: user.id },
      select: PUBLIC_USER_FIELDS,
    })

    // ── Auto-delete demo users when an owner is created ───────────────────
    // Whenever a new owner account is created (first-run OR via the Users
    // page), delete any demo users (owner@liafon.com, admin@liafon.com,
    // etc.) that may exist from a previous seed. This ensures the new
    // owner starts with a clean user list and the login page no longer
    // shows the "Quick Demo Login" buttons.
    if (effectiveRole === 'owner') {
      try {
        const demoEmails = [
          'owner@liafon.com',
          'admin@liafon.com',
          'manager@liafon.com',
          'user@liafon.com',
        ]
        // Don't delete the user we just created (in case they used one
        // of the demo emails as their own email)
        const toDelete = demoEmails.filter((e) => e !== user.email.toLowerCase())
        if (toDelete.length > 0) {
          const deleted = await db.user.deleteMany({
            where: { email: { in: toDelete } },
          })
          if (deleted.count > 0) {
          }
        }
      } catch {
        // Non-critical — don't fail the user creation
      }
    }

    // Log activity (first-run or normal creation)
    await logUserActivity(currentUser ?? null, {
      action: 'CREATE',
      entityType: 'user',
      entityId: userWithOwner?.id || user.id,
      summary: isFirstRun
        ? `First owner account created: ${userWithOwner?.name || user.name} (${userWithOwner?.email || user.email})`
        : `New user created: ${userWithOwner?.name || user.name} (${userWithOwner?.email || user.email}) — role: ${userWithOwner?.role || user.role}`,
      metadata: { firstRun: isFirstRun, email: userWithOwner?.email || user.email, role: userWithOwner?.role || user.role },
    })

    return NextResponse.json({ success: true, user: userWithOwner || user, firstRun: isFirstRun }, { status: 201 })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return apiConflict('A user with this email already exists')
    }
    logApiError('users/POST', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const [currentUser, authErr] = await guardOwner(request)
    if (authErr || !currentUser) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(updateUserSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    const { id, name, email, role, isActive, password } = result.data
    if (!id) return NextResponse.json({ error: 'User ID is required' }, { status: 400 })

    // Prevent self-deactivation
    if (currentUser.id === id && isActive === false) {
      return NextResponse.json(
        { error: 'Cannot deactivate your own account' },
        { status: 400 }
      )
    }

    // Prevent self-demotion
    if (currentUser.id === id && role && role !== 'owner') {
      return NextResponse.json(
        { error: 'Cannot demote your own owner account' },
        { status: 400 }
      )
    }

    // Prevent promoting someone to owner
    if (role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot assign owner role to another user' },
        { status: 400 }
      )
    }

    const updateData: Prisma.UserUpdateInput = {}
    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email.toLowerCase().trim()
    if (role !== undefined) updateData.role = role
    if (isActive !== undefined) updateData.isActive = isActive
    if (password) {
      // Admin reset of another user's password — bump
      // passwordChangedAt so that user's existing sessions are
      // invalidated and they must sign in with the new password.
      updateData.password = await hashPassword(password)
      updateData.passwordChangedAt = new Date()
    }

    // Verify the target exists (P2025 → 404 fallback in catch below)
    const target = await db.user.findUnique({ where: { id } })
    if (!target) return apiNotFound('User not found')

    const user = await db.user.update({
      where: { id },
      data: updateData,
      select: PUBLIC_USER_FIELDS,
    })

    await logUserActivity(currentUser, {
      action: 'UPDATE',
      entityType: 'user',
      entityId: id,
      summary: `User updated: ${user.name} (${user.email})`,
      metadata: { changedFields: Object.keys(updateData) },
    })

    return NextResponse.json({ success: true, user })
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return apiConflict('A user with this email already exists')
    }
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2025'
    ) {
      return apiNotFound('User not found')
    }
    logApiError('users/PUT', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const [currentUser, authErr] = await guardOwner(request)
    if (authErr || !currentUser) return authErr ?? NextResponse.json({ error: "Auth required" }, { status: 401 })
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('id')

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }
    if (currentUser.id === userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    // Soft delete via deactivation so historical references stay valid
    const target = await db.user.findUnique({ where: { id: userId } })
    if (!target) {
      return apiNotFound('User not found')
    }
    if (target.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot delete the owner account' },
        { status: 400 }
      )
    }

    await db.user.update({
      where: { id: userId },
      data: { isActive: false },
    })

    await logUserActivity(currentUser, {
      action: 'DELETE',
      entityType: 'user',
      entityId: userId,
      summary: `User deactivated: ${target.name} (${target.email})`,
      metadata: { email: target.email, role: target.role },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logApiError('users/DELETE', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
