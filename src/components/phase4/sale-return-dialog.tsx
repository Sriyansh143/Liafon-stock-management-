'use client'
import { useState } from 'react'
import { RotateCcw, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

interface SaleReturnDialogProps {
  open: boolean
  onClose: () => void
  sale: { id: string; invoiceNumber?: string; quantity: number; totalPrice: number; amountPaid?: number; part?: { name: string; partNumber: string } } | null
  onReturnRecorded?: () => void
}

export function SaleReturnDialog({ open, onClose, sale, onReturnRecorded }: SaleReturnDialogProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [refundAmount, setRefundAmount] = useState(0)
  const [reason, setReason] = useState('')
  const [condition, setCondition] = useState('resellable')
  const [restocked, setRestocked] = useState(true)
  const [notes, setNotes] = useState('')
  if (!sale) return null
  const maxRefund = sale.amountPaid ?? sale.totalPrice

  const handleSubmit = async () => {
    if (quantity <= 0 || quantity > sale.quantity) { toast({ title: 'Invalid quantity', description: `Must be 1-${sale.quantity}`, variant: 'destructive' }); return }
    if (refundAmount < 0 || refundAmount > maxRefund) { toast({ title: 'Invalid refund', variant: 'destructive' }); return }
    setSaving(true)
    try {
      const res = await fetch('/api/sale-returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saleId: sale.id, quantity, refundAmount, reason, condition, restocked, notes }) })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed') }
      toast({ title: 'Return recorded', description: `${quantity} units, refund ₹${refundAmount}` })
      onReturnRecorded?.(); onClose()
      setQuantity(1); setRefundAmount(0); setReason(''); setCondition('resellable'); setRestocked(true); setNotes('')
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-orange-600" />Process Sale Return / Refund</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="p-3 bg-gray-50 rounded-lg text-sm">
            <div className="font-semibold">{sale.part?.name || 'Part'}</div>
            <div className="text-xs text-gray-500">Invoice: {sale.invoiceNumber || '—'} · Qty: {sale.quantity} · Total: ₹{sale.totalPrice.toFixed(2)}</div>
            <Badge className="mt-1" variant={((sale.amountPaid ?? 0)) >= sale.totalPrice ? 'default' : 'secondary'}>Paid: ₹{((sale.amountPaid ?? 0)).toFixed(2)}</Badge>
          </div>
          <div><Label>Return Quantity (max {sale.quantity})</Label><Input type="number" min={1} max={sale.quantity} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></div>
          <div><Label>Refund Amount (max ₹{maxRefund.toFixed(2)})</Label><Input type="number" min={0} max={maxRefund} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(Number(e.target.value))} /></div>
          <div><Label>Reason</Label><Select value={reason} onValueChange={setReason}><SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger><SelectContent><SelectItem value="Defective">Defective</SelectItem><SelectItem value="Wrong item">Wrong item</SelectItem><SelectItem value="Customer changed mind">Customer changed mind</SelectItem><SelectItem value="Damaged">Damaged</SelectItem><SelectItem value="Expired">Expired</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></div>
          <div><Label>Condition</Label><Select value={condition} onValueChange={(v) => { setCondition(v); setRestocked(v === 'resellable') }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="resellable">Resellable (restock)</SelectItem><SelectItem value="damaged">Damaged (no restock)</SelectItem><SelectItem value="expired">Expired (no restock)</SelectItem></SelectContent></Select></div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}Process Return</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
