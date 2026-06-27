import type { UserRole } from '@/store/app-store'

/**
 * Role-based field visibility permissions.
 *
 * Owner and Admin can see everything (cost prices, profit margins, etc.).
 * Manager can see cost/profit on reports but not on individual parts.
 * Staff (user role) cannot see cost prices or profit margins anywhere —
 * they only see selling prices and stock levels.
 *
 * This is enforced client-side for UI hiding. Server-side, the API still
 * returns all fields (the data is needed for calculations), but the
 * components check these permissions before rendering sensitive fields.
 *
 * The owner can customize these permissions via Settings → Customize tab.
 * The customizations are stored in the AppSetting table and loaded into
 * the Zustand store on app startup.
 */

export interface FieldPermissions {
  canSeeCostPrice: boolean
  canSeeProfit: boolean
  canSeeValuation: boolean
  canSeeSupplierCost: boolean
  canSeeReports: boolean
  canSeeActivityLog: boolean
  canSeeUsers: boolean
  canSeeSettings: boolean
  canCustomizeApp: boolean
}

export interface CustomizationSettings {
  fields: Record<string, Record<UserRole, boolean>>
  pages: Record<string, Record<UserRole, boolean>>
}

// Default permissions (used when no customization is saved)
const DEFAULT_FIELD_PERMS: Record<string, Record<UserRole, boolean>> = {
  costPrice: { owner: true, admin: true, manager: true, user: false },
  profit: { owner: true, admin: true, manager: true, user: false },
  valuation: { owner: true, admin: true, manager: true, user: false },
  supplierCost: { owner: true, admin: true, manager: true, user: false },
}

const DEFAULT_PAGE_PERMS: Record<string, Record<UserRole, boolean>> = {
  dashboard: { owner: true, admin: true, manager: true, user: true },
  inventory: { owner: true, admin: true, manager: true, user: true },
  sales: { owner: true, admin: true, manager: true, user: true },
  purchases: { owner: true, admin: true, manager: true, user: false },
  departments: { owner: true, admin: true, manager: true, user: false },
  reports: { owner: true, admin: true, manager: true, user: false },
  activity: { owner: true, admin: true, manager: false, user: false },
  settings: { owner: true, admin: true, manager: false, user: false },
  users: { owner: true, admin: false, manager: false, user: false },
}

/**
 * Returns field permissions for a given role, optionally using
 * customizations from the owner's settings.
 */
export function getFieldPermissions(
  role: UserRole | undefined | null,
  customFields?: Record<string, Record<UserRole, boolean>>
): FieldPermissions {
  const fields = customFields || DEFAULT_FIELD_PERMS

  const check = (key: string, defaultVal: boolean): boolean => {
    if (!role) return false
    return fields[key]?.[role] ?? defaultVal
  }

  const isAdminLevel = role === 'owner' || role === 'admin'

  return {
    canSeeCostPrice: check('costPrice', role === 'owner' || role === 'admin' || role === 'manager'),
    canSeeProfit: check('profit', role === 'owner' || role === 'admin' || role === 'manager'),
    canSeeValuation: check('valuation', role === 'owner' || role === 'admin' || role === 'manager'),
    canSeeSupplierCost: check('supplierCost', role === 'owner' || role === 'admin' || role === 'manager'),
    canSeeReports: checkPagePermission('reports', role, undefined),
    canSeeActivityLog: checkPagePermission('activity', role, undefined),
    canSeeUsers: checkPagePermission('users', role, undefined),
    canSeeSettings: checkPagePermission('settings', role, undefined),
    canCustomizeApp: isAdminLevel,
  }
}

/**
 * Check if a role can access a specific page.
 * Uses customizations if provided, otherwise falls back to defaults.
 */
export function checkPagePermission(
  page: string,
  role: UserRole | undefined | null,
  customPages?: Record<string, Record<UserRole, boolean>>
): boolean {
  if (!role) return false
  const pages = customPages || DEFAULT_PAGE_PERMS
  return pages[page]?.[role] ?? false
}

export { DEFAULT_FIELD_PERMS, DEFAULT_PAGE_PERMS }
