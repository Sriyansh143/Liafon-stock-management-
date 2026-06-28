'use client'
import { useState, useCallback, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import { QrCode, Upload, Phone, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

interface UpiPaymentModalProps { open: boolean; onClose: () => void; saleId: string; amount: number; payeeVpa?: string; payeeName?: string; onPaymentRecorded?: (p: unknown) => void }
export function UpiPaymentModal({ open, onClose, saleId, amount, payeeVpa, payeeName, onPaymentRecorded }: UpiPaymentModalProps) {
  const { toast } = useToast()
  const [tab, setTab] = useState<'generate' | 'upload' | 'manual'>('generate')
  const [loading, setLoading] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [customerVpa, setCustomerVpa] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [decodedVpa, setDecodedVpa] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const generateQr = useCallback(async () => {
    if (!payeeVpa) { toast({ title: 'Missing payee VPA', description: 'Set shop UPI VPA in Settings → Branding.', variant: 'destructive' }); return }
    setLoading(true)
    try { const res = await fetch('/api/payments/upi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_qr', payeeVpa, payeeName: payeeName || 'Shop', amount, note: `Sale ${saleId}`, transactionRef: saleId }) }); if (!res.ok) throw new Error('Failed'); const data = await res.json(); setQrCode(data.qrCode) } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) } finally { setLoading(false) }
  }, [payeeVpa, payeeName, amount, saleId, toast])

  const handleQrUpload = useCallback(async (file: File) => {
    setLoading(true)
    const reader = new FileReader()
    reader.onload = async () => { const base64 = reader.result as string; try { const res = await fetch('/api/payments/upi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decode_qr', imageBase64: base64 }) }); const data = await res.json(); if (data.success && data.upi?.payeeVpa) { setDecodedVpa(data.upi.payeeVpa); setCustomerVpa(data.upi.payeeVpa); toast({ title: 'QR decoded', description: `VPA: ${data.upi.payeeVpa}` }) } else { toast({ title: 'No UPI QR found', description: data.error || 'Invalid QR', variant: 'destructive' }) } } catch { toast({ title: 'Decode failed', variant: 'destructive' }) } finally { setLoading(false) } }
    reader.readAsDataURL(file)
  }, [toast])

  const recordPayment = useCallback(async (reference: string, vpa?: string, phone?: string) => {
    setLoading(true)
    try { const res = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saleId, amount, method: 'upi', reference, notes: vpa ? `VPA: ${vpa}` : phone ? `Phone: ${phone}` : '' }) }); if (!res.ok) throw new Error('Failed'); toast({ title: 'Payment recorded', description: `${formatCurrency(amount)} via UPI` }); onPaymentRecorded?.(await res.json()); onClose() } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) } finally { setLoading(false) }
  }, [saleId, amount, toast, onPaymentRecorded, onClose])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>UPI Payment — {formatCurrency(amount)}</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="generate" className="flex items-center gap-2"><QrCode className="h-4 w-4" />Generate QR</TabsTrigger><TabsTrigger value="upload" className="flex items-center gap-2"><Upload className="h-4 w-4" />Scan QR</TabsTrigger><TabsTrigger value="manual" className="flex items-center gap-2"><Phone className="h-4 w-4" />VPA / Phone</TabsTrigger></TabsList>
          <TabsContent value="generate" className="space-y-4"><p className="text-sm text-gray-600">Generate a QR for the customer to scan with any UPI app.</p>{!qrCode ? <Button onClick={generateQr} disabled={loading || !payeeVpa} className="w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <QrCode className="h-4 w-4 mr-2" />}Generate QR</Button> : <div className="flex flex-col items-center gap-3"><img src={qrCode} alt="UPI QR" className="w-64 h-64 border rounded" /><Button onClick={() => recordPayment(`QR scan for ${saleId}`, payeeVpa, undefined)} disabled={loading} className="w-full"><CheckCircle2 className="h-4 w-4 mr-2" />Mark as Paid</Button></div>}{!payeeVpa && <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm"><AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" /><div><strong>Set your shop's UPI VPA in Settings → Branding.</strong></div></div>}</TabsContent>
          <TabsContent value="upload" className="space-y-4"><p className="text-sm text-gray-600">Upload the customer's UPI QR screenshot — we'll decode it.</p><input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleQrUpload(f) }} /><Button onClick={() => fileInputRef.current?.click()} disabled={loading} variant="outline" className="w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}Upload QR Image</Button>{decodedVpa && <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded"><CheckCircle2 className="h-5 w-5 text-green-600" /><div><p className="text-sm font-medium text-green-800">Decoded VPA:</p><p className="text-sm font-mono text-green-900">{decodedVpa}</p></div></div>}{decodedVpa && <Button onClick={() => recordPayment(`Customer QR: ${decodedVpa}`, decodedVpa, undefined)} disabled={loading} className="w-full"><CheckCircle2 className="h-4 w-4 mr-2" />Mark as Paid</Button>}</TabsContent>
          <TabsContent value="manual" className="space-y-4"><div className="space-y-2"><Label>Customer's VPA</Label><Input placeholder="customer@okhdfcbank" value={customerVpa} onChange={(e) => setCustomerVpa(e.target.value)} /></div><div className="space-y-2"><Label>Customer's UPI Phone</Label><Input placeholder="9876543210" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></div><Button onClick={() => recordPayment(`Manual: VPA=${customerVpa || 'N/A'} Phone=${customerPhone || 'N/A'}`, customerVpa || undefined, customerPhone || undefined)} disabled={loading || (!customerVpa && !customerPhone)} className="w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Record UPI Payment</Button></TabsContent>
        </Tabs>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
