/**
 * IP-based duplicate account detection + storage limit enforcement.
 *
 * ─── IP Detection ──────────────────────────────────────────────────────
 * When a user registers, their IP is hashed (SHA-256 + pepper) and stored.
 * If the same IP already has an active owner account, registration is
 * blocked with "Multiple accounts from the same location are not allowed."
 *
 * ─── Storage Limits ────────────────────────────────────────────────────
 * Based on the owner's plan:
 *   free:      50 parts, 100 sales, 50 customers, 20 suppliers
 *   pro:       unlimited
 *   business:  unlimited + 10 users
 *   lifetime:  unlimited
 *
 * ─── Usage ─────────────────────────────────────────────────────────────
 *
 *   import { checkIpDuplicate, checkStorageLimit, getPlanLimits } from '@/lib/plan-limits'
 *
 *   // On registration:
 *   const ipCheck = await checkIpDuplicate(ip)
 *   if (!ipCheck.allowed) return 403
 *
 *   // Before creating a part:
 *   const limitCheck = await checkStorageLimit(ownerId, 'parts')
 *   if (!limitCheck.allowed) return 402 Payment Required
 */

import { db } from '@/lib/db'
import crypto from 'crypto'
import { NextRequest } from 'next/server'

// ─── Types ──────────────────────────────────────────────────────────────

export type PlanTier = 'free' | 'pro' | 'business' | 'lifetime'
export type ResourceType = 'parts' | 'sales' | 'customers' | 'suppliers' | 'departments' | 'users'

interface PlanLimits {
  maxParts: number      // -1 = unlimited
  maxSales: number      // -1 = unlimited (checked per month)
  maxCustomers: number
  maxSuppliers: number
  maxDepartments: number
  maxUsers: number
  canExport: boolean
  canImport: boolean
  canPrint: boolean     // Free tier has watermark
  hasWatermark: boolean
  apiAccess: boolean
}

interface LimitCheckResult {
  allowed: boolean
  current: number
  limit: number
  plan: PlanTier
  message?: string
  upgradeUrl?: string
}

// ─── Plan Definitions ───────────────────────────────────────────────────

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    maxParts: 50,
    maxSales: 100,        // per month
    maxCustomers: 50,
    maxSuppliers: 20,
    maxDepartments: 5,
    maxUsers: 1,           // Solo only — no sub-users on free
    canExport: false,
    canImport: false,
    canPrint: true,        // Can print but with watermark
    hasWatermark: true,
    apiAccess: false,
  },
  pro: {
    maxParts: -1,          // Unlimited
    maxSales: -1,
    maxCustomers: -1,
    maxSuppliers: -1,
    maxDepartments: -1,
    maxUsers: 5,
    canExport: true,
    canImport: true,
    canPrint: true,
    hasWatermark: false,
    apiAccess: false,
  },
  business: {
    maxParts: -1,
    maxSales: -1,
    maxCustomers: -1,
    maxSuppliers: -1,
    maxDepartments: -1,
    maxUsers: 10,
    canExport: true,
    canImport: true,
    canPrint: true,
    hasWatermark: false,
    apiAccess: true,
  },
  lifetime: {
    maxParts: -1,
    maxSales: -1,
    maxCustomers: -1,
    maxSuppliers: -1,
    maxDepartments: -1,
    maxUsers: -1,           // Unlimited users
    canExport: true,
    canImport: true,
    canPrint: true,
    hasWatermark: false,
    apiAccess: true,
  },
}

export const PLAN_PRICES: Record<PlanTier, { monthly: number; yearly: number; lifetime: number | null }> = {
  free:      { monthly: 0,     yearly: 0,     lifetime: null },
  pro:       { monthly: 999,   yearly: 9999,  lifetime: 9999 },
  business:  { monthly: 2999,  yearly: 29999, lifetime: 24999 },
  lifetime:  { monthly: 0,     yearly: 0,     lifetime: 9999 },
}

// ─── IP Duplicate Detection ─────────────────────────────────────────────

/**
 * Hash an IP address with a pepper for privacy.
 * The hash is one-way — you can't reverse it to get the IP.
 * The pepper prevents rainbow table attacks even if the DB is leaked.
 */
export function hashIP(ip: string): string {
  const pepper = process.env.REGISTRATION_PEPPER || 'liafon-default-pepper-change-me'
  return crypto.createHash('sha256').update(`${ip}:${pepper}`).digest('hex')
}

/**
 * Extract the client IP from a NextRequest.
 * Handles Vercel proxy headers (x-vercel-forwarded-for, x-forwarded-for,
 * x-real-ip). Falls back to '127.0.0.1' to prevent empty string hashing.
 */
export function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
}

