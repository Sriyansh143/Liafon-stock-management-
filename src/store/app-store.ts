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
    const prev = get().currentUser
    const shouldResetPage = !prev && user !== null
    set({ currentUser: user, ...(shouldResetPage ? { activePage: 'dashboard' as const } : {}) })
    if (typeof window !== 'undefined') {
      if (user) { localStorage.setItem('liafon_user', JSON.stringify(user)) }
      else { localStorage.removeItem('liafon_user'); localStorage.removeItem('liafon_customization') }
    }
  },
  setCurrency: (currency) => { set({ currency }); if (typeof window !== 'undefined') localStorage.setItem('liafon_currency', currency) },
  setCustomization: (c) => {
    set({ customization: c, customizationLoaded: true })
    if (typeof window !== 'undefined') { if (c) localStorage.setItem('liafon_customization', JSON.stringify(c)); else localStorage.removeItem('liafon_customization') }
  },
  hasAccess: (page) => {
    const user = get().currentUser
    if (!user) return false
    const custom = get().customization
    if (custom?.pages?.[page]) return custom.pages[page][user.role] ?? false
    return ROLE_ACCESS[user.role]?.includes(page) ?? false
  },
  isOwner: () => get().currentUser?.role === 'owner',
  isAdmin: () => ['owner', 'admin'].includes(get().currentUser?.role ?? ''),
  isManager: () => ['owner', 'admin', 'manager'].includes(get().currentUser?.role ?? ''),
}))
