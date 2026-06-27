'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  PackageOpen,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Package as PackageIcon,
  X,
  Users,
  ChevronDown,
  IndianRupee,
  Command as CommandIcon,
  Activity as ActivityIcon,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, AppPage } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getCurrencyList, CURRENCIES } from '@/lib/currency'
import { NotificationsBell } from '@/components/notifications-bell'
import { useSessionExpiry } from '@/hooks/use-session-expiry'
import { useLicenseCheck } from '@/hooks/use-license-check'
import { LicenseLockScreen } from '@/components/license-lock-screen'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/theme-toggle'
import { CommandPalette } from '@/components/command-palette'
import { ErrorBoundary } from '@/components/error-boundary'

import Dashboard from '@/components/pages/dashboard'
import Inventory from '@/components/pages/inventory'
import SalesPage from '@/components/pages/sales-page'
import PurchasesPage from '@/components/pages/purchases-page'
import DepartmentsPage from '@/components/pages/departments-page'
import ReportsPage from '@/components/pages/reports-page'
import ActivityPage from '@/components/pages/activity-page'
import SettingsPage from '@/components/pages/settings-page'
import UsersPage from '@/components/pages/users-page'
import LoginPage from '@/components/login-page'
import { ProductAnalysisDashboard } from '@/components/phase4/product-analysis-dashboard'
import { ShopsManager } from '@/components/phase4/shops-manager'
import { PurchaseOrdersPage } from '@/components/phase4/purchase-orders-page'
import { StockTransfersPage } from '@/components/phase4/stock-transfers-page'
import { StockCountPage } from '@/components/phase4/stock-count-page'
import { TaxRatesSection, TwoFactorSection, WhatsAppSection } from '@/components/phase4/settings-sections'

const allNavItems: { id: AppPage; label: string; icon: React.ElementType; description: string; roles: string[] }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Overview & analytics', roles: ['owner', 'admin', 'manager', 'user'] },
  { id: 'inventory', label: 'Inventory', icon: Package, description: 'Manage spare parts', roles: ['owner', 'admin', 'manager', 'user'] },
  { id: 'sales', label: 'Sales', icon: ShoppingCart, description: 'Record & track sales', roles: ['owner', 'admin', 'manager', 'user'] },
  { id: 'purchases', label: 'Purchases', icon: PackageOpen, description: 'Purchase ledger', roles: ['owner', 'admin', 'manager'] },
  { id: 'purchase-orders', label: 'Purchase Orders', icon: PackageOpen, description: 'PO workflow (draft→approve→receive)', roles: ['owner', 'admin', 'manager'] },
  { id: 'stock-transfers', label: 'Stock Transfers', icon: PackageOpen, description: 'Move stock between shops', roles: ['owner', 'admin', 'manager'] },
  { id: 'stock-count', label: 'Stock Count', icon: PackageOpen, description: 'Physical stocktaking', roles: ['owner', 'admin', 'manager'] },
  { id: 'shops', label: 'Shops', icon: Building2, description: 'Manage branches', roles: ['owner', 'admin'] },
  { id: 'departments', label: 'Departments', icon: Building2, description: 'WhatsApp contacts', roles: ['owner', 'admin', 'manager'] },
  { id: 'reports', label: 'Reports', icon: BarChart3, description: 'Analytics & insights', roles: ['owner', 'admin', 'manager'] },
  { id: 'analysis', label: 'Analysis', icon: TrendingUp, description: 'Restock recommendations & dead stock', roles: ['owner', 'admin', 'manager'] },
  { id: 'activity', label: 'Activity Log', icon: ActivityIcon, description: 'Audit trail of all actions', roles: ['owner'] },
  { id: 'settings', label: 'Settings', icon: Settings, description: 'Backup, import & config', roles: ['owner', 'admin'] },
  { id: 'users', label: 'Users', icon: Users, description: 'User management', roles: ['owner'] },
]

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', manager: 'Manager', user: 'Staff' }
// Muted, professional role colors — indigo for owner (matches brand),
// neutral slate for staff. No bright emerald/amber that screams "demo".
const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-primary/10 text-primary',
  admin: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  manager: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  user: 'bg-muted text-muted-foreground',
}

