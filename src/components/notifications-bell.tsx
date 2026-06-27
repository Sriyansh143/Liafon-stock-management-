'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Bell, AlertTriangle, Package, TrendingUp, History } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppStore, AppPage } from '@/store/app-store'
import { formatCurrency } from '@/lib/currency'

interface LowStockItem {
  id: string
  type: 'out_of_stock' | 'low_stock'
  partNumber: string
  name: string
  category: string
  currentStock: number
  minStockLevel: number
  severity: 'critical' | 'warning'
}

interface ActivityItem {
  id: string
  action: string
  entityType: string
  summary: string
  timestamp: string
  userName: string | null
}

interface NotificationsData {
  lowStock: LowStockItem[]
  activity: ActivityItem[]
  todaySummary: {
    salesCount: number
    salesTotal: number
  }
}

interface ApiResponse {
  success: boolean
  notifications: NotificationsData
  unreadCount: number
  generatedAt: string
}

const REFRESH_INTERVAL_MS = 60_000 // 1 minute

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

export function NotificationsBell() {
  const currentUser = useAppStore((s) => s.currentUser)
  const setActivePage = useAppStore((s) => s.setActivePage)
  const currency = useAppStore((s) => s.currency)
  const [data, setData] = useState<NotificationsData | null>(null)
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!currentUser) return
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const res = await fetch('/api/notifications', { signal: controller.signal })
      if (!res.ok) return
      const json = (await res.json()) as ApiResponse
      if (controller.signal.aborted) return
      setData(json.notifications)
      setUnread(json.unreadCount)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      // Silent fail — the bell shouldn't spam toasts on every error
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [currentUser])

  // Initial fetch + periodic refresh. Pause when the tab is hidden so
  // we don't burn battery/data on background polling.
  useEffect(() => {
    if (!currentUser) return
    void fetchNotifications()
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id !== null) return
      id = setInterval(() => void fetchNotifications(), REFRESH_INTERVAL_MS)
    }
    const stop = () => {
      if (id === null) return
      clearInterval(id)
      id = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchNotifications()
        start()
      } else {
        stop()
      }
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [currentUser, fetchNotifications])

  // Mark notifications as "seen" when the dropdown is opened
  const handleOpenChange = (open: boolean) => {
    setOpen(open)
    if (open && unread > 0) {
      // Don't actually clear them — they remain actionable until the user
      // resolves the low-stock condition. We just stop the badge pulse.
      setUnread(0)
    }
  }

  const goToInventory = () => {
    setActivePage('inventory' as AppPage)
    setOpen(false)
  }
  const goToActivity = () => {
    setActivePage('activity' as AppPage)
    setOpen(false)
  }
  const goToSales = () => {
    setActivePage('sales' as AppPage)
    setOpen(false)
  }

  const criticalCount = data?.lowStock.filter((l) => l.severity === 'critical').length ?? 0
  const warningCount = data?.lowStock.filter((l) => l.severity === 'warning').length ?? 0

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-medium text-white"
            >
              {unread > 99 ? '99+' : unread}
            </motion.span>
          )}
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-rose-500/60 animate-ping" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 sm:w-96 p-0"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="font-semibold text-sm">Notifications</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => void fetchNotifications()}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>

        {!data && loading && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading notifications…
          </div>
        )}

        {data && (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1">
              {/* Today summary */}
              <div className="px-3 py-2 bg-muted/30">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Today&apos;s sales</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {data.todaySummary.salesCount} sales
                    </Badge>
                    <span className="font-semibold">
                      {formatCurrency(data.todaySummary.salesTotal, currency, 'INR')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Low-stock section */}
              <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  Stock alerts
                </span>
                <span>
                  {criticalCount > 0 && (
                    <Badge variant="destructive" className="text-[10px] mr-1">
                      {criticalCount} out
                    </Badge>
                  )}
                  {warningCount > 0 && (
                    <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                      {warningCount} low
                    </Badge>
                  )}
                  {criticalCount === 0 && warningCount === 0 && (
                    <span className="text-emerald-600 text-[10px]">All good</span>
                  )}
                </span>
              </DropdownMenuLabel>

              {data.lowStock.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  No stock alerts.
                </div>
              ) : (
                data.lowStock.slice(0, 6).map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    className="flex items-start gap-2 py-2 px-3 cursor-pointer"
                    onClick={goToInventory}
                  >
                    <div
                      className={`mt-0.5 flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${
                        item.severity === 'critical'
                          ? 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                          : 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400'
                      }`}
                    >
                      <Package className="h-3 w-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.partNumber} · {item.currentStock}/{item.minStockLevel} units
                      </p>
                    </div>
                  </DropdownMenuItem>
                ))
              )}

              {data.lowStock.length > 6 && (
                <DropdownMenuItem
                  className="text-xs text-center text-emerald-700 dark:text-emerald-400 cursor-pointer"
                  onClick={goToInventory}
                >
                  +{data.lowStock.length - 6} more — view all in inventory
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              {/* Activity section */}
              <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                <History className="h-3 w-3" />
                Recent activity
              </DropdownMenuLabel>

              {data.activity.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  No recent activity.
                </div>
              ) : (
                data.activity.slice(0, 5).map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    className="flex items-start gap-2 py-1.5 px-3 cursor-pointer"
                    onClick={goToActivity}
                  >
                    <div className="mt-0.5 flex-shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{item.summary}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.userName || 'System'} · {formatRelativeTime(item.timestamp)}
                      </p>
                    </div>
                  </DropdownMenuItem>
                ))
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="text-xs text-center text-emerald-700 dark:text-emerald-400 cursor-pointer"
                onClick={goToSales}
              >
                <TrendingUp className="h-3 w-3 mr-1.5" />
                View sales dashboard
              </DropdownMenuItem>
            </div>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
