'use client'

/**
 * Product Analysis Dashboard
 *
 * The user's specific ask:
 *   "product analysis to be made before showing alert that stock is low
 *    based on how long it has been in inventory how much profit is it
 *    profitable to buy again and also show to user if this stock need to
 *    be restocked after showing analysis to him for each low inventory
 *    product analysis has to be made location wise and branch wise and
 *    also unified all branches and comparison shown to user"
 *
 * This component:
 *   1. Fetches /api/parts/analysis?shopId=all&onlyLowStock=true
 *   2. Shows summary cards (low stock count, dead stock value, restock-now count)
 *   3. Shows per-shop comparison breakdown (location-wise / branch-wise)
 *   4. Shows a filterable table of low-stock parts with:
 *      - Sales velocity (units/day)
 *      - Days of stock left
 *      - Last sale / restock date
 *      - Profit margin
 *      - Recommendation badge (restock_now / monitor / discontinue)
 *      - Suggested restock quantity
 *      - Reason text
 *
 * Usage:
 *   <ProductAnalysisDashboard />
 */

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, TrendingUp, Package, Skull, RefreshCw,
  ShoppingCart, Clock, DollarSign, Store, Activity,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDaysAgo } from '@/lib/utils'

interface ProductAnalysis {
  partId: string
  partNumber: string
  name: string
  category: string
  brand: string
  shopId: string | null
  shopName: string | null
  currentStock: number
  minStockLevel: number
  isLowStock: boolean
  stockValue: number
  retailValue: number
  salesLast30Days: number
  salesLast90Days: number
  salesVelocityPerDay: number
  lastSaleDate: string | null
  lastSaleDaysAgo: number | null
  daysOfStockLeft: number | null
  lastRestockDate: string | null
  lastRestockDaysAgo: number | null
  lastRestockQuantity: number
  costPrice: number
  sellingPrice: number
  profitPerUnit: number
  profitMarginPercent: number
  totalPotentialProfit: number
  daysSinceCreated: number
  recommendation: 'restock_now' | 'restock_soon' | 'monitor' | 'discontinue' | 'new_product' | 'no_action'
  recommendationReason: string
  suggestedRestockQuantity: number
  priority: 1 | 2 | 3 | 4 | 5
}

interface AnalysisReport {
  parts: ProductAnalysis[]
  summary: {
    totalParts: number
    lowStockCount: number
    restockNowCount: number
    restockSoonCount: number
    monitorCount: number
    discontinueCount: number
    newProductCount: number
    noActionCount: number
    totalStockValue: number
    totalRetailValue: number
    totalPotentialProfit: number
    deadStockValue: number
  }
  filter: { ownerId: string; shopId: string | null; onlyLowStock: boolean }
  perShopBreakdown?: Array<{
    shopId: string
    shopName: string
    totalParts: number
    lowStockCount: number
    restockNowCount: number
    totalStockValue: number
  }>
}

const REC_COLORS: Record<ProductAnalysis['recommendation'], string> = {
  restock_now: 'bg-red-100 text-red-800 border-red-300',
  restock_soon: 'bg-orange-100 text-orange-800 border-orange-300',
  monitor: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  discontinue: 'bg-gray-200 text-gray-800 border-gray-400',
  new_product: 'bg-blue-100 text-blue-800 border-blue-300',
  no_action: 'bg-green-100 text-green-800 border-green-300',
}

const REC_LABELS: Record<ProductAnalysis['recommendation'], string> = {
  restock_now: 'Restock NOW',
  restock_soon: 'Restock Soon',
  monitor: 'Monitor',
  discontinue: 'Discontinue',
  new_product: 'New Product',
  no_action: 'Healthy',
}