// ─── Fetch with timeout helper ──────────────────────────────────────────────
//
// Returns a Promise that rejects after `ms` milliseconds. Combined with
// Promise.race this lets us put a hard cap on how long any single fetch
// can take, so the UI never hangs indefinitely on "Initializing…".
//
// The timeout for /api/auth is 10s — long enough to cover the first
// dev-server compile of the auth route, short enough that the user
// isn't stuck on the loading screen forever if the server is unresponsive.
function fetchWithTimeout(url: string, ms: number = 10000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout))
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { activePage, setActivePage, setSidebarOpen, hasAccess } = useAppStore()
  const [lowStockCount, setLowStockCount] = useState<number | null>(null)
  const navItems = allNavItems.filter((item) => hasAccess(item.id))

  useEffect(() => {
    let cancelled = false
    const fetchLowStock = async () => {
      try {
        const res = await fetchWithTimeout('/api/stock', 10000)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && typeof data.lowStockParts === 'number') {
          setLowStockCount(data.lowStockParts)
        }
      } catch {
        // ignore — non-critical
      }
    }
    fetchLowStock()
    const interval = setInterval(fetchLowStock, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const handleNavClick = (page: AppPage) => {
    setActivePage(page)
    if (onClose) onClose()
    if (window.innerWidth < 1024) setSidebarOpen(false)
  }

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Brand header — minimal, no gradient */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary text-primary-foreground shrink-0">
            <PackageIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-tight text-foreground truncate">
              Liafon
            </h1>
            <p className="text-[10px] text-muted-foreground truncate uppercase tracking-wider">
              Stock Management
            </p>
          </div>
        </div>
      </div>

      {/* Nav — refined: subtle active state with indigo accent + left border */}
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="space-y-0.5" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = activePage === item.id
            const Icon = item.icon
            return (
              <Tooltip key={item.id} delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors group relative ${
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 font-normal'
                    }`}
                  >
                    {/* Left accent bar for active */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-primary" />
                    )}
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.id === 'inventory' && lowStockCount !== null && lowStockCount > 0 && (
                      <Badge className={`text-[10px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center font-medium ${
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'bg-destructive/10 text-destructive'
                      }`}>
                        {lowStockCount}
                      </Badge>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{item.description}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Footer — command palette hint + system status (compact) */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('liafon:command-palette:open'))}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Open command palette"
        >
          <CommandIcon className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">Quick actions</span>
          <kbd className="text-[10px] font-mono text-muted-foreground/60">⌘K</kbd>
        </button>
      </div>
    </div>
  )
}

// ─── Loading screen with timeout + retry ────────────────────────────────────
//
// Loading screen shown while we check auth + auto-seed.
// After 8s the "slow" UI kicks in (retry button always available).
// After 15s the parent effect force-bails to login.
function LoadingScreen({ onRetry }: { onRetry: () => void }) {
  const [slow, setSlow] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const slowTimer = setTimeout(() => setSlow(true), 8000)
    const tickTimer = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => {
      clearTimeout(slowTimer)
      clearInterval(tickTimer)
    }
  }, [])
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-sm w-full">
        {/* Logo mark — refined, no rounded-2xl + colored bg */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <PackageIcon className="w-6 h-6 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Liafon Stock Management
            </h1>
            <p className="text-xs text-muted-foreground">
              {slow
                ? 'Taking longer than expected'
                : 'Initializing…'}
            </p>
          </div>
        </div>

        {/* Progress indicator — thin indigo bar that animates 0→90% over 12s */}
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-1000 ease-out"
            style={{ width: `${Math.min(90, (elapsed / 12) * 100)}%` }}
          />
        </div>

        {/* Slow state — show retry + helpful message */}
        {slow && (
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-2 text-left bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-300">
                <p className="font-semibold mb-1">Server is slow to respond</p>
                <p>
                  The first compile of the dev server can take 10–20s. If this
                  takes longer, check the server console or click retry.
                </p>
              </div>
            </div>
            <Button onClick={onRetry} variant="default" size="sm" className="w-full">
              <RefreshCw className="h-3.5 w-3.5 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {/* Elapsed time — small, monospace, for debugging */}
        {!slow && (
          <p className="text-[10px] text-muted-foreground/60 tabular-nums">
            {elapsed}s elapsed
          </p>
        )}
      </div>
    </div>
  )
}

export default function HomePage() {
  // Select only the fields we need from the store, so unrelated state
  // changes (like sidebarOpen during mobile nav) don't re-render us.
  const activePage = useAppStore((s) => s.activePage)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const currentUser = useAppStore((s) => s.currentUser)
  const currency = useAppStore((s) => s.currency)
  const setActivePage = useAppStore((s) => s.setActivePage)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const setCurrentUser = useAppStore((s) => s.setCurrentUser)
  const setCurrency = useAppStore((s) => s.setCurrency)
  const setCustomization = useAppStore((s) => s.setCustomization)
  const hasAccess = useAppStore((s) => s.hasAccess)

  const [isMobile, setIsMobile] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showLogin, setShowLogin] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const { toast } = useToast()

  // Ref to track loading state without re-triggering the auth-check effect.
  // IMPORTANT: don't mutate refs during render (React 19 strict mode
  // double-invokes render, which would cause this to run twice). Move
  // the assignment into useEffect so it only runs after commit.
  const loadingRef = useRef(true)
  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  // Watch for 401 responses on any fetch and bounce the user to login
  useSessionExpiry()

  // License check — blocks access if license is inactive/expired
  const { status: licenseStatus, checking: licenseChecking } = useLicenseCheck()

  // Listen for the session-expired custom event from useSessionExpiry
  useEffect(() => {
    const handler = () => {
      toast({
        title: 'Session expired',
        description: 'Please sign in again to continue.',
        variant: 'destructive',
      })
    }
    window.addEventListener('liafon:session-expired', handler)
    return () => window.removeEventListener('liafon:session-expired', handler)
  }, [toast])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // ─── Auth check effect ─────────────────────────────────────────────────
  //
  // 12-second cap on the /api/auth fetch. If it takes longer, we assume
  // the server is unresponsive and show the login screen so the user
  // isn't stuck on "Initializing…" forever.
  //
  // A separate 15-second HARD fallback runs in parallel: no matter what
  // state the auth-check effect is in, after 15s we force loading=false
  // and show either the dashboard (if currentUser got set) or the login
  // screen. This is the safety net that prevents the "stuck on
  // initialization" bug users have reported.
  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams(window.location.search)

    if (params.get('login') === '1') {
      document.cookie = 'liafon_auth=; max-age=0; path=/'
      document.cookie = 'liafon_user=; max-age=0; path=/'
      setCurrentUser(null)
      setShowLogin(true)
      setAuthChecked(true)
      setLoading(false)
      return
    }

    // Hard 15s fallback — guarantees we never get stuck on loading.
    const hardFallback = setTimeout(() => {
      if (cancelled) return
      if (loadingRef.current) {
        console.warn('[Liafon] Auth check took >15s — forcing login screen')
        setShowLogin(true)
        setAuthChecked(true)
        setLoading(false)
      }
    }, 15000)

    fetchWithTimeout('/api/auth', 12000)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.authenticated && data.user) {
          setCurrentUser(data.user)
          // Fetch the owner-configured customization so non-admin clients
          // honor the field/page visibility overrides. Fire-and-forget —
          // if it fails, the client falls back to default permissions.
          fetch('/api/customization/me', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((c) => {
              if (cancelled || !c?.customization) return
              setCustomization(c.customization)
            })
            .catch(() => {
              // Non-critical — defaults will be used
            })
          const page = params.get('page') as AppPage | null
          if (page && allNavItems.some((n) => n.id === page)) {
            setActivePage(page)
          }
          const action = params.get('action')
          if (action === 'new') {
            // Whitelist the pages that have a 'liafon:X:new' listener —
            // previously any page value was dispatched as a custom
            // event, allowing `?action=new&page=anything` to fire
            // `liafon:anything:new` (no listeners, but a code smell).
            const NEW_ACTION_PAGES: AppPage[] = ['inventory', 'sales', 'purchases']
            const targetPage: AppPage | null =
              page && NEW_ACTION_PAGES.includes(page) ? page : 'sales'
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent(`liafon:${targetPage}:new`)
              )
            }, 400)
          }
          // Clear consumed query params so a refresh doesn't re-trigger
          // the action (e.g. re-open the New Sale dialog). Keep
          // `login=1` and `expired=1` (consumed by the login page)
          // and `reset-password` / `email` (consumed by the reset form).
          const preservedKeys = new Set(['login', 'expired', 'reset-password', 'email'])
          const hasConsumedParams = Array.from(params.keys()).some(
            (k) => !preservedKeys.has(k)
          )
          if (hasConsumedParams) {
            try {
              const remaining = new URLSearchParams()
              for (const k of preservedKeys) {
                const v = params.get(k)
                if (v !== null) remaining.set(k, v)
              }
              const qs = remaining.toString()
              window.history.replaceState(
                {},
                '',
                qs ? `/?${qs}` : '/'
              )
            } catch {
              // ignore — history.replaceState can throw in rare cross-origin cases
            }
          }
          setAuthChecked(true)
          // loading will be cleared by the seeding useEffect below
        } else {
          setShowLogin(true)
          setAuthChecked(true)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (cancelled) return
        // Network error or timeout — show login screen so user isn't stuck
        console.error('[Liafon] /api/auth failed or timed out:', err)
        setShowLogin(true)
        setAuthChecked(true)
        setLoading(false)
      })

    // localStorage can throw in Safari private mode or when cookies are
    // disabled — wrap in try/catch so the auth check still completes.
    try {
      const savedCurrency = localStorage.getItem('liafon_currency')
      if (savedCurrency && CURRENCIES[savedCurrency]) setCurrency(savedCurrency)
    } catch {
      // ignore — default currency (INR) will be used
    }

    return () => {
      cancelled = true
      clearTimeout(hardFallback)
    }
  }, [setCurrentUser, setCurrency, setActivePage, setCustomization])

  // ─── Auto-seed check (only when authenticated as owner) ────────────────
  const seedDatabase = useCallback(async () => {
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      if (res.ok) {
        setSeeded(true)
        toast({
          title: 'Database initialized',
          description: 'Sample data loaded with mock users',
        })
      } else {
        const err = await res.json().catch(() => ({}))
        toast({
          title: 'Could not initialize',
          description: err.error || 'Please sign in as the owner to seed data.',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to initialize database',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!authChecked || !currentUser) return
    if (currentUser.role !== 'owner') {
      setLoading(false)
      return
    }
    let cancelled = false
    fetchWithTimeout('/api/parts?limit=1', 10000)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.total > 0) {
          setSeeded(true)
          setLoading(false)
        } else {
          seedDatabase()
        }
      })
      .catch(() => {
        if (cancelled) return
        setLoading(false) // don't block the UI on a parts fetch failure
      })
    return () => {
      cancelled = true
    }
  }, [authChecked, currentUser, seedDatabase])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
    } catch {
      // ignore
    }
    setCurrentUser(null)
    document.cookie = 'liafon_auth=; max-age=0; path=/'
    document.cookie = 'liafon_user=; max-age=0; path=/'
    setShowLogin(true)
  }

  useEffect(() => {
    if (currentUser && !hasAccess(activePage)) {
      const accessible = allNavItems.find((n) => hasAccess(n.id))
      if (accessible) setActivePage(accessible.id)
    }
  }, [currentUser, activePage, hasAccess, setActivePage])

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard key="dashboard" />
      case 'inventory':
        return <Inventory key="inventory" />
      case 'sales':
        return <SalesPage key="sales" />
      case 'purchases':
        return <PurchasesPage key="purchases" />
      case 'purchase-orders':
        return <PurchaseOrdersPage key="purchase-orders" />
      case 'stock-transfers':
        return <StockTransfersPage key="stock-transfers" />
      case 'stock-count':
        return <StockCountPage key="stock-count" />
      case 'shops':
        return <ShopsManager key="shops" />
      case 'departments':
        return <DepartmentsPage key="departments" />
      case 'reports':
        return <ReportsPage key="reports" />
      case 'analysis':
        return <ProductAnalysisDashboard key="analysis" />
      case 'activity':
        return <ActivityPage key="activity" />
      case 'settings':
        return <SettingsPage key="settings" />
      case 'users':
        return <UsersPage key="users" />
      default:
        return <Dashboard key="dashboard" />
    }
  }

  // ── ALL hooks MUST be called BEFORE any early returns ──────────────
  // useMemo for currencyList — placed here (before early returns) to
  // satisfy React's Rules of Hooks. Previously this was after the
  // loading/login/license early returns, causing "Rendered more hooks
  // than during the previous render" crashes.
  const currencyList = useMemo(() => getCurrencyList(), [])

  // ── Loading screen ──────────────────────────────────────────────────────
  if (loading || !authChecked) {
    return (
      <LoadingScreen
        onRetry={() => {
          // Hard reload — bypasses cache
          window.location.reload()
        }}
      />
    )
  }

  if (showLogin) return <LoginPage />

  // License lock screen — blocks access if license is inactive or expired
  if (!licenseChecking && licenseStatus && !licenseStatus.active) {
    return (
      <LicenseLockScreen
        message={licenseStatus.message}
        trial={licenseStatus.trial}
        expired={licenseStatus.expired}
        daysRemaining={licenseStatus.daysRemaining}
      />
    )
  }

  return (
    <div className="min-h-screen bg-background flex">
      {!isMobile && (
        <aside
          className={`fixed top-0 left-0 z-40 h-screen bg-card border-r border-border transition-all duration-300 ease-in-out flex flex-col ${sidebarOpen ? 'w-64' : 'w-[68px]'}`}
          aria-label="Sidebar"
        >
          {sidebarOpen ? (
            <SidebarContent />
          ) : (
            <div className="flex flex-col items-center py-4 gap-2 w-full">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center mb-4 shadow-md shadow-emerald-600/25">
                <PackageIcon className="w-5 h-5" />
              </div>
              {allNavItems
                .filter((i) => hasAccess(i.id))
                .map((item) => {
                  const Icon = item.icon
                  const isActive = activePage === item.id
                  return (
                    <Tooltip key={item.id} delayDuration={300}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setActivePage(item.id)}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={item.label}
                          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${isActive ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <Icon className="w-5 h-5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              <div className="mt-auto">
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleSidebar}
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Expand sidebar"
                    >
                      <Menu className="w-5 h-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Expand sidebar</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
        </aside>
      )}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 z-50 w-72 h-screen bg-card border-r border-border shadow-xl"
            >
              <div className="absolute top-3 right-3 z-10">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(false)}
                  className="h-8 w-8"
                  aria-label="Close sidebar"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <SidebarContent onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      <main
        className={`flex-1 transition-all duration-300 ease-in-out min-h-screen ${!isMobile ? (sidebarOpen ? 'ml-64' : 'ml-[68px]') : 'ml-0'}`}
      >
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
          <div className="flex items-center justify-between px-4 sm:px-6 h-14">
            <div className="flex items-center gap-3 min-w-0">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebar}
                  className="h-8 w-8 -ml-1.5"
                  aria-label="Open sidebar"
                >
                  <Menu className="w-4.5 h-4.5" />
                </Button>
              )}
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate tracking-tight">
                  {allNavItems.find((n) => n.id === activePage)?.label || 'Dashboard'}
                </h2>
                <p className="text-[11px] text-muted-foreground hidden sm:block truncate">
                  {allNavItems.find((n) => n.id === activePage)?.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hidden sm:flex"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('liafon:command-palette:open')
                      )
                    }
                    aria-label="Open command palette (Ctrl+K)"
                  >
                    <CommandIcon className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>
                    Command Palette <kbd className="ml-1 text-[10px]">⌘K</kbd>
                  </p>
                </TooltipContent>
              </Tooltip>

              <ThemeToggle />

              <NotificationsBell />

              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-8 w-[88px] text-xs" aria-label="Select currency">
                  <IndianRupee className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyList.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="text-xs">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!seeded && currentUser?.role === 'owner' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={seedDatabase}
                  className="text-xs gap-1.5 h-8"
                >
                  <PackageIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Load Data</span>
                </Button>
              )}

              {currentUser && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-2 px-1.5 hover:bg-muted">
                      <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
                        <span className="text-[11px] font-semibold">
                          {currentUser.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="hidden sm:flex flex-col items-start">
                        <span className="text-xs font-medium text-foreground leading-tight">
                          {currentUser.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-tight capitalize">
                          {ROLE_LABELS[currentUser.role] || currentUser.role}
                        </span>
                      </div>
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium text-foreground">{currentUser.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{currentUser.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] capitalize ${ROLE_COLORS[currentUser.role] || ''}`}
                      >
                        {ROLE_LABELS[currentUser.role] || currentUser.role}
                      </Badge>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="text-destructive focus:text-destructive cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </header>
        <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
          <ErrorBoundary>
            <AnimatePresence mode="wait">
              <motion.div
                key={activePage}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                {renderPage()}
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </div>
      </main>

      <CommandPalette />
    </div>
  )
}