/**
 * Check if an IP already has a registered owner account.
 * Allows 1 owner per IP (configurable via MAX_OWNERS_PER_IP env var).
 *
 * Sub-users (admin/manager/staff) created by an owner don't count —
 * only owner-role accounts are checked.
 */
export async function checkIpDuplicate(ip: string): Promise<{
  allowed: boolean
  existingCount: number
  message?: string
}> {
  if (ip === 'unknown' || !ip) {
    // Can't determine IP — allow registration (better UX than blocking)
    return { allowed: true, existingCount: 0 }
  }

  const ipHash = hashIP(ip)
  const maxOwners = parseInt(process.env.MAX_OWNERS_PER_IP || '1', 10)

  // Count active owner accounts from this IP
  const existingOwners = await db.user.count({
    where: {
      ipHash,
      role: 'owner',
      isActive: true,
    },
  })

  if (existingOwners >= maxOwners) {
    return {
      allowed: false,
      existingCount: existingOwners,
      message: `Multiple accounts from the same location are not allowed. ` +
        `If you need a second account for a different business, please contact support.`,
    }
  }

  return { allowed: true, existingCount: existingOwners }
}

// ─── Storage Limit Enforcement ──────────────────────────────────────────

/**
 * Get the plan tier for an owner from their License record.
 * Falls back to 'free' if no license found.
 */
export async function getOwnerPlan(ownerId: string): Promise<PlanTier> {
  const license = await db.license.findUnique({
    where: { ownerId },
    select: { plan: true, status: true },
  })

  if (!license) return 'free'
  if (license.status === 'expired' || license.status === 'suspended') return 'free'

  return (license.plan as PlanTier) || 'free'
}

/**
 * Get the limits for an owner's plan.
 */
export async function getPlanLimits(ownerId: string): Promise<{ plan: PlanTier; limits: PlanLimits }> {
  const plan = await getOwnerPlan(ownerId)
  return { plan, limits: PLAN_LIMITS[plan] }
}

/**
 * Check if the owner can create a new resource of the given type.
 * Returns { allowed: true } if within limits, or { allowed: false, message } if exceeded.
 *
 * Usage:
 *   const check = await checkStorageLimit(ownerId, 'parts')
 *   if (!check.allowed) {
 *     return NextResponse.json({ error: check.message, upgradeRequired: true }, { status: 402 })
 *   }
 */
export async function checkStorageLimit(
  ownerId: string,
  resource: ResourceType
): Promise<LimitCheckResult> {
  const { plan, limits } = await getPlanLimits(ownerId)

  // Map resource type to limit + count query
  const limitMap: Record<ResourceType, { limit: number; count: () => Promise<number> }> = {
    parts: {
      limit: limits.maxParts,
      count: () => db.sparePart.count({ where: { ownerId, isActive: true } }),
    },
    sales: {
      limit: limits.maxSales,
      // Count sales in the current month
      count: () => {
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)
        return db.sale.count({
          where: { ownerId, createdAt: { gte: startOfMonth } },
        })
      },
    },
    customers: {
      limit: limits.maxCustomers,
      count: () => db.customer.count({ where: { ownerId, isActive: true } }),
    },
    suppliers: {
      limit: limits.maxSuppliers,
      count: () => db.supplier.count({ where: { ownerId, isActive: true } }),
    },
    departments: {
      limit: limits.maxDepartments,
      count: () => db.department.count({ where: { ownerId, isActive: true } }),
    },
    users: {
      limit: limits.maxUsers,
      count: () => db.user.count({ where: { ownerId, isActive: true } }),
    },
  }

  const config = limitMap[resource]
  const limit = config.limit

  // -1 = unlimited
  if (limit === -1) {
    return { allowed: true, current: 0, limit: -1, plan }
  }

  const current = await config.count()

  if (current >= limit) {
    const resourceName = resource === 'parts' ? 'parts'
      : resource === 'sales' ? 'sales this month'
      : resource

    return {
      allowed: false,
      current,
      limit,
      plan,
      message: `You've reached the free tier limit of ${limit} ${resourceName}. ` +
        `Upgrade to Pro (₹999/mo) for unlimited access.`,
      upgradeUrl: '/settings?tab=license',
    }
  }

  return { allowed: true, current, limit, plan }
}

/**
 * Check if a specific feature is available for the owner's plan.
 *
 * Usage:
 *   if (!(await checkFeatureAccess(ownerId, 'canExport'))) {
 *     return 402 "Export requires Pro plan"
 *   }
 */
export async function checkFeatureAccess(
  ownerId: string,
  feature: keyof PlanLimits
): Promise<boolean> {
  const { limits } = await getPlanLimits(ownerId)
  return Boolean(limits[feature])
}
