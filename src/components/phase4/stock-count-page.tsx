'use client'

/**
 * Stock Count page — physical stocktaking workflow.
 *
 * Owner:
 *   1. Clicks "Start Count" → snapshots all parts' current_stock
 *   2. Walks the shelves, enters counted quantities
 *   3. Clicks "Finalize" → variances posted as stock adjustments
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ClipboardCheck, Plus, Loader2, CheckCircle2, XCircle, ArrowLeft,
  AlertTriangle, Package,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

interface StockCountItem {
  id: string
  partId: string
  expectedQty: number
  countedQty: number | null
  variance: number
  notes: string
  countedAt: string | null
  part: { partNumber: string; name: string; category: string; brand: string; currentStock: number; location: string }
}

interface StockCountRecord {
  id: string
  countNumber: string
  status: 'draft' | 'in_progress' | 'finalized' | 'cancelled'
  startedAt: string
  finalizedAt: string | null
  notes: string
  totalItems: number
  matchedItems: number
  varianceItems: number
  items?: StockCountItem[]
}

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  finalized: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export function StockCountPage() {
  const { toast } = useToast()
  const [counts, setCounts] = useState<StockCountRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<StockCountRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [finalizeDialog, setFinalizeDialog] = useState(false)

  const fetchCounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stock-count')
      if (!res.ok) throw new Error('Failed to fetch counts')
      const data = await res.json()
      setCounts(data.counts)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load stock counts',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void fetchCounts() }, [fetchCounts])

  const openCount = async (count: StockCountRecord) => {
    try {
      const res = await fetch(`/api/stock-count/${count.id}`)
      if (!res.ok) throw new Error('Failed to fetch count details')
      const data = await res.json()
      setSelected(data)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load count details',
        variant: 'destructive',
      })
    }
  }

  const startCount = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/stock-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: '' }),
      })
      if (!res.ok) throw new Error('Failed to start count')
      toast({ title: 'Stock count started' })
      void fetchCounts()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const updateItem = async (itemId: string, countedQty: number) => {
    if (!selected) return
    // Optimistic update
    setSelected({
      ...selected,
      items: selected.items?.map((i) =>
        i.id === itemId ? { ...i, countedQty } : i
      ),
    })
    try {
      await fetch(`/api/stock-count/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_item', itemId, countedQty }),
      })
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive',
      })
    }
  }

  const finalize = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch(`/api/stock-count/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to finalize')
      }
      const result = await res.json()
      toast({
        title: 'Stock count finalized',
        description: `${result.matchedItems} matched, ${result.varianceItems} variance, ${result.adjustmentsPosted} adjustments posted.`,
      })
      setFinalizeDialog(false)
      setSelected(null)
      void fetchCounts()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  // ─── Detail view (single count) ────────────────────────────────────────
  if (selected) {
    const counted = selected.items?.filter((i) => i.countedQty !== null).length ?? 0
    const total = selected.items?.length ?? 0
    return (
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-indigo-600" />
              {selected.countNumber}
              <Badge className={STATUS_COLORS[selected.status]}>{selected.status}</Badge>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Started {formatDate(selected.startedAt)} · {counted}/{total} items counted
            </p>
          </div>
          {selected.status === 'in_progress' && (
            <Button onClick={() => setFinalizeDialog(true)} disabled={saving}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Finalize Count
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            {selected.items && selected.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left bg-gray-50">
                      <th className="py-3 px-2">Part</th>
                      <th className="py-3 px-2">Location</th>
                      <th className="py-3 px-2 text-center">Expected</th>
                      <th className="py-3 px-2 text-center">Counted</th>
                      <th className="py-3 px-2 text-center">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item) => {
                      const variance = item.countedQty !== null ? item.countedQty - item.expectedQty : null
                      return (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-2">
                            <div className="font-medium">{item.part.name}</div>
                            <div className="text-xs text-gray-500">
                              {item.part.partNumber} · {item.part.brand} · {item.part.category}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-xs">{item.part.location || '—'}</td>
                          <td className="py-3 px-2 text-center font-semibold">{item.expectedQty}</td>
                          <td className="py-3 px-2 text-center">
                            {selected.status === 'in_progress' ? (
                              <Input
                                type="number"
                                min={0}
                                value={item.countedQty ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  void updateItem(item.id, v === '' ? 0 : Number(v))
                                }}
                                className="w-20 h-8 text-center"
                                placeholder="—"
                              />
                            ) : (
                              <span className="font-semibold">{item.countedQty ?? '—'}</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {variance === null ? (
                              <span className="text-gray-400">—</span>
                            ) : variance === 0 ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">✓</Badge>
                            ) : (
                              <Badge className={variance > 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}>
                                {variance > 0 ? '+' : ''}{variance}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No items in this count.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={finalizeDialog} onOpenChange={setFinalizeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Finalize stock count?</AlertDialogTitle>
              <AlertDialogDescription>
                This will post stock adjustments for all items with a variance.
                Items without a counted quantity will be skipped.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={finalize} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Finalize
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ─── List view ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-indigo-600" />
            Stock Counts
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Physical stocktaking. Start a count, walk the shelves, finalize to post adjustments.
          </p>
        </div>
        <Button onClick={startCount} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Start Count
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {counts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>No stock counts yet.</p>
              <p className="text-xs mt-1">Click "Start Count" to begin your first physical inventory audit.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left bg-gray-50">
                    <th className="py-3 px-2">Count #</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="py-3 px-2 text-center">Total Items</th>
                    <th className="py-3 px-2 text-center">Matched</th>
                    <th className="py-3 px-2 text-center">Variance</th>
                    <th className="py-3 px-2">Started</th>
                    <th className="py-3 px-2">Finalized</th>
                  </tr>
                </thead>
                <tbody>
                  {counts.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                      onClick={() => void openCount(c)}
                    >
                      <td className="py-3 px-2 font-mono font-semibold">{c.countNumber}</td>
                      <td className="py-3 px-2">
                        <Badge className={STATUS_COLORS[c.status]}>{c.status}</Badge>
                      </td>
                      <td className="py-3 px-2 text-center">{c.totalItems}</td>
                      <td className="py-3 px-2 text-center">
                        {c.status === 'finalized' ? (
                          <span className="text-green-600 font-semibold">{c.matchedItems}</span>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {c.status === 'finalized' ? (
                          <span className={c.varianceItems > 0 ? 'text-red-600 font-semibold' : ''}>
                            {c.varianceItems}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-2 text-xs text-gray-500">{formatDate(c.startedAt)}</td>
                      <td className="py-3 px-2 text-xs text-gray-500">
                        {c.finalizedAt ? formatDate(c.finalizedAt) : '—'}
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
