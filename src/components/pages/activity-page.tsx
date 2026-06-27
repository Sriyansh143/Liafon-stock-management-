'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Activity,
  LogIn,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Database,
  Upload,
  Download,
  Package,
  ShoppingCart,
  Settings as SettingsIcon,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  User,
  Loader2,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { useDebounce } from '@/hooks/use-fetch'
import { DataTablePagination } from '@/components/data-table-pagination'
import { buildCSV, downloadCSV } from '@/lib/print'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActivityLogEntry {
  id: string
  userId: string | null
  action: string
  entityType: string
  entityId: string
  summary: string
  metadata: string
  ipAddress: string
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    role: string
  } | null
}

interface ActivityResponse {
  logs: ActivityLogEntry[]
  total: number
  page: number
  limit: number
}

// ─── Action metadata ─────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; icon: typeof Activity }> = {
  LOGIN: { label: 'Login', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', icon: LogIn },
  LOGOUT: { label: 'Logout', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: LogOut },
  LOGIN_FAILED: { label: 'Login Failed', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300', icon: ShieldAlert },
  CREATE: { label: 'Create', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300', icon: Plus },
  UPDATE: { label: 'Update', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', icon: Pencil },
  DELETE: { label: 'Delete', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300', icon: Trash2 },
  BACKUP: { label: 'Backup', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300', icon: Database },
  RESTORE: { label: 'Restore', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', icon: RefreshCw },
  IMPORT: { label: 'Import', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300', icon: Upload },
  EXPORT: { label: 'Export', color: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300', icon: Download },
  STOCK_ADJUST: { label: 'Stock Adjust', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300', icon: Package },
  SEED: { label: 'Seed Data', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300', icon: Database },
}

const ENTITY_ICON: Record<string, typeof Activity> = {
  user: User,
  part: Package,
  sale: ShoppingCart,
  purchase: Package,
  department: User,
  customer: User,
  supplier: User,
  backup: Database,
  setting: SettingsIcon,
  system: AlertTriangle,
}

// ─── Animation variants ──────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const { toast } = useToast()
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const debouncedSearch = useDebounce(search, 300)

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (actionFilter !== 'all') params.set('action', actionFilter)
      const res = await fetch(`/api/activity?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch activity log')
      const data: ActivityResponse = await res.json()
      setLogs(data.logs)
      setTotal(data.total)
    } catch {
      toast({ title: 'Error', description: 'Failed to load activity log.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [actionFilter, page, limit, toast])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [actionFilter, limit])

  // Filter logs client-side by search (the API doesn't support text search yet)
  const filtered = debouncedSearch
    ? logs.filter(
        (log) =>
          log.summary.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          log.user?.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          log.user?.email.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : logs

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-600" />
            Activity Log
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Audit trail of all actions performed in the system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {total} {total === 1 ? 'event' : 'events'}
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (filtered.length === 0) {
                toast({ title: 'Nothing to export', variant: 'destructive' })
                return
              }
              const rows = filtered.map((log) => ({
                Action: log.action,
                EntityType: log.entityType,
                Summary: log.summary,
                User: log.user?.name || 'System',
                IP: log.ipAddress || '',
                Timestamp: format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss'),
              }))
              downloadCSV(`activity_log_${format(new Date(), 'yyyy-MM-dd')}.csv`, buildCSV(rows))
              toast({ title: 'Exported', description: `${rows.length} entries` })
            }}
            disabled={filtered.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
        </div>
      </motion.div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Search by summary, user name, or email..."
              aria-label="Search activity log"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full sm:w-[200px]" aria-label="Filter by action">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {Object.entries(ACTION_META).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Activity className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">No activity yet</p>
                <p className="text-xs mt-1">Actions performed in the system will appear here.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[110px]">Action</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead className="w-[180px]">User</TableHead>
                    <TableHead className="w-[140px]">IP Address</TableHead>
                    <TableHead className="w-[180px]">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => {
                    const meta = ACTION_META[log.action] ?? {
                      label: log.action,
                      color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                      icon: Activity,
                    }
                    const ActionIcon = meta.icon
                    const EntityIcon = ENTITY_ICON[log.entityType] ?? Activity
                    return (
                      <TableRow key={log.id} className="hover:bg-muted/40">
                        <TableCell>
                          <Badge variant="secondary" className={`text-[10px] gap-1 ${meta.color}`}>
                            <ActionIcon className="h-3 w-3" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <EntityIcon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{log.summary}</p>
                              <p className="text-xs text-muted-foreground">
                                {log.entityType}
                                {log.entityId && ` · ${log.entityId.slice(-6)}`}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.user ? (
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{log.user.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {log.user.email}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Anonymous</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-muted-foreground">
                            {log.ipAddress || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            <p className="text-muted-foreground">
                              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                            </p>
                            <p className="text-muted-foreground/70">
                              {format(new Date(log.createdAt), 'MMM d, h:mm a')}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}

            {/* Pagination */}
            {!loading && total > 0 && (
              <DataTablePagination
                page={page}
                totalPages={Math.max(1, Math.ceil(total / limit))}
                total={total}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={setLimit}
                itemLabel="entries"
              />
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
