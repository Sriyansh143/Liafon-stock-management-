'use client'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Loader2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

import { useToast } from '@/hooks/use-toast'

interface Part { id: string; partNumber: string; name: string; currentStock: number }

export function QuickStockAdjust() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [parts, setParts] = useState<Part[]>([])
  const [selectedPart, setSelectedPart] = useState('')
  const [newStock, setNewStock] = useState(0)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Listen for the custom event from command palette
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('liafon:inventory:quick-adjust', handler)
    return () => window.removeEventListener('liafon:inventory:quick-adjust', handler)
  }, [])

  const fetchParts = useCallback(async () => {
    try { const res = await fetch('/api/parts?limit=200'); if (!res.ok) return; const data = await res.json(); setParts(data.parts || []) } catch {}
  }, [])

  useEffect(() => { if (open) void fetchParts() }, [open, fetchParts])

  const handleSubmit = async () => {
    if (!selectedPart) { toast({ title: 'Select a part', variant: 'destructive' }); return }
    if (newStock < 0) { toast({ title: 'Stock must be >= 0', variant: 'destructive' }); return }
    setSaving(true)
    try {
      const res = await fetch('/api/stock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partId: selectedPart, newStock, notes: notes || 'Quick stock adjustment' }) })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      toast({ title: 'Stock adjusted', description: `New stock: ${newStock}` })
      setOpen(false); setSelectedPart(''); setNewStock(0); setNotes('')
    } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) }
    finally { setSaving(false) }
  }

  const selectedPartData = parts.find(p => p.id === selectedPart)

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-110"
        title="Quick Stock Adjust"
      >
        <RefreshCw className="h-6 w-6" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-indigo-600" />Quick Stock Adjust</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Select Part</Label><Select value={selectedPart} onValueChange={(v) => { setSelectedPart(v); const p = parts.find(x => x.id === v); if (p) setNewStock(p.currentStock) }}><SelectTrigger><SelectValue placeholder="Search parts..." /></SelectTrigger><SelectContent>{parts.map((p) => <SelectItem key={p.id} value={p.id}>{p.partNumber} — {p.name} (stock: {p.currentStock})</SelectItem>)}</SelectContent></Select></div>
            {selectedPartData && <div className="p-2 bg-gray-50 rounded text-sm text-gray-600">Current stock: <span className="font-bold">{selectedPartData.currentStock}</span></div>}
            <div><Label>New Stock Level</Label><Input type="number" min={0} value={newStock} onChange={(e) => setNewStock(Number(e.target.value))} /></div>
            <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for adjustment" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={handleSubmit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Adjust Stock</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
