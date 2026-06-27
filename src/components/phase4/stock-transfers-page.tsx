'use client'

/**
 * Stock Transfers page — move stock between shops.
 * List + create + ship/receive/cancel lifecycle.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeftRight, Plus, Package, CheckCircle2, XCircle, Loader2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

interface StockTransfer {
  id: string
  transferNumber: string
  fromShopId: string
  toShopId: string
  partId: string
  quantity: number
  status: 'pending' | 'shipped' | 'received' | 'cancelled'
  notes: string
  createdAt: string
  fromShop: { name: string }
  toShop: { name: string }
  part: { name: string; partNumber: string }
}

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  shipped: 'bg-blue-100 text-blue-800',
  received: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export function StockTransfersPage() {
  const { toast } = useToast()
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [shops, setShops] = useState<{ id: string; name: string }[]>([])
  const [parts, setParts] = useState<{ id: string; partNumber: string; name: string; currentStock: number; shopId: string | null }[]>([])
  const [form, setForm] = useState({ fromShopId: '', toShopId: '', partId: '', quantity: 1, notes: '' })

  const fetchTransfers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stock-transfers')
      if (!res.ok) throw new Error('Failed to fetch transfers')
      const data = await res.json()
      setTransfers(data.transfers)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load transfers',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void fetchTransfers() }, [fetchTransfers])

  const openCreate = async () => {
    setForm({ fromShopId: '', toShopId: '', partId: '', quantity: 1, notes: '' })
    setDialogOpen(true)
    try {
      const [shopsRes, partsRes] = await Promise.all([
        fetch('/api/shops').then((r) => r.json()),
        fetch('/api/parts?limit=500').then((r) => r.json()),
      ])
      setShops(shopsRes.shops || [])
      setParts(partsRes.parts || [])
    } catch {
      // ignore
    }
  }

  const handleCreate = async () => {
    if (!form.fromShopId || !form.toShopId || !form.partId) {
      toast({ title: 'All fields required', variant: 'destructive' })
      return
    }
    if (form.fromShopId === form.toShopId) {
      toast({ title: 'Shops must be different', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/stock-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create transfer')
      }
      toast({ title: 'Transfer created' })
      setDialogOpen(false)
      void fetchTransfers()
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

  const handleAction = async (id: string, action: 'ship' | 'receive' | 'cancel') => {
    setSaving(true)
    try {
      const res = await fetch(`/api/stock-transfers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `Failed to ${action}`)
      }
      toast({ title: `Transfer ${action}ed` })
      void fetchTransfers()
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

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-indigo-600" />
            Stock Transfers
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Move stock between shops. Lifecycle: pending → shipped → received.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> New Transfer
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {transfers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ArrowLeftRight className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>No transfers yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left bg-gray-50">
                    <th className="py-3 px-2">Transfer #</th>
                    <th className="py-3 px-2">From → To</th>
                    <th className="py-3 px-2">Part</th>
                    <th className="py-3 px-2 text-center">Qty</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="py-3 px-2">Created</th>
                    <th className="py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2 font-mono font-semibold">{t.transferNumber}</td>
                      <td className="py-3 px-2">
                        <span>{t.fromShop?.name || '?'}</span>
                        <span className="mx-2 text-gray-400">→</span>
                        <span>{t.toShop?.name || '?'}</span>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-medium">{t.part?.name}</div>
                        <div className="text-xs text-gray-500">{t.part?.partNumber}</div>
                      </td>
                      <td className="py-3 px-2 text-center font-semibold">{t.quantity}</td>
                      <td className="py-3 px-2">
                        <Badge className={STATUS_COLORS[t.status]}>{t.status}</Badge>
                      </td>
                      <td className="py-3 px-2 text-xs text-gray-500">{formatDate(t.createdAt)}</td>
                      <td className="py-3 px-2">
                        <div className="flex gap-1">
                          {t.status === 'pending' && (
                            <Button size="sm" variant="outline" onClick={() => handleAction(t.id, 'ship')}>
                              <Package className="h-3 w-3 mr-1" /> Ship
                            </Button>
                          )}
                          {t.status === 'shipped' && (
                            <Button size="sm" onClick={() => handleAction(t.id, 'receive')}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Receive
                            </Button>
                          )}
                          {(t.status === 'pending' || t.status === 'shipped') && (
                            <Button size="sm" variant="outline" onClick={() => handleAction(t.id, 'cancel')}>
                              <XCircle className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Stock Transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>From Shop</Label>
              <Select value={form.fromShopId} onValueChange={(v) => setForm({ ...form, fromShopId: v })}>
                <SelectTrigger><SelectValue placeholder="Select source shop" /></SelectTrigger>
                <SelectContent>
                  {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To Shop</Label>
              <Select value={form.toShopId} onValueChange={(v) => setForm({ ...form, toShopId: v })}>
                <SelectTrigger><SelectValue placeholder="Select destination shop" /></SelectTrigger>
                <SelectContent>
                  {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Part</Label>
              <Select value={form.partId} onValueChange={(v) => setForm({ ...form, partId: v })}>
                <SelectTrigger><SelectValue placeholder="Select part" /></SelectTrigger>
                <SelectContent>
                  {parts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.partNumber} — {p.name} (stock: {p.currentStock})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                type="number" min={1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