export function ProductAnalysisDashboard() {
  const { toast } = useToast()
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [shopFilter, setShopFilter] = useState<string>('all')
  const [recFilter, setRecFilter] = useState<string>('all')

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/parts/analysis?shopId=${shopFilter}&onlyLowStock=true`)
      if (!res.ok) throw new Error('Failed to fetch analysis')
      const data: AnalysisReport = await res.json()
      setReport(data)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load analysis',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [shopFilter, toast])

  useEffect(() => {
    void fetchReport()
  }, [fetchReport])

  const filteredParts = (report?.parts || []).filter((p) =>
    recFilter === 'all' ? true : p.recommendation === recFilter
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (!report) return null

  const { summary } = report

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-indigo-600" />
            Inventory Analysis & Restock Recommendations
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            AI-driven analysis based on sales velocity, profit margin, time in inventory,
            and restock history.
          </p>
        </div>
        <Button variant="outline" onClick={() => void fetchReport()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Low Stock Parts</p>
                <p className="text-2xl font-bold">{summary.lowStockCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Need Restock Now</p>
                <p className="text-2xl font-bold">{summary.restockNowCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Skull className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Dead Stock (Discontinue)</p>
                <p className="text-2xl font-bold">{summary.discontinueCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Dead Stock Value</p>
                <p className="text-2xl font-bold">{formatCurrency(summary.deadStockValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-shop breakdown (location-wise / branch-wise comparison) */}
      {report.perShopBreakdown && report.perShopBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Store className="h-5 w-5 text-indigo-600" />
              Branch-wise Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4">Shop</th>
                    <th className="py-2 pr-4 text-right">Total Parts</th>
                    <th className="py-2 pr-4 text-right">Low Stock</th>
                    <th className="py-2 pr-4 text-right">Restock Now</th>
                    <th className="py-2 pr-4 text-right">Stock Value</th>
                  </tr>
                </thead>
                <tbody>
                  {report.perShopBreakdown.map((shop) => (
                    <tr key={shop.shopId} className="border-b hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium">{shop.shopName}</td>
                      <td className="py-2 pr-4 text-right">{shop.totalParts}</td>
                      <td className="py-2 pr-4 text-right">
                        <span className={shop.lowStockCount > 0 ? 'text-red-600 font-semibold' : ''}>
                          {shop.lowStockCount}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <span className={shop.restockNowCount > 0 ? 'text-orange-600 font-semibold' : ''}>
                          {shop.restockNowCount}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right">{formatCurrency(shop.totalStockValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Shop:</span>
          <Select value={shopFilter} onValueChange={setShopFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shops (Unified)</SelectItem>
              {report.perShopBreakdown?.map((s) => (
                <SelectItem key={s.shopId} value={s.shopId}>{s.shopName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Recommendation:</span>
          <Select value={recFilter} onValueChange={setRecFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="restock_now">Restock Now</SelectItem>
              <SelectItem value="restock_soon">Restock Soon</SelectItem>
              <SelectItem value="monitor">Monitor</SelectItem>
              <SelectItem value="discontinue">Discontinue</SelectItem>
              <SelectItem value="new_product">New Product</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Parts table */}
      <Card>
        <CardContent className="pt-6">
          {filteredParts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>No parts match the current filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left bg-gray-50">
                    <th className="py-3 px-2">Part</th>
                    <th className="py-3 px-2">Shop</th>
                    <th className="py-3 px-2 text-center">Stock</th>
                    <th className="py-3 px-2 text-center">Velocity</th>
                    <th className="py-3 px-2 text-center">Days Left</th>
                    <th className="py-3 px-2 text-center">Last Sale</th>
                    <th className="py-3 px-2 text-center">Margin</th>
                    <th className="py-3 px-2 text-center">Recommendation</th>
                    <th className="py-3 px-2 text-center">Suggested Qty</th>
                    <th className="py-3 px-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.map((p) => (
                    <tr key={p.partId} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-gray-500">
                          {p.partNumber} · {p.brand} · {p.category}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-xs">{p.shopName || '—'}</td>
                      <td className="py-3 px-2 text-center">
                        <div className="font-semibold text-red-600">{p.currentStock}</div>
                        <div className="text-xs text-gray-500">min: {p.minStockLevel}</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <TrendingUp className="h-3 w-3 text-gray-400" />
                          {p.salesVelocityPerDay.toFixed(2)}/d
                        </div>
                        <div className="text-xs text-gray-500">30d: {p.salesLast30Days}</div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        {p.daysOfStockLeft !== null ? (
                          <span className={p.daysOfStockLeft < 7 ? 'text-red-600 font-bold' : ''}>
                            {p.daysOfStockLeft.toFixed(0)}
                          </span>
                        ) : '∞'}
                      </td>
                      <td className="py-3 px-2 text-center text-xs">
                        <div className="flex items-center justify-center gap-1">
                          <Clock className="h-3 w-3 text-gray-400" />
                          {formatDaysAgo(p.lastSaleDaysAgo)}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={p.profitMarginPercent < 10 ? 'text-red-600 font-semibold' : ''}>
                          {p.profitMarginPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <Badge className={`${REC_COLORS[p.recommendation]} border text-xs`}>
                          {REC_LABELS[p.recommendation]}
                        </Badge>
                        {p.priority === 1 && (
                          <div className="text-xs text-red-600 font-bold mt-1">URGENT</div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {p.suggestedRestockQuantity > 0 ? (
                          <span className="font-bold text-indigo-600">{p.suggestedRestockQuantity}</span>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-2 text-xs text-gray-700 max-w-xs">
                        {p.recommendationReason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
