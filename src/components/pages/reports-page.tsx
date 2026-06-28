'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
  AlertTriangle,
  MessageSquare,
  Phone,
  Send,
  BarChart3,
  Activity,
  Warehouse,
  Loader2,
  Download,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useToast } from '@/hooks/use-toast';
import {
  openWhatsApp,
  formatLowStockMessage,
  formatDailyReport,
  type Department,
} from '@/lib/whatsapp';
import { useAppStore } from '@/store/app-store'
import { formatCurrency, formatCurrencyShort } from '@/lib/currency'
import { buildCSV, downloadCSV } from '@/lib/print'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DailyDataPoint {
  date: string;
  sales: number;
  purchases: number;
  itemsSold: number;
  itemsPurchased: number;
  net?: number;
}

interface DailyReport {
  type: 'daily';
  data: DailyDataPoint[];
  summary?: {
    totalSales: number;
    totalPurchases: number;
    totalItemsSold: number;
    totalItemsPurchased: number;
    totalNet: number;
  };
  days?: number;
}

interface CategoryDataPoint {
  category: string;
  partsCount: number;
  stockUnits: number;
  costValue: number;
  retailValue: number;
  potentialProfit: number;
  salesRevenue: number;
  salesQty: number;
}

interface CategoryReport {
  type: 'category';
  data: CategoryDataPoint[];
  summary?: {
    totalParts: number;
    totalStockUnits: number;
    totalCostValue: number;
    totalRetailValue: number;
    totalSalesRevenue: number;
    totalPotentialProfit: number;
  };
  days?: number;
}

interface SparePartBasic {
  id: string;
  name: string;
  partNumber: string;
  currentStock: number;
  minStockLevel: number;
  costPrice: number;
  sellingPrice: number;
  category: string;
}

interface StockDashboard {
  totalParts: number;
  lowStockParts: number;
  lowStockItems: number;
  todaySalesCount: number;
  todayPurchasesCount: number;
  todaySalesTotal: number;
  todayPurchasesTotal: number;
  inventoryValue?: {
    totalUnits: number;
    costValue: number;
    retailValue: number;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BAR_COLORS = [
  '#10b981', // emerald
  '#f59e0b', // amber
  '#14b8a6', // teal
  '#f97316', // orange
  '#f43f5e', // rose
  '#64748b', // slate
  '#06b6d4', // cyan
  '#ec4899', // pink
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' as const },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatChartDate(dateStr: string): string {
  return format(new Date(dateStr), 'MMM d');
}

function getStockSeverity(stock: number, minStock: number): 'critical' | 'warning' | 'ok' {
  if (stock <= 0) return 'critical';
  if (stock <= Math.ceil(minStock / 2)) return 'critical';
  if (stock <= minStock) return 'warning';
  return 'ok';
}

// ─── Custom Recharts Tooltip ─────────────────────────────────────────────────

function DailyChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  const currency = useAppStore((s) => s.currency)
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2.5 text-sm shadow-md">
      <p className="text-muted-foreground mb-1.5 font-medium">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
            </span>
            <span className="font-semibold">{formatCurrency(entry.value, currency, 'INR')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
}) {
  const currency = useAppStore((s) => s.currency)
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2.5 text-sm shadow-md">
      <p className="text-muted-foreground mb-1 font-medium">{label}</p>
      <p className="font-semibold text-foreground">
        Sales: {formatCurrency(payload[0].value, currency, 'INR')}
      </p>
    </div>
  );
}

// ─── Skeleton Sub-Components ─────────────────────────────────────────────────

function SummaryCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card className="p-6">
      <Skeleton className="h-5 w-36 mb-6" />
      <Skeleton className="h-[300px] w-full rounded-lg" />
    </Card>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="p-6">
      <Skeleton className="h-5 w-36 mb-6" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </Card>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  subtitle,
  bgColor,
  iconColor,
  trend,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtitle: string;
  bgColor: string;
  iconColor: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card className="p-5 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5 flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
            {trend === 'down' && <TrendingDown className="h-3 w-3 text-rose-500" />}
            {subtitle}
          </div>
        </div>
        <div className={`flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full ${bgColor}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
    </Card>
  );
}

// ─── WhatsApp Share Dropdown ─────────────────────────────────────────────────

function WhatsAppShareDropdown({
  departments,
  onShare,
  label,
  variant = 'outline',
  size = 'sm',
}: {
  departments: Department[];
  onShare: (department: Department) => void;
  label: string;
  variant?: 'outline' | 'default';
  size?: 'sm' | 'default';
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className="gap-2">
          <MessageSquare className="h-4 w-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Share via WhatsApp to...
        </div>
        <DropdownMenuSeparator />
        {departments.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No departments configured
          </div>
        )}
        {departments.map((dept) => (
          <DropdownMenuItem
            key={dept.id}
            onClick={() => onShare(dept)}
            className="cursor-pointer"
          >
            <Phone className="h-3.5 w-3.5 mr-2 text-emerald-500 flex-shrink-0" />
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="truncate">{dept.name}</span>
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
              >
                {dept.role}
              </Badge>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Low Stock Item Row ───────────────────────────────────────────────────────

function LowStockItemRow({ item }: { item: SparePartBasic }) {
  const severity = getStockSeverity(item.currentStock, item.minStockLevel);

  const severityBadge =
    severity === 'critical' ? (
      <Badge className="bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800 text-xs">
        Critical
      </Badge>
    ) : (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 text-xs">
        Low
      </Badge>
    );

  return (
    <TableRow className={severity === 'critical' ? 'bg-rose-50/50 dark:bg-rose-950/10' : ''}>
      <TableCell className="font-medium">{item.name}</TableCell>
      <TableCell className="text-muted-foreground">{item.partNumber}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${severity === 'critical' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {item.currentStock}
          </span>
          <span className="text-muted-foreground">/ {item.minStockLevel}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{item.category}</TableCell>
      <TableCell>{severityBadge}</TableCell>
    </TableRow>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { toast } = useToast();
  const currency = useAppStore((s) => s.currency)

  // Tab state
  const [activeTab, setActiveTab] = useState('daily');
  const [dailyDays, setDailyDays] = useState(30);
  const [categoryDays, setCategoryDays] = useState(30);

  // Data state
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [categoryReport, setCategoryReport] = useState<CategoryReport | null>(null);
  const [stockData, setStockData] = useState<StockDashboard | null>(null);
  const [lowStockParts, setLowStockParts] = useState<SparePartBasic[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Loading state
  const [loadingDaily, setLoadingDaily] = useState(true);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingLowStock, setLoadingLowStock] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(true);

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const fetchDepartments = useCallback(async () => {
    try {
      setLoadingDepartments(true);
      const res = await fetch('/api/departments');
      if (!res.ok) throw new Error('Failed to fetch departments');
      const data = await res.json();
      setDepartments(data);
    } catch {
      // silently fail - departments are optional for reports
    } finally {
      setLoadingDepartments(false);
    }
  }, []);

  const fetchDailyReport = useCallback(async () => {
    try {
      setLoadingDaily(true);
      const res = await fetch(`/api/reports?type=daily&days=${dailyDays}`);
      if (!res.ok) throw new Error('Failed to fetch daily report');
      const data = await res.json();
      setDailyReport(data);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load daily report data',
        variant: 'destructive',
      });
    } finally {
      setLoadingDaily(false);
    }
  }, [dailyDays, toast]);

  const fetchCategoryReport = useCallback(async () => {
    try {
      setLoadingCategory(true);
      const res = await fetch(`/api/reports?type=category&days=${categoryDays}`);
      if (!res.ok) throw new Error('Failed to fetch category report');
      const data = await res.json();
      setCategoryReport(data);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load category report data',
        variant: 'destructive',
      });
    } finally {
      setLoadingCategory(false);
    }
  }, [toast, categoryDays]);

  const fetchStockReport = useCallback(async () => {
    try {
      setLoadingStock(true);
      setLoadingLowStock(true);
      const [stockRes, partsRes] = await Promise.all([
        fetch('/api/stock'),
        fetch('/api/parts?lowStock=true&limit=50'),
      ]);
      if (!stockRes.ok) throw new Error('Failed to fetch stock data');
      if (!partsRes.ok) throw new Error('Failed to fetch low stock parts');
      const stockJson = await stockRes.json();
      const partsJson = await partsRes.json();
      setStockData(stockJson);
      setLowStockParts(partsJson.parts || []);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load stock report data',
        variant: 'destructive',
      });
    } finally {
      setLoadingStock(false);
      setLoadingLowStock(false);
    }
  }, [toast]);

  // Load departments and daily report on mount
  useEffect(() => {
    fetchDepartments();
    fetchDailyReport();
  }, [fetchDepartments, fetchDailyReport]);

  // Lazy-load category and stock data when tab changes
  useEffect(() => {
    if (activeTab === 'category' && !categoryReport && !loadingCategory) {
      fetchCategoryReport();
    }
    if (activeTab === 'stock' && !stockData && !loadingStock) {
      fetchStockReport();
    }
  }, [activeTab, categoryReport, stockData, loadingCategory, loadingStock, fetchCategoryReport, fetchStockReport]);

  // Refetch category report when duration changes
  useEffect(() => {
    if (activeTab === 'category') {
      setCategoryReport(null);
      fetchCategoryReport();
    }
  }, [categoryDays, activeTab, fetchCategoryReport]);

  // ── WhatsApp Handlers ──────────────────────────────────────────────────────

  const handleShareDailyReport = useCallback(
    (dept: Department) => {
      if (!dailyReport || !stockData) return;

      const totalSales = dailyReport.data.reduce((sum, d) => sum + d.sales, 0);
      const totalPurchases = dailyReport.data.reduce((sum, d) => sum + d.purchases, 0);
      const salesCount = dailyReport.data.reduce((sum, d) => sum + d.itemsSold, 0);
      const purchasesCount = dailyReport.data.reduce(
        (sum, d) => sum + d.itemsPurchased,
        0
      );

      const message = formatDailyReport({
        date: format(new Date(), 'MMM d, yyyy'),
        totalSales,
        totalPurchases,
        salesCount,
        purchasesCount,
        lowStockCount: stockData.lowStockItems || stockData.lowStockParts || 0,
        totalParts: stockData.totalParts,
      });

      openWhatsApp(dept.phone, message);
      toast({ title: 'WhatsApp opened', description: `Daily report prepared for ${dept.name}.` });
    },
    [dailyReport, stockData, toast]
  );

  const handleShareCategoryReport = useCallback(
    (dept: Department) => {
      if (!categoryReport) return;

      const lines = categoryReport.data.map(
        (c) =>
          `📦 *${c.category}*\n   Parts: ${c.partsCount} | Stock: ${c.stockUnits}\n   Cost: ${formatCurrency(c.costValue, currency, 'INR')} | Sales: ${formatCurrency(c.salesRevenue, currency, 'INR')}`
      );

      const message = `📊 *CATEGORY REPORT*
━━━━━━━━━━━━━━━
📅 Date: ${format(new Date(), 'MMM d, yyyy')}
━━━━━━━━━━━━━━━

${lines.join('\n\n')}

━━━━━━━━━━━━━━━
_Liafon Stock Management_`;

      openWhatsApp(dept.phone, message);
      toast({ title: 'WhatsApp opened', description: `Category report prepared for ${dept.name}.` });
    },
    [categoryReport, toast]
  );

  const handleSendLowStockAlert = useCallback(
    (dept: Department) => {
      if (lowStockParts.length === 0) {
        toast({
          title: 'No low stock items',
          description: 'All items are well stocked!',
        });
        return;
      }

      const items = lowStockParts.slice(0, 20).map((p) => ({
        name: p.name,
        partNumber: p.partNumber,
        currentStock: p.currentStock,
        minStockLevel: p.minStockLevel,
      }));

      const message = formatLowStockMessage(items);
      openWhatsApp(dept.phone, message);
      toast({
        title: 'WhatsApp opened',
        description: `Low stock alert prepared for ${dept.name}.`,
      });
    },
    [lowStockParts, toast]
  );

  // ── Computed Values ────────────────────────────────────────────────────────

  const dailyChartData = dailyReport?.data.map((d) => ({
    date: formatChartDate(d.date),
    Sales: d.sales,
    Purchases: d.purchases,
  })) ?? [];

  const totalSales = dailyReport?.data.reduce((sum, d) => sum + d.sales, 0) ?? 0;
  const totalPurchases = dailyReport?.data.reduce((sum, d) => sum + d.purchases, 0) ?? 0;
  const netProfit = totalSales - totalPurchases;

  const categoryChartData = categoryReport?.data.map((d) => ({
    category: d.category,
    sales: d.salesRevenue,
  })) ?? [];

  const totalInventoryValue =
    categoryReport?.summary?.totalCostValue ?? categoryReport?.data.reduce((sum, d) => sum + d.costValue, 0) ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            Reports
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analytics and insights for your auto parts business
          </p>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="daily" className="gap-2">
              <BarChart3 className="h-4 w-4 hidden sm:block" />
              Daily
            </TabsTrigger>
            <TabsTrigger value="category" className="gap-2">
              <Activity className="h-4 w-4 hidden sm:block" />
              Category
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-2">
              <Warehouse className="h-4 w-4 hidden sm:block" />
              Stock
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* DAILY REPORT TAB                                                     */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="daily" className="space-y-6 mt-6">
            {/* Toolbar: date-range selector + CSV export */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Date range:</span>
                <Select value={String(dailyDays)} onValueChange={(v) => setDailyDays(parseInt(v, 10))}>
                  <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Date range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7" className="text-xs">Last 7 days</SelectItem>
                    <SelectItem value="14" className="text-xs">Last 14 days</SelectItem>
                    <SelectItem value="30" className="text-xs">Last 30 days</SelectItem>
                    <SelectItem value="60" className="text-xs">Last 60 days</SelectItem>
                    <SelectItem value="90" className="text-xs">Last 90 days</SelectItem>
                    <SelectItem value="180" className="text-xs">Last 6 months</SelectItem>
                    <SelectItem value="365" className="text-xs">Last 1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs h-8"
                disabled={!dailyReport?.data?.length}
                onClick={() => {
                  if (!dailyReport?.data?.length) return;
                  const rows = dailyReport.data.map((d) => ({
                    Date: d.date,
                    Sales: d.sales,
                    Purchases: d.purchases,
                    Net: d.net ?? (d.sales - d.purchases),
                    ItemsSold: d.itemsSold,
                    ItemsPurchased: d.itemsPurchased,
                  }));
                  const csv = buildCSV(rows);
                  downloadCSV(`daily_report_${dailyDays}d_${new Date().toISOString().slice(0, 10)}.csv`, csv);
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>

            {/* Summary Cards */}
            {loadingDaily ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCardSkeleton />
                <SummaryCardSkeleton />
                <SummaryCardSkeleton />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <motion.div variants={itemVariants}>
                  <SummaryCard
                    icon={TrendingUp}
                    label="Total Sales"
                    value={formatCurrency(totalSales, currency, 'INR')}
                    subtitle={`Over ${dailyChartData.length} days`}
                    bgColor="bg-emerald-100 dark:bg-emerald-950/60"
                    iconColor="text-emerald-600 dark:text-emerald-400"
                    trend="up"
                  />
                </motion.div>
                <motion.div variants={itemVariants}>
                  <SummaryCard
                    icon={ShoppingCart}
                    label="Total Purchases"
                    value={formatCurrency(totalPurchases, currency, 'INR')}
                    subtitle={`Over ${dailyChartData.length} days`}
                    bgColor="bg-amber-100 dark:bg-amber-950/60"
                    iconColor="text-amber-600 dark:text-amber-400"
                  />
                </motion.div>
                <motion.div variants={itemVariants}>
                  <SummaryCard
                    icon={DollarSign}
                    label="Net Profit"
                    value={formatCurrency(netProfit, currency, 'INR')}
                    subtitle="Sales minus purchases"
                    bgColor={
                      netProfit >= 0
                        ? 'bg-emerald-100 dark:bg-emerald-950/60'
                        : 'bg-rose-100 dark:bg-rose-950/60'
                    }
                    iconColor={
                      netProfit >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }
                    trend={netProfit >= 0 ? 'up' : 'down'}
                  />
                </motion.div>
              </div>
            )}

            {/* Daily Chart */}
            {loadingDaily ? (
              <ChartSkeleton />
            ) : (
              <motion.div variants={itemVariants}>
                <Card className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                    <CardTitle className="text-base font-semibold p-0">
                      Sales vs Purchases (Last 30 Days)
                    </CardTitle>
                    <WhatsAppShareDropdown
                      departments={departments}
                      onShare={handleShareDailyReport}
                      label="Share Report"
                    />
                  </div>
                  <div className="h-[300px] w-full">
                    {dailyChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300} minHeight={300}>
                        <LineChart
                          data={dailyChartData}
                          margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                        >
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
                          <RechartsTooltip content={<DailyChartTooltip />} />
                          <Legend
                            verticalAlign="top"
                            height={36}
                            iconType="circle"
                            iconSize={8}
                            wrapperStyle={{ fontSize: '12px' }}
                          />
                          <Line
                            type="monotone"
                            dataKey="Sales"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="Purchases"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
                        <p className="text-sm">No daily data available for the last 30 days</p>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            )}
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* CATEGORY REPORT TAB                                                   */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="category" className="space-y-6 mt-6">
            {/* Category Bar Chart */}
            {loadingCategory ? (
              <ChartSkeleton />
            ) : (
              <motion.div variants={itemVariants}>
                <Card className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                    <CardTitle className="text-base font-semibold p-0">
                      Sales by Category
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Select value={String(categoryDays)} onValueChange={(v) => setCategoryDays(parseInt(v, 10))}>
                        <SelectTrigger className="h-8 w-[110px] text-xs" aria-label="Category date range">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7" className="text-xs">Last 7 days</SelectItem>
                          <SelectItem value="14" className="text-xs">Last 14 days</SelectItem>
                          <SelectItem value="30" className="text-xs">Last 30 days</SelectItem>
                          <SelectItem value="60" className="text-xs">Last 60 days</SelectItem>
                          <SelectItem value="90" className="text-xs">Last 90 days</SelectItem>
                          <SelectItem value="180" className="text-xs">Last 6 months</SelectItem>
                          <SelectItem value="365" className="text-xs">Last 1 year</SelectItem>
                        </SelectContent>
                      </Select>
                      <WhatsAppShareDropdown
                        departments={departments}
                        onShare={handleShareCategoryReport}
                        label="Share Report"
                      />
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    {categoryChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300} minHeight={300}>
                        <BarChart
                          data={categoryChartData}
                          margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            className="stroke-muted"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="category"
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            tickLine={false}
                            axisLine={false}
                            interval={0}
                            angle={-25}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v: number) => formatCurrencyShort(v, currency)}
                          />
                          <RechartsTooltip
                            content={<CategoryChartTooltip />}
                            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                          />
                          <Bar dataKey="sales" radius={[4, 4, 0, 0]} maxBarSize={56}>
                            {categoryChartData.map((_, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={BAR_COLORS[index % BAR_COLORS.length]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <Activity className="h-10 w-10 mb-2 opacity-30" />
                        <p className="text-sm">No category data available</p>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            )}

            {/* Category Table */}
            {loadingCategory ? (
              <TableSkeleton rows={6} />
            ) : categoryReport && categoryReport.data.length > 0 ? (
              <motion.div variants={itemVariants}>
                <Card className="p-6">
                  <CardTitle className="text-base font-semibold mb-4">
                    Category Breakdown
                  </CardTitle>
                  <ScrollArea className="max-h-96">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Parts</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Cost Value</TableHead>
                          <TableHead className="text-right">Sales Value</TableHead>
                          <TableHead className="text-right">Profit Margin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryReport.data.map((cat) => {
                          const profitMargin =
                            cat.costValue > 0
                              ? ((cat.salesRevenue - cat.costValue) / cat.costValue) * 100
                              : 0;
                          return (
                            <TableRow key={cat.category}>
                              <TableCell className="font-medium">{cat.category}</TableCell>
                              <TableCell className="text-right">{cat.partsCount}</TableCell>
                              <TableCell className="text-right">{cat.stockUnits}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(cat.costValue, currency, 'INR')}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(cat.salesRevenue, currency, 'INR')}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  className={`text-xs ${
                                    profitMargin >= 0
                                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                                      : 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                                  }`}
                                >
                                  {profitMargin.toFixed(1)}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </Card>
              </motion.div>
            ) : null}
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* STOCK REPORT TAB                                                      */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="stock" className="space-y-6 mt-6">
            {/* Summary Cards */}
            {loadingStock ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <SummaryCardSkeleton />
                <SummaryCardSkeleton />
                <SummaryCardSkeleton />
              </div>
            ) : stockData ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <motion.div variants={itemVariants}>
                  <SummaryCard
                    icon={Package}
                    label="Total Parts"
                    value={stockData.totalParts.toString()}
                    subtitle="Active inventory items"
                    bgColor="bg-emerald-100 dark:bg-emerald-950/60"
                    iconColor="text-emerald-600 dark:text-emerald-400"
                  />
                </motion.div>
                <motion.div variants={itemVariants}>
                  <SummaryCard
                    icon={AlertTriangle}
                    label="Low Stock Items"
                    value={(stockData.lowStockItems || stockData.lowStockParts).toString()}
                    subtitle={
                      (stockData.lowStockItems || stockData.lowStockParts) > 0
                        ? 'Need restocking'
                        : 'All items well stocked'
                    }
                    bgColor={
                      (stockData.lowStockItems || stockData.lowStockParts) > 0
                        ? 'bg-rose-100 dark:bg-rose-950/60'
                        : 'bg-emerald-100 dark:bg-emerald-950/60'
                    }
                    iconColor={
                      (stockData.lowStockItems || stockData.lowStockParts) > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }
                  />
                </motion.div>
                <motion.div variants={itemVariants}>
                  <SummaryCard
                    icon={DollarSign}
                    label="Inventory Value"
                    value={formatCurrency(totalInventoryValue, currency, 'INR')}
                    subtitle="Total cost value"
                    bgColor="bg-amber-100 dark:bg-amber-950/60"
                    iconColor="text-amber-600 dark:text-amber-400"
                  />
                </motion.div>
              </div>
            ) : null}

            {/* Low Stock Alert Action */}
            {!loadingStock && !loadingLowStock && lowStockParts.length > 0 && (
              <motion.div variants={itemVariants}>
                <Card className="p-5 border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/10">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-950/60">
                        <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                          Low Stock Alert
                        </p>
                        <p className="text-xs text-rose-600 dark:text-rose-400">
                          {lowStockParts.length} items are running low on stock
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="destructive" size="sm" className="gap-2 self-start sm:self-auto">
                          <Send className="h-4 w-4" />
                          Send Alert
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          Alert via WhatsApp to...
                        </div>
                        <DropdownMenuSeparator />
                        {departments
                          .filter(
                            (d) =>
                              d.role === 'purchasing' ||
                              d.role === 'management' ||
                              d.role === 'general'
                          )
                          .map((dept) => (
                            <DropdownMenuItem
                              key={dept.id}
                              onClick={() => handleSendLowStockAlert(dept)}
                              className="cursor-pointer"
                            >
                              <Phone className="h-3.5 w-3.5 mr-2 text-emerald-500" />
                              <span className="truncate">{dept.name}</span>
                            </DropdownMenuItem>
                          ))}
                        {departments.length === 0 && (
                          <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                            No departments configured
                          </div>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* Low Stock Table */}
            {loadingStock || loadingLowStock ? (
              <TableSkeleton rows={8} />
            ) : lowStockParts.length > 0 ? (
              <motion.div variants={itemVariants}>
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <CardTitle className="text-base font-semibold">
                      Low Stock Items
                    </CardTitle>
                    <Badge
                      variant="secondary"
                      className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    >
                      {lowStockParts.length} items
                    </Badge>
                  </div>
                  <ScrollArea className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Part Name</TableHead>
                          <TableHead className="hidden sm:table-cell">Part #</TableHead>
                          <TableHead>Stock</TableHead>
                          <TableHead className="hidden md:table-cell">Category</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lowStockParts.map((item) => (
                          <LowStockItemRow key={item.id} item={item} />
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </Card>
              </motion.div>
            ) : !loadingStock && !loadingLowStock && lowStockParts.length === 0 ? (
              <motion.div variants={itemVariants}>
                <Card className="p-12">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Package className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-base font-medium">All Stock Levels OK</p>
                    <p className="text-sm mt-1">
                      No items are below their minimum stock levels
                    </p>
                  </div>
                </Card>
              </motion.div>
            ) : null}
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}
