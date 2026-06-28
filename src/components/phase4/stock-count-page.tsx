'use client'
import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, Plus, Loader2, CheckCircle2, ArrowLeft, Package } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

interface Item { id: string; partId: string; expectedQty: number; countedQty: number | null; variance: number; notes: string; countedAt: string | null; part: { partNumber: string; name: string; category: string; brand: string; currentStock: number; location: string } }
interface SC { id: string; countNumber: string; status: string; startedAt: string; finalizedAt: string | null; notes: string; totalItems: number; matchedItems: number; varianceItems: number; items?: Item[] }
const STATUS_COLORS: Record<string, string> = { draft: 'bg-gray-100 text-gray-800', in_progress: 'bg-blue-100 text-blue-800', finalized: 'bg-green-100 text-green-800', cancelled: 'bg-red-100 text-red-800' }

export function StockCountPage() {
  const { toast } = useToast()
  const [counts, setCounts] = useState<SC[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SC | null>(null)
  const [saving, setSaving] = useState(false)
  const [finalizeDialog, setFinalizeDialog] = useState(false)

  const fetchCounts = useCallback(async () => { setLoading(true); try { const res = await fetch('/api/stock-count'); if (!res.ok) throw new Error('Failed'); setCounts((await res.json()).counts) } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) } finally { setLoading(false) } }, [toast])
  useEffect(() => { void fetchCounts() }, [fetchCounts])

  const openCount = async (c: SC) => { try { const res = await fetch(`/api/stock-count/${c.id}`); if (!res.ok) throw new Error('Failed'); setSelected(await res.json()) } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) } }
  const startCount = async () => { setSaving(true); try { const res = await fetch('/api/stock-count', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); if (!res.ok) throw new Error('Failed'); toast({ title: 'Stock count started' }); void fetchCounts() } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) } finally { setSaving(false) } }
  const updateItem = async (itemId: string, qty: number) => { if (!selected) return; setSelected({ ...selected, items: selected.items?.map(i => i.id === itemId ? { ...i, countedQty: qty } : i) }); try { await fetch(`/api/stock-count/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_item', itemId, countedQty: qty }) }) } catch {} }
  const finalize = async () => { if (!selected) return; setSaving(true); try { const res = await fetch(`/api/stock-count/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'finalize' }) }); if (!res.ok) throw new Error('Failed'); const r = await res.json(); toast({ title: 'Finalized', description: `${r.matchedItems} matched, ${r.varianceItems} variance` }); setFinalizeDialog(false); setSelected(null); void fetchCounts() } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) } finally { setSaving(false) } }

  if (loading) return (<div className="space-y-4 p-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>)
  if (selected) { const counted = selected.items?.filter(i => i.countedQty !== null).length ?? 0; const total = selected.items?.length ?? 0; return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between"><div><Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="mb-2"><ArrowLeft className="h-4 w-4 mr-1" />Back</Button><h2 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-indigo-600" />{selected.countNumber}<Badge className={STATUS_COLORS[selected.status]}>{selected.status}</Badge></h2><p className="text-sm text-gray-600 mt-1">Started {formatDate(selected.startedAt)} · {counted}/{total} counted</p></div>{selected.status === 'in_progress' && <Button onClick={() => setFinalizeDialog(true)} disabled={saving}><CheckCircle2 className="h-4 w-4 mr-2" />Finalize</Button>}</div>
      <Card><CardContent className="pt-6">{selected.items && selected.items.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left bg-gray-50"><th className="py-3 px-2">Part</th><th className="py-3 px-2">Location</th><th className="py-3 px-2 text-center">Expected</th><th className="py-3 px-2 text-center">Counted</th><th className="py-3 px-2 text-center">Variance</th></tr></thead><tbody>{selected.items.map((item) => { const v = item.countedQty !== null ? item.countedQty - item.expectedQty : null; return (<tr key={item.id} className="border-b hover:bg-gray-50"><td className="py-3 px-2"><div className="font-medium">{item.part.name}</div><div className="text-xs text-gray-500">{item.part.partNumber} · {item.part.brand}</div></td><td className="py-3 px-2 text-xs">{item.part.location || '—'}</td><td className="py-3 px-2 text-center font-semibold">{item.expectedQty}</td><td className="py-3 px-2 text-center">{selected.status === 'in_progress' ? <Input type="number" min={0} value={item.countedQty ?? ''} onChange={(e) => void updateItem(item.id, e.target.value === '' ? 0 : Number(e.target.value))} className="w-20 h-8 text-center" placeholder="—" /> : <span className="font-semibold">{item.countedQty ?? '—'}</span>}</td><td className="py-3 px-2 text-center">{v === null ? <span className="text-gray-400">—</span> : v === 0 ? <Badge variant="secondary" className="bg-green-100 text-green-800">✓</Badge> : <Badge className={v > 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}>{v > 0 ? '+' : ''}{v}</Badge>}</td></tr>)})}</tbody></table></div> : <div className="text-center py-12 text-gray-500"><Package className="h-12 w-12 mx-auto mb-2 opacity-30" /><p>No items.</p></div>}</CardContent></Card>
      <AlertDialog open={finalizeDialog} onOpenChange={setFinalizeDialog}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Finalize stock count?</AlertDialogTitle><AlertDialogDescription>This posts stock adjustments for all items with variance. Cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={finalize} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Finalize</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  )}
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between"><div><h2 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-indigo-600" />Stock Counts</h2><p className="text-sm text-gray-600 mt-1">Physical stocktaking. Start a count, walk shelves, finalize to post adjustments.</p></div><Button onClick={startCount} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Start Count</Button></div>
      <Card><CardContent className="pt-6">{counts.length === 0 ? <div className="text-center py-12 text-gray-500"><ClipboardCheck className="h-12 w-12 mx-auto mb-2 opacity-30" /><p>No stock counts yet.</p></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left bg-gray-50"><th className="py-3 px-2">Count #</th><th className="py-3 px-2">Status</th><th className="py-3 px-2 text-center">Items</th><th className="py-3 px-2 text-center">Matched</th><th className="py-3 px-2 text-center">Variance</th><th className="py-3 px-2">Started</th></tr></thead><tbody>{counts.map((c) => (<tr key={c.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => void openCount(c)}><td className="py-3 px-2 font-mono font-semibold">{c.countNumber}</td><td className="py-3 px-2"><Badge className={STATUS_COLORS[c.status]}>{c.status}</Badge></td><td className="py-3 px-2 text-center">{c.totalItems}</td><td className="py-3 px-2 text-center">{c.status === 'finalized' ? c.matchedItems : '—'}</td><td className="py-3 px-2 text-center">{c.status === 'finalized' ? c.varianceItems : '—'}</td><td className="py-3 px-2 text-xs text-gray-500">{formatDate(c.startedAt)}</td></tr>))}</tbody></table></div>}</CardContent></Card>
    </div>
  )
}
