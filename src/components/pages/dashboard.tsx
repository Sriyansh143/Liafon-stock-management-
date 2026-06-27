'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  Package,
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Wrench,
  RefreshCw,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { getFieldPermissions } from '@/lib/permissions';
import { formatCurrency, formatCurrencyShort } from '@/lib/currency';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/date-range-filter';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecentActivityPart {
  name: string;
  partNumber: string;
}

interface RecentActivity {
  id: string;
  type: 'SALE' | 'PURCHASE' | 'ADJUSTMENT';
  quantity: number;
  previousStock: number;
  newStock: number;
  notes: string;
  createdAt: string;
  part: RecentActivityPart;
}

interface SalesByDay {
  date: string;
  _sum: { totalPrice: number; quantity: number };
}

interface PurchasesByDay {
  date: string;
  _sum: { totalCost: number; quantity: number };
}

interface PartsByCategory {
  category: string;
  _count: number;
}

interface TopSellingPartPart {
  name: string;
  partNumber: string;
}

interface TopSellingPart {
  partId: string;
  _sum: { quantity: number; totalPrice: number };
  part: TopSellingPartPart;
}

interface DashboardData {
  totalParts: number;
  lowStockParts: number;
  todaySalesCount: number;
  todayPurchasesCount: number;
  todaySalesTotal: number;
  todayPurchasesTotal: number;
  periodSalesCount?: number;
  periodPurchasesCount?: number;
  periodSalesTotal?: number;
  periodPurchasesTotal?: number;
  dateLabel?: string;
  lowStockItems: number;
  recentActivity: RecentActivity[];
  salesByDay: SalesByDay[];
  purchasesByDay: PurchasesByDay[];
  partsByCategory: PartsByCategory[];
  topSellingParts: TopSellingPart[];
  inventoryValue?: {
    totalUnits: number;
    costValue: number;
    retailValue: number;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Refined chart palette — indigo as primary, supporting tones muted
const CATEGORY_COLORS = [
  '#4f46e5', // indigo-600
  '#0891b2', // cyan-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
  '#ea580c', // orange-600
  '#16a34a', // green-600
  '#ca8a04', // yellow-600
  '#dc2626', // red-600
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    // `as const` so TypeScript infers the literal type 'easeOut' instead
    // of `string`, which framer-motion v12's `Easing` union requires.
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`;
  return formatDistanceToNow(date, { addSuffix: true });
}

function formatChartDate(dateStr: string): string {
  return format(new Date(dateStr), 'MMM d');
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function KPICardSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card className="p-6">
      <Skeleton className="h-5 w-32 mb-6" />
      <Skeleton className="h-[260px] w-full rounded-lg" />
    </Card>
  );
}

function KPICard({
  icon: Icon,
  label,
  value,
  subtitle,
  bgColor,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtitle: string;
  bgColor: string;
  iconColor: string;
}) {
  return (
    <Card className="p-5 hover:shadow-md transition-shadow duration-200 border-border/80">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
            {label}
          </p>
          <p className="text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        </div>
        <div
          className={`flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-md ${bgColor}`}
        >
          <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
        </div>
      </div>
    </Card>
  );
}

function ActivityBadge({ type }: { type: 'SALE' | 'PURCHASE' | 'ADJUSTMENT' }) {
  switch (type) {
    case 'SALE':
      return (
        <Badge className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900/50 font-medium">
          <ArrowDownRight className="h-3 w-3" />
          Sale
        </Badge>
      );
    case 'PURCHASE':
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/50 font-medium">
          <ArrowUpRight className="h-3 w-3" />
          Purchase
        </Badge>
      );
    case 'ADJUSTMENT':
      return (
        <Badge className="bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
          <Wrench className="h-3 w-3" />
          Adjustment
        </Badge>
      );
  }
}

// ─── Custom Recharts Tooltips ────────────────────────────────────────────────

function SalesTooltip({
  active,
  payload,
  label,
  currencyCode,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  currencyCode?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold text-primary">
        {formatCurrency(payload[0].value, currencyCode, 'INR')}
      </p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const currency = useAppStore((s) => s.currency);
  const currentUser = useAppStore((s) => s.currentUser);
  const perms = getFieldPermissions(currentUser?.role);

  // Date range filter state
  const [dashStartDate, setDashStartDate] = useState('');
  const [dashEndDate, setDashEndDate] = useState('');
  const [datePreset, setDatePreset] = useState('today');

  // Apply a date preset
  const applyPreset = React.useCallback((preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (preset) {
      case 'today':
        setDashStartDate('');
        setDashEndDate('');
        break;
      case 'yesterday': {
        start.setDate(now.getDate() - 1);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        setDashStartDate(start.toISOString().slice(0, 10));
        setDashEndDate(end.toISOString().slice(0, 10));
        break;
      }
      case 'week':
        start.setDate(now.getDate() - 7);
        setDashStartDate(start.toISOString().slice(0, 10));
        setDashEndDate('');
        break;
      case 'thismonth':
        start.setDate(1);
        setDashStartDate(start.toISOString().slice(0, 10));
        setDashEndDate('');
        break;
      case 'lastmonth': {
        start.setMonth(now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        setDashStartDate(start.toISOString().slice(0, 10));
        setDashEndDate(end.toISOString().slice(0, 10));
        break;
      }
      case '3months':
        start.setMonth(now.getMonth() - 3);
        setDashStartDate(start.toISOString().slice(0, 10));
        setDashEndDate('');
        break;
      case 'all':
        setDashStartDate('2020-01-01');
        setDashEndDate('');
        break;
      case 'custom':
        // Don't change dates — let user pick
        break;
    }
  }, []);

  // Hoist fetch so it can be called from the refresh button and the
  // initial effect. Uses a ref-tracked AbortController so refresh-click
  // spam can't race — each new call aborts the previous one.
  const abortRef = React.useRef<AbortController | null>(null);
  const fetchDashboard = React.useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      // Build URL with date range if set
      const params = new URLSearchParams();
      if (dashStartDate) params.set('startDate', dashStartDate);
      if (dashEndDate) params.set('endDate', dashEndDate);
      const url = `/api/stock${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      const json = await res.json();
      // Ignore if a newer fetch has started
      if (controller.signal.aborted) return;
      setData(json);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [dashStartDate, dashEndDate]);

  useEffect(() => {
    void fetchDashboard();
    // Abort any in-flight fetch on unmount
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchDashboard]);

  // Auto-refresh every 60 seconds so the dashboard stays current.
  // Previously this was 15_000 ms (15s) despite the comment saying
  // "every 60 seconds" — 15s was too aggressive and burned bandwidth
  // + battery on mobile. We also pause the interval when the tab is
  // hidden to avoid wasting resources on background refreshes.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id !== null) return
      id = setInterval(() => void fetchDashboard(), 60_000)
    }
    const stop = () => {
      if (id === null) return
      clearInterval(id)
      id = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Refresh immediately on regain, then resume the interval
        void fetchDashboard()
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
    }
  }, [fetchDashboard])

  // ── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        {/* KPI Skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <KPICardSkeleton />
          <KPICardSkeleton />
          <KPICardSkeleton />
          <KPICardSkeleton />
        </div>
        {/* Chart Skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        {/* Bottom Skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card className="p-6">
            <Skeleton className="h-5 w-36 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-4 w-32 flex-1" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <Skeleton className="h-5 w-36 mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ── Error State ───────────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <Card className="p-6 border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-500" />
          <div>
            <p className="font-medium text-rose-700 dark:text-rose-300">
              Failed to load dashboard
            </p>
            <p className="text-sm text-rose-500 dark:text-rose-400">
              {error || 'No data available'}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // ── Chart Data Transformations ────────────────────────────────────────────

  const salesChartData = data.salesByDay.map((d) => ({
    date: formatChartDate(d.date),
    amount: d._sum.totalPrice,
  }));

  const categoryChartData = data.partsByCategory.map((d) => ({
    name: d.category,
    value: d._count,
  }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Dashboard header with date presets + custom range + refresh ──── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {data?.dateLabel ? `${data.dateLabel} · ` : ''}
                Updated {format(lastUpdated, 'MMM d, h:mm a')}
                <span className="ml-2 text-[10px] uppercase tracking-wide">
                  auto-refreshes 15s
                </span>
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchDashboard()}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        {/* Date preset buttons + custom range */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { key: 'today', label: 'Today' },
            { key: 'yesterday', label: 'Yesterday' },
            { key: 'week', label: 'Last 7 Days' },
            { key: 'thismonth', label: 'This Month' },
            { key: 'lastmonth', label: 'Last Month' },
            { key: '3months', label: 'Last 3 Months' },
            { key: 'all', label: 'All Time' },
            { key: 'custom', label: 'Custom' },
          ].map((p) => (
            <Button
              key={p.key}
              variant={datePreset === p.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => applyPreset(p.key)}
              className="text-xs h-7"
            >
              {p.label}
            </Button>
          ))}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-1.5 ml-1">
              <DateRangeFilter
                startDate={dashStartDate}
                endDate={dashEndDate}
                onStartDateChange={(d) => { setDashStartDate(d); }}
                onEndDateChange={(d) => { setDashEndDate(d); }}
                onClear={() => { setDashStartDate(''); setDashEndDate(''); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <motion.div variants={itemVariants}>
          <KPICard
            icon={Package}
            label="Total Parts"
            value={data.totalParts.toString()}
            subtitle="Unique parts in inventory"
            bgColor="bg-primary/10"
            iconColor="text-primary"
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <KPICard
            icon={TrendingUp}
            label="Sales"
            value={formatCurrency(data.todaySalesTotal, currency, 'INR')}
            subtitle={`${data.todaySalesCount} transaction${data.todaySalesCount !== 1 ? 's' : ''}${data.dateLabel ? ` · ${data.dateLabel}` : ' today'}`}
            bgColor="bg-primary/10"
            iconColor="text-primary"
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <KPICard
            icon={ShoppingCart}
            label="Purchases"
            value={formatCurrency(data.todayPurchasesTotal, currency, 'INR')}
            subtitle={`${data.todayPurchasesCount} purchase${data.todayPurchasesCount !== 1 ? 's' : ''}${data.dateLabel ? ` · ${data.dateLabel}` : ' today'}`}
            bgColor="bg-amber-100 dark:bg-amber-950/40"
            iconColor="text-amber-600 dark:text-amber-400"
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <KPICard
            icon={AlertTriangle}
            label="Low Stock Alerts"
            value={data.lowStockItems.toString()}
            subtitle={
              data.lowStockItems === 0
                ? 'All items well stocked'
                : `${data.lowStockItems} item${data.lowStockItems !== 1 ? 's' : ''} need restocking`
            }
            bgColor={
              data.lowStockItems > 0
                ? 'bg-rose-100 dark:bg-rose-950/40'
                : 'bg-primary/10'
            }
            iconColor={
              data.lowStockItems > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-primary'
            }
          />
        </motion.div>
      </div>

      {/* ── Inventory Valuation Strip (hidden for staff) ─────────────────────── */}
      {data.inventoryValue && perms.canSeeValuation && (
        <motion.div variants={itemVariants}>
          <Card className="p-5 bg-muted/40 border-border/80">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                  <Package className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Inventory Valuation</p>
                  <p className="text-sm font-semibold text-foreground">
                    {data.inventoryValue.totalUnits.toLocaleString()} units in stock
                  </p>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost Value</p>
                  <p className="text-base font-bold text-foreground">
                    {formatCurrency(data.inventoryValue.costValue, currency, 'INR')}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Retail Value</p>
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(data.inventoryValue.retailValue, currency, 'INR')}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Potential Profit</p>
                  <p className="text-base font-bold text-amber-700 dark:text-amber-300">
                    {formatCurrency(
                      data.inventoryValue.retailValue - data.inventoryValue.costValue,
                      currency,
                      'INR'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* ── Charts Section ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Sales Trend */}
        <motion.div variants={itemVariants}>
          <Card className="p-6">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-base font-semibold">
                Sales Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[260px] w-full">
                {salesChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260} minHeight={260}>
                    <AreaChart
                      data={salesChartData}
                      margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="salesGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#4f46e5"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="100%"
                            stopColor="#4f46e5"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-muted"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => formatCurrencyShort(v, currency)}
                      />
                      <RechartsTooltip
                        content={<SalesTooltip currencyCode={currency} />}
                        cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '4 4' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        fill="url(#salesGradient)"
                        dot={false}
                        activeDot={{ r: 4, fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    No sales data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Parts by Category */}
        <motion.div variants={itemVariants}>
          <Card className="p-6">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-base font-semibold">
                Parts by Category
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[260px] w-full">
                {categoryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260} minHeight={260}>
                    <BarChart
                      data={categoryChartData}
                      margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-muted"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <RechartsTooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                              <p className="text-muted-foreground mb-1">
                                {label}
                              </p>
                              <p className="font-semibold text-foreground">
                                {payload[0].value} part
                                {payload[0].value !== 1 ? 's' : ''}
                              </p>
                            </div>
                          );
                        }}
                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {categoryChartData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    No category data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Category Distribution Donut + Profit Summary (owner/admin only) ── */}
      {perms.canSeeValuation && data.partsByCategory && data.partsByCategory.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Category donut chart */}
          <motion.div variants={itemVariants} className="lg:col-span-2">
            <Card className="p-6">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-base font-semibold">
                  Stock Distribution by Category
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height={280} minHeight={280}>
                    <PieChart>
                      <Pie
                        data={data.partsByCategory.map((c: { category: string; _count: number }) => ({
                          name: c.category,
                          value: c._count,
                        }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        {data.partsByCategory.map((_: unknown, idx: number) => (
                          <Cell key={idx} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                              <p className="font-medium">{payload[0].name}</p>
                              <p className="text-muted-foreground">{payload[0].value} parts</p>
                            </div>
                          )
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-4 justify-center">
                  {data.partsByCategory.slice(0, 8).map((c: { category: string; _count: number }, idx: number) => (
                    <div key={c.category} className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                      />
                      <span className="text-xs text-muted-foreground">{c.category}</span>
                      <span className="text-xs font-medium tabular-nums">({c._count})</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Profit summary card */}
          <motion.div variants={itemVariants}>
            <Card className="p-6 h-full">
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-base font-semibold">
                  Profit Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 space-y-4">
                <div className="bg-muted/40 rounded-lg p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Today&apos;s Sales Revenue
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-foreground">
                    {formatCurrency(data.todaySalesTotal, currency, 'INR')}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-lg p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Today&apos;s Purchase Cost
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-rose-600">
                    {formatCurrency(data.todayPurchasesTotal, currency, 'INR')}
                  </p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-1">
                    Net Cash Flow Today
                  </p>
                  <p className={`text-2xl font-bold tabular-nums ${(data.todaySalesTotal - data.todayPurchasesTotal) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                    {formatCurrency(data.todaySalesTotal - data.todayPurchasesTotal, currency, 'INR')}
                  </p>
                </div>
                <div className="bg-muted/40 rounded-lg p-4">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Inventory Cost Value
                  </p>
                  <p className="text-lg font-bold tabular-nums">
                    {formatCurrency(data.inventoryValue?.costValue || 0, currency, 'INR')}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Retail: {formatCurrency(data.inventoryValue?.retailValue || 0, currency, 'INR')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      {/* ── Bottom Section: Recent Activity & Top Selling ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Activity — fixed height with scroll bar */}
        <motion.div variants={itemVariants}>
          <Card className="p-6">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-base font-semibold">
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[320px] w-full pr-4">
                {data.recentActivity.length > 0 ? (
                  <div className="space-y-1">
                    {data.recentActivity.map((activity, idx) => (
                      <div key={activity.id}>
                        <div className="flex items-start gap-3 py-3">
                          <ActivityBadge type={activity.type} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {activity.part.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Qty:{' '}
                              <span className="font-medium text-foreground">
                                {activity.quantity}
                              </span>
                              {' · '}
                              Stock:{' '}
                              <span className="text-rose-500 line-through">
                                {activity.previousStock}
                              </span>{' '}
                              <span className="text-primary font-medium">
                                → {activity.newStock}
                              </span>
                            </p>
                            {activity.notes && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {activity.notes}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0 pt-0.5">
                            {formatRelativeDate(activity.createdAt)}
                          </span>
                        </div>
                        {idx < data.recentActivity.length - 1 && (
                          <Separator />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Package className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">No recent activity</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Selling Parts — fixed height with scroll bar */}
        <motion.div variants={itemVariants}>
          <Card className="p-6">
            <CardHeader className="p-0 pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">
                Top Selling Parts
              </CardTitle>
              {data.topSellingParts.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {data.topSellingParts.length} part{data.topSellingParts.length !== 1 ? 's' : ''}
                </span>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {data.topSellingParts.length > 0 ? (
                <ScrollArea className="h-[320px] w-full pr-4">
                  <div className="space-y-1">
                    {data.topSellingParts.map((item, idx) => (
                      <div key={item.partId}>
                        <div className="flex items-center justify-between py-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="flex items-center justify-center h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400 flex-shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground truncate">
                                {item.part?.name || '(deleted part)'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.part?.partNumber || '—'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="text-sm font-semibold text-foreground">
                              {formatCurrency(item._sum.totalPrice, currency, 'INR')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item._sum.quantity} sold
                            </p>
                          </div>
                        </div>
                        {idx < data.topSellingParts.length - 1 && (
                          <Separator />
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <TrendingUp className="h-10 w-10 mb-2 opacity-30" />
                  <p className="text-sm">No sales data yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}