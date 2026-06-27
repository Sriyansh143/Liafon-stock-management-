'use client'

/**
 * Purchase Orders page — list + create + approve/receive/cancel workflow.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ClipboardList, Plus, CheckCircle2, Package, XCircle, Loader2, Trash2,
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
import { formatCurrency, formatDate } from '@/lib/utils'

interface PurchaseOrder {
  id: string
  poNumber: string
  status: 'draft' | 'approved' | 'received' | 'cancelled'
  totalAmount: number
  currency: string
  notes: string
  createdAt: string
  approvedAt: string | null
  receivedAt: string | null
  supplier: { name: string; phone: string } | null
  shop: { name: string } | null
  lineItems: string  // JSON
}

interface Part {
  id: string
  partNumber: string
  name: string
  costPrice: number
}

interface Shop {
  id: string
  name: string
}

interface Supplier {
  id: string
  name: string
}

interface LineItem {
  partId: string
  partNumber?: string
  name?: string
  quantity: number
  unitCost: number
  totalCost: number
  batchNumber?: string
  expiryDate?: string
}

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-800',
  approved: 'bg-blue-100 text-blue-800',
  received: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export function PurchaseOrdersPage() {
  const { toast } = useToast()
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [parts, setParts] = useState<Part[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [formShopId, setFormShopId] = useState('')
  const [formSupplierId, setFormSupplierId] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([])

  const fetchPOs = useCallback(async () => {
    setLoading(true)
    try {
      const url = `/api/purchase-orders${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch POs')
      const data = await res.json()
      setPos(data.purchaseOrders)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load POs',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, toast])

  useEffect(() => { void fetchPOs() }, [fetchPOs])

  const openCreate = async () => {
    setFormShopId('')
    setFormSupplierId('')
    setFormNotes('')
    setLineItems([{ partId: '', quantity: 1, unitCost: 0, totalCost: 0 }])
    setDialogOpen(true)
    // Fetch parts, shops, suppliers in parallel
    try {
      const [partsRes, shopsRes, suppliersRes] = await Promise.all([
        fetch('/api/parts?limit=200').then((r) => r.json()),
        fetch('/api/shops').then((r) => r.json()),
        fetch('/api/suppliers').then((r) => r.json()),
      ])
      setParts(partsRes.parts || [])
      setShops(shopsRes.shops || [])
      setSuppliers(suppliersRes.suppliers || suppliersRes || [])
    } catch {
      // ignore — form will just have empty dropdowns
    }
  }

  const addLine = () => {
    setLineItems([...lineItems, { partId: '', quantity: 1, unitCost: 0, totalCost: 0 }])
  }

  const removeLine = (i: number) => {
    setLineItems(lineItems.filter((_, idx) => idx !== i))
  }

  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems]
    if (field === 'partId') {
      const part = parts.find((p) => p.id === value)
      updated[i] = {
        ...updated[i],
        partId: value as string,
        partNumber: part?.partNumber,
        name: part?.name,
        unitCost: part?.costPrice ?? updated[i].unitCost,
      }
    } else if (field === 'quantity' || field === 'unitCost') {
      updated[i] = { ...updated[i], [field]: Number(value) }
      updated[i].totalCost = updated[i].quantity * updated[i].unitCost
    } else {
      updated[i] = { ...updated[i], [field]: value }
    }
    setLineItems(updated)
  }

  const total = lineItems.reduce((sum, l) => sum + l.totalCost, 0)

  const handleCreate = async () => {
    if (lineItems.length === 0 || lineItems.some((l) => !l.partId || l.quantity <= 0)) {
      toast({ title: 'Add at least one valid line item', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: formShopId || undefined,
          supplierId: formSupplierId || undefined,
          notes: formNotes,
          lineItems: lineItems.map((l) => ({
            partId: l.partId,
            quantity: l.quantity,
            unitCost: l.unitCost,
            totalCost: l.totalCost,
            batchNumber: l.batchNumber,
            expiryDate: l.expiryDate,
          })),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create PO')
      }
      toast({ title: 'PO created', description: 'Status: draft' })
      setDialogOpen(false)
      void fetchPOs()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create PO',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleAction = async (poId: string, action: 'approve' | 'receive' | 'cancel') => {
    setSaving(true)
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `Failed to ${action} PO`)
      }
      toast({ title: `PO ${action}d` })
      void fetchPOs()
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
            <ClipboardList className="h-6 w-6 text-indigo-600" />
            Purchase Orders
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Workflow: draft → approved → received. Receiving auto-increments stock + creates batches.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> New PO
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm">Filter:</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-6">
          {pos.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>No purchase orders yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left bg-gray-50">
                    <th className="py-3 px-2">PO #</th>
                    <th className="py-3 px-2">Supplier</th>
                    <th className="py-3 px-2">Shop</th>
                    <th className="py-3 px-2">Status</th>
                    <th className="py-3 px-2 text-right">Total</th>
                    <th className="py-3 px-2">Created</th>
                    <th className="py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pos.map((po) => {
                    const lines: LineItem[] = JSON.parse(po.lineItems || '[]')
                    return (
                      <tr key={po.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-2 font-mono font-semibold">{po.poNumber}</td>
                        <td className="py-3 px-2">{po.supplier?.name || '—'}</td>
                        <td className="py-3 px-2">{po.shop?.name || '—'}</td>
                        <td className="py-3 px-2">
                          <Badge className={STATUS_COLORS[po.status]}>{po.status}</Badge>
                        </td>
                        <td className="py-3 px-2 text-right font-semibold">
                          {formatCurrency(po.totalAmount, po.currency)}
                        </td>
                        <td className="py-3 px-2 text-xs text-gray-500">{formatDate(po.createdAt)}</td>
                        <td className="py-3 px-2">
                          <div className="flex gap-1">
                            {po.status === 'draft' && (
                              <Button size="sm" variant="outline" onClick={() => handleAction(po.id, 'approve')}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                              </Button>
                            )}
                            {po.status === 'approved' && (
                              <Button size="sm" onClick={() => handleAction(po.id, 'receive')}>
                                <Package className="h-3 w-3 mr-1" /> Receive
                              </Button>
                            )}
                            {(po.status === 'draft' || po.status === 'approved') && (
                              <Button size="sm" variant="outline" onClick={() => handleAction(po.id, 'cancel')}>
                                <XCircle className="h-3 w-3 mr-1" /> Cancel
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create PO dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Shop</Label>
                <Select value={formShopId} onValueChange={setFormShopId}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Supplier</Label>
                <Select value={formSupplierId} onValueChange={setFormSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Line Items</Label>
              <div className="space-y-2 mt-2">
                {lineItems.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 border rounded">
                    <div className="col-span-4">
                      <Label className="text-xs">Part</Label>
                      <Select value={line.partId} onValueChange={(v) => updateLine(i, 'partId', v)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Select part" /></SelectTrigger>
                        <SelectContent>
                          {parts.map((p) => <SelectItem key={p.id} value={p.id}>{p.partNumber} — {p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} className="h-8" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Unit Cost</Label>
                      <Input type="number" min={0} step="0.01" value={line.unitCost} onChange={(e) => updateLine(i, 'unitCost', e.target.value)} className="h-8" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Batch #</Label>
                      <Input value={line.batchNumber || ''} onChange={(e) => updateLine(i, 'batchNumber', e.target.value)} className="h-8" placeholder="Optional" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Expiry</Label>
                      <Input type="date" value={line.expiryDate || ''} onChange={(e) => updateLine(i, 'expiryDate', e.target.value)} className="h-8" />
                    </div>
                    <div className="col-span-1">
                      <Button size="icon" variant="ghost" onClick={() => removeLine(i)} disabled={lineItems.length === 1}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addLine} className="mt-2">
                <Plus className="h-3 w-3 mr-1" /> Add Line
              </Button>
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Optional" />
            </div>

            <div className="text-right font-semibold">
              Total: {formatCurrency(total)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Draft PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
