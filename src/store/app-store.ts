import { create } from 'zustand'
import type { CustomizationSettings } from '@/lib/permissions'

export type AppPage = 'dashboard' | 'inventory' | 'sales' | 'purchases' | 'departments' | 'reports' | 'analysis' | 'shops' | 'purchase-orders' | 'stock-transfers' | 'stock-count' | 'activity' | 'settings' | 'users'

export type UserRole = 'owner' | 'admin' | 'manager' | 'user'

export interface UserInfo {
  id: string
  name: string
  email: string
  role: UserRole
  isActive: boolean
}

interface AppState {
  activePage: AppPage
  sidebarOpen: boolean
  currentUser: UserInfo | null
  currency: string
  // Owner-configured customization (field/page visibility per role).
  // Loaded from /api/customization/me on login; empty means "use defaults".
  customization: CustomizationSettings | null
  customizationLoaded: boolean
  setActivePage: (page: AppPage) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setCurrentUser: (user: UserInfo | null) => void
  setCurrency: (currency: string) => void
  setCustomization: (c: CustomizationSettings | null) => void
  hasAccess: (page: AppPage) => boolean
  isOwner: () => boolean
  isAdmin: () => boolean
  isManager: () => boolean
}

// Role-based page access control (fallback when no customization is loaded)
const ROLE_ACCESS: Record<UserRole, AppPage[]> = {
  owner: ['dashboard', 'inventory', 'sales', 'purchases', 'departments', 'reports', 'analysis', 'shops', 'purchase-orders', 'stock-transfers', 'stock-count', 'activity', 'settings', 'users'],
  admin: ['dashboard', 'inventory', 'sales', 'purchases', 'departments', 'reports', 'analysis', 'shops', 'purchase-orders', 'stock-transfers', 'stock-count', 'settings'],
  manager: ['dashboard', 'inventory', 'sales', 'purchases', 'reports', 'analysis', 'purchase-orders', 'stock-transfers', 'stock-count'],
  user: ['dashboard', 'inventory', 'sales'],
}

export const useAppStore = create<AppState>((set, get) => ({
  activePage: 'dashboard',
  sidebarOpen: true,
  currentUser: null,
  currency: 'INR',
  customization: null,
  customizationLoaded: false,
  setActivePage: (page) => set({ activePage: page }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setCurrentUser: (user) => {
    // Only reset activePage when transitioning from null → user (login).
    // Token refreshes or same-user updates should NOT bounce the user
    // back to the dashboard.
    const prev = get().currentUser
    const shouldResetPage = !prev && user !== null
    set({ currentUser: user, ...(shouldResetPage ? { activePage: 'dashboard' as const } : {}) })
    // Save to localStorage for session persistence
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem('liafon_user', JSON.stringify(user))
      } else {
        localStorage.removeItem('liafon_user')
        // Also clear customization on logout — it's per-deployment,
        // not per-user-agent, but clearing avoids showing stale
        // permission overrides to a different user on a shared device.
        localStorage.removeItem('liafon_customization')
      }
    }
  },
  setCurrency: (currency) => {
    set({ currency })
    if (typeof window !== 'undefined') {
      localStorage.setItem('liafon_currency', currency)
    }
  },
  setCustomization: (c) => {
    set({ customization: c, customizationLoaded: true })
    if (typeof window !== 'undefined') {
      if (c) {
        try {
          localStorage.setItem('liafon_customization', JSON.stringify(c))
        } catch {
          // ignore quota errors
        }
      } else {
        localStorage.removeItem('liafon_customization')
      }
    }
  },
  hasAccess: (page) => {
    const { currentUser, customization } = get()
    if (!currentUser) return false
    // Honor owner customizations if loaded
    if (customization?.pages?.[page]) {
      return customization.pages[page]?.[currentUser.role] ?? false
    }
    // Fall back to the static role-access table
    const pages = ROLE_ACCESS[currentUser.role] || ROLE_ACCESS.user
    return pages.includes(page)
  },
  isOwner: () => get().currentUser?.role === 'owner',
  isAdmin: () => {
    const role = get().currentUser?.role
    return role === 'owner' || role === 'admin'
  },
  isManager: () => {
    const role = get().currentUser?.role
    return role === 'owner' || role === 'admin' || role === 'manager'
  },
}))