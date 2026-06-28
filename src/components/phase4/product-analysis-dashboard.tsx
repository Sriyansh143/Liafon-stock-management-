'use client'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, TrendingUp, Package, Skull, RefreshCw, ShoppingCart, Clock, DollarSign, Store, Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDaysAgo } from '@/lib/utils'

interface ProductAnalysis { partId: string; partNumber: string; name: string; category: string; brand: string; shopId: string | null; shopName: string | null; currentStock: number; minStockLevel: number; isLowStock: boolean; stockValue: number; retailValue: number; salesLast30Days: number; salesLast90Days: number; salesVelocityPerDay: number; lastSaleDate: string | null; lastSaleDaysAgo: number | null; daysOfStockLeft: number | null; lastRestockDate: string | null; lastRestockDaysAgo: number | null; lastRestockQuantity: number; costPrice: number; sellingPrice: number; profitPerUnit: number; profitMarginPercent: number; totalPotentialProfit: number; daysSinceCreated: number; recommendation: string; recommendationReason: string; suggestedRestockQuantity: number; priority: number }
interface AnalysisReport { parts: ProductAnalysis[]; summary: { totalParts: number; lowStockCount: number; restockNowCount: number; restockSoonCount: number; monitorCount: number; discontinueCount: number; newProductCount: number; noActionCount: number; totalStockValue: number; totalRetailValue: number; totalPotentialProfit: number; deadStockValue: number }; filter: { ownerId: string; shopId: string | null; onlyLowStock: boolean }; perShopBreakdown?: Array<{ shopId: string; shopName: string; totalParts: number; lowStockCount: number; restockNowCount: number; totalStockValue: number }> }
const REC_COLORS: Record<string, string> = { restock_now: 'bg-red-100 text-red-800 border-red-300', restock_soon: 'bg-orange-100 text-orange-800 border-orange-300', monitor: 'bg-yellow-100 text-yellow-800 border-yellow-300', discontinue: 'bg-gray-200 text-gray-800 border-gray-400', new_product: 'bg-blue-100 text-blue-800 border-blue-300', no_action: 'bg-green-100 text-green-800 border-green-300' }
const REC_LABELS: Record<string, string> = { restock_now: 'Restock NOW', restock_soon: 'Restock Soon', monitor: 'Monitor', discontinue: 'Discontinue', new_product: 'New', no_action: 'Healthy' }

export function ProductAnalysisDashboard() {
  const { toast } = useToast()
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [shopFilter, setShopFilter] = useState('all')
  const [recFilter, setRecFilter] = useState('all')
  const fetchReport = useCallback(async () => { setLoading(true); try { const res = await fetch(`/api/parts/analysis?shopId=${shopFilter}&onlyLowStock=true`); if (!res.ok) throw new Error('Failed'); setReport(await res.json()) } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) } finally { setLoading(false) } }, [shopFilter, toast])
  useEffect(() => { void fetchReport() }, [fetchReport])
  const filteredParts = (report?.parts || []).filter((p) => recFilter === 'all' ? true : p.recommendation === recFilter)
  if (loading) return (<div className="space-y-4 p-6"><Skeleton className="h-8 w-64" /><div className="grid grid-cols-1 md:grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-96" /></div>)
  if (!report) return null
  const { summary } = report
  return (
    <div className="space-y-6 p-6">
      {/* Page header (Odoo-style eyebrow + title) */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary mb-1">Analytics</p>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Inventory Analysis & Restock Recommendations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">AI-driven analysis based on sales velocity, profit margin, time in inventory, and restock history.</p>
        </div>
        <Button variant="outline" onClick={() => void fetchReport()} className="shrink-0"><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>

      {/* KPI cards — Odoo/ERPNext-style with accent bar + tabular-nums */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Low Stock</span>
            <div className="p-1.5 bg-red-50 rounded-lg"><AlertTriangle className="h-4 w-4 text-red-600" /></div>
          </div>
          <p className="text-2xl font-bold tabular-nums tracking-tight">{summary.lowStockCount}</p>
          <p className="text-xs text-muted-foreground mt-1">items below minimum</p>
        </Card>
        <Card className="p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Restock Now</span>
            <div className="p-1.5 bg-orange-50 rounded-lg"><ShoppingCart className="h-4 w-4 text-orange-600" /></div>
          </div>
          <p className="text-2xl font-bold tabular-nums tracking-tight">{summary.restockNowCount}</p>
          <p className="text-xs text-muted-foreground mt-1">urgent priority items</p>
        </Card>
        <Card className="p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Dead Stock</span>
            <div className="p-1.5 bg-slate-100 rounded-lg"><Skull className="h-4 w-4 text-slate-600" /></div>
          </div>
          <p className="text-2xl font-bold tabular-nums tracking-tight">{summary.discontinueCount}</p>
          <p className="text-xs text-muted-foreground mt-1">no sales 90+ days</p>
        </Card>
        <Card className="p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Dead Stock Value</span>
            <div className="p-1.5 bg-indigo-50 rounded-lg"><DollarSign className="h-4 w-4 text-indigo-600" /></div>
          </div>
          <p className="text-2xl font-bold tabular-nums tracking-tight">{formatCurrency(summary.deadStockValue)}</p>
          <p className="text-xs text-muted-foreground mt-1">tied-up capital</p>
        </Card>
      </div>

      {/* Branch comparison table — sticky header + zebra + tabular-nums */}
      {report.perShopBreakdown && report.perShopBreakdown.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="p-5 border-b">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Comparison</p>
            <h3 className="text-sm font-semibold tracking-tight mt-1">Branch-wise Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Shop</th>
                  <th className="px-4 py-3 text-right font-medium tabular-nums text-muted-foreground">Parts</th>
                  <th className="px-4 py-3 text-right font-medium tabular-nums text-muted-foreground">Low Stock</th>
                  <th className="px-4 py-3 text-right font-medium tabular-nums text-muted-foreground">Restock Now</th>
                  <th className="px-4 py-3 text-right font-medium tabular-nums text-muted-foreground">Stock Value</th>
                </tr>
              </thead>
              <tbody>
                {report.perShopBreakdown.map((s, i) => (
                  <tr key={s.shopId} className={`border-b transition-colors hover:bg-primary/5 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                    <td className="px-4 py-2.5 font-medium">{s.shopName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{s.totalParts}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.lowStockCount > 0 ? <span className="text-red-600 font-semibold">{s.lowStockCount}</span> : s.lowStockCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.restockNowCount > 0 ? <span className="text-orange-600 font-semibold">{s.restockNowCount}</span> : s.restockNowCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(s.totalStockValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2"><span className="text-sm font-medium">Shop:</span><Select value={shopFilter} onValueChange={setShopFilter}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Shops (Unified)</SelectItem>{report.perShopBreakdown?.map((s) => <SelectItem key={s.shopId} value={s.shopId}>{s.shopName}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex items-center gap-2"><span className="text-sm font-medium">Recommendation:</span><Select value={recFilter} onValueChange={setRecFilter}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="restock_now">Restock Now</SelectItem><SelectItem value="restock_soon">Restock Soon</SelectItem><SelectItem value="monitor">Monitor</SelectItem><SelectItem value="discontinue">Discontinue</SelectItem><SelectItem value="new_product">New Product</SelectItem></SelectContent></Select></div>
      </div>

      {/* Parts table — sticky header + zebra + tabular-nums + hover-reveal */}
      <Card className="p-0 overflow-hidden">
        {filteredParts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium">No parts match the current filter</p>
              <p className="text-sm text-muted-foreground">Try changing the shop or recommendation filter above.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Part</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Shop</th>
                  <th className="px-4 py-3 text-right font-medium tabular-nums text-muted-foreground">Stock</th>
                  <th className="px-4 py-3 text-right font-medium tabular-nums text-muted-foreground">Velocity</th>
                  <th className="px-4 py-3 text-right font-medium tabular-nums text-muted-foreground">Days Left</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Sale</th>
                  <th className="px-4 py-3 text-right font-medium tabular-nums text-muted-foreground">Margin</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Recommendation</th>
                  <th className="px-4 py-3 text-right font-medium tabular-nums text-muted-foreground">Suggested</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map((p, i) => (
                  <tr key={p.partId} className={`group border-b transition-colors hover:bg-primary/5 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                    <td className="px-4 py-2.5"><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.partNumber} · {p.brand}</div></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.shopName || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums"><span className="font-semibold text-red-600">{p.currentStock}</span><div className="text-xs text-muted-foreground">min: {p.minStockLevel}</div></td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{p.salesVelocityPerDay.toFixed(2)}/d</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.daysOfStockLeft !== null ? <span className={p.daysOfStockLeft < 7 ? 'text-red-600 font-bold' : ''}>{p.daysOfStockLeft.toFixed(0)}</span> : '∞'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDaysAgo(p.lastSaleDaysAgo)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums"><span className={p.profitMarginPercent < 10 ? 'text-red-600 font-semibold' : ''}>{p.profitMarginPercent.toFixed(1)}%</span></td>
                    <td className="px-4 py-2.5 text-center"><Badge className={`${REC_COLORS[p.recommendation] || ''} border text-xs`}>{REC_LABELS[p.recommendation] || p.recommendation}</Badge>{p.priority === 1 && <div className="text-xs text-red-600 font-bold mt-1">URGENT</div>}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.suggestedRestockQuantity > 0 ? <span className="font-bold text-indigo-600">{p.suggestedRestockQuantity}</span> : '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs">{p.recommendationReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
