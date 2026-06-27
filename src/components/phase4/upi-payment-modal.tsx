'use client'

/**
 * UPI Payment Modal
 *
 * The user's specific ask:
 *   "for payment add scanner upload option, vpa and phone number options"
 *
 * This modal supports 3 UPI payment flows:
 *
 * 1. Generate QR — Shop generates a QR with payee VPA + amount. Customer
 *    scans with any UPI app (PhonePe/GPay/Paytm/BHIM) and pays.
 *
 * 2. Upload QR — Customer shows their UPI QR (e.g. screenshot). Shop uploads
 *    the image → backend decodes it via `jsqr` → extracts customer's VPA.
 *    Shop then initiates a collect request (or asks customer to send money).
 *
 * 3. Manual VPA / Phone — Shop manually enters the customer's VPA or
 *    phone-linked UPI ID. Backend validates format.
 *
 * After payment, the modal calls POST /api/payments to record the transaction
 * against the sale.
 */

import { useState, useCallback, useRef } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import {
  QrCode, Upload, Phone, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'

interface UpiPaymentModalProps {
  open: boolean
  onClose: () => void
  saleId: string
  amount: number
  payeeVpa?: string  // Shop's VPA (for QR generation)
  payeeName?: string // Shop's name
  onPaymentRecorded?: (payment: unknown) => void
}

export function UpiPaymentModal({
  open, onClose, saleId, amount, payeeVpa, payeeName, onPaymentRecorded,
}: UpiPaymentModalProps) {
  const { toast } = useToast()
  const [tab, setTab] = useState<'generate' | 'upload' | 'manual'>('generate')
  const [loading, setLoading] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [customerVpa, setCustomerVpa] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [decodedVpa, setDecodedVpa] = useState<string | null>(null)
  const [vpaValid, setVpaValid] = useState<boolean | null>(null)
  const [phoneValid, setPhoneValid] = useState<boolean | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Action 1: Generate QR for customer to scan ────────────────────────
  const generateQr = useCallback(async () => {
    if (!payeeVpa) {
      toast({
        title: 'Missing payee VPA',
        description: 'Set your shop\'s UPI VPA in Settings first.',
        variant: 'destructive',
      })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/payments/upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_qr',
          payeeVpa,
          payeeName: payeeName || 'Shop',
          amount,
          note: `Sale ${saleId}`,
          transactionRef: saleId,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to generate QR')
      }
      const data = await res.json()
      setQrCode(data.qrCode)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to generate QR',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [payeeVpa, payeeName, amount, saleId, toast])

  // ─── Action 2: Upload customer's QR for decoding ───────────────────────
  const handleQrUpload = useCallback(async (file: File) => {
    setLoading(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = reader.result as string
        try {
          const res = await fetch('/api/payments/upi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'decode_qr',
              imageBase64: base64,
            }),
          })
          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || 'Failed to decode QR')
          }
          const data = await res.json()
          if (data.success && data.upi?.payeeVpa) {
            setDecodedVpa(data.upi.payeeVpa)
            setCustomerVpa(data.upi.payeeVpa)
            toast({
              title: 'QR decoded',
              description: `Found VPA: ${data.upi.payeeVpa}`,
            })
          } else {
            toast({
              title: 'No UPI QR found',
              description: data.error || 'The image does not contain a valid UPI QR code.',
              variant: 'destructive',
            })
          }
        } catch (err) {
          toast({
            title: 'Decode failed',
            description: err instanceof Error ? err.message : 'Failed to decode QR',
            variant: 'destructive',
          })
        } finally {
          setLoading(false)
        }
      }
      reader.onerror = () => {
        setLoading(false)
        toast({ title: 'File read error', variant: 'destructive' })
      }
      reader.readAsDataURL(file)
    } catch (err) {
      setLoading(false)
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Failed to read file',
        variant: 'destructive',
      })
    }
  }, [toast])

  // ─── Action 3a: Validate VPA live ──────────────────────────────────────
  const validateVpa = useCallback(async (vpa: string) => {
    setCustomerVpa(vpa)
    if (!vpa || vpa.length < 5) {
      setVpaValid(null)
      return
    }
    try {
      const res = await fetch('/api/payments/upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate_vpa', vpa }),
      })
      const data = await res.json()
      setVpaValid(data.isValid)
    } catch {
      setVpaValid(false)
    }
  }, [])

  // ─── Action 3b: Validate phone live ────────────────────────────────────
  const validatePhone = useCallback(async (phone: string) => {
    setCustomerPhone(phone)
    if (!phone || phone.length < 10) {
      setPhoneValid(null)
      return
    }
    try {
      const res = await fetch('/api/payments/upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate_phone', phone }),
      })
      const data = await res.json()
      setPhoneValid(data.isValid)
    } catch {
      setPhoneValid(false)
    }
  }, [])

  // ─── Record payment via /api/payments ──────────────────────────────────
  const recordPayment = useCallback(async (
    method: 'upi', reference: string, vpa?: string, phone?: string, qrScanned?: boolean
  ) => {
    setLoading(true)
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId,
          amount,
          method,
          reference,
          notes: vpa ? `VPA: ${vpa}` : phone ? `Phone: ${phone}` : '',
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to record payment')
      }
      const payment = await res.json()
      toast({
        title: 'Payment recorded',
        description: `${formatCurrency(amount)} via UPI`,
      })
      onPaymentRecorded?.(payment)
      onClose()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to record payment',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [saleId, amount, toast, onPaymentRecorded, onClose])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>UPI Payment — {formatCurrency(amount)}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generate" className="flex items-center gap-2">
              <QrCode className="h-4 w-4" /> Generate QR
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Scan Customer QR
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Phone className="h-4 w-4" /> VPA / Phone
            </TabsTrigger>
          </TabsList>

          {/* ─── Tab 1: Generate QR ─────────────────────────────────────── */}
          <TabsContent value="generate" className="space-y-4">
            <p className="text-sm text-gray-600">
              Generate a QR code that the customer scans with any UPI app
              (PhonePe, Google Pay, Paytm, BHIM).
            </p>

            {!qrCode ? (
              <Button onClick={generateQr} disabled={loading || !payeeVpa} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <QrCode className="h-4 w-4 mr-2" />}
                Generate QR for {formatCurrency(amount)}
              </Button>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <img src={qrCode} alt="UPI QR" className="w-64 h-64 border rounded" />
                <p className="text-sm text-gray-600">
                  Ask the customer to scan this QR with their UPI app.
                </p>
                <Button
                  onClick={() => recordPayment('upi', `QR scan for ${saleId}`, payeeVpa, undefined, true)}
                  disabled={loading}
                  className="w-full"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark as Paid
                </Button>
              </div>
            )}

            {!payeeVpa && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div>
                  <strong>Set your shop's UPI VPA in Settings.</strong>
                  <p className="text-yellow-700 text-xs mt-1">
                    Without a payee VPA, the app can't generate a collect QR.
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ─── Tab 2: Upload customer QR ──────────────────────────────── */}
          <TabsContent value="upload" className="space-y-4">
            <p className="text-sm text-gray-600">
              Ask the customer to show their UPI QR (in their app). Take a
              screenshot or photo, then upload it here. We'll decode it and
              extract their VPA.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleQrUpload(file)
              }}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="w-full"
              variant="outline"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload QR Image
            </Button>

            {decodedVpa && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-800">Decoded VPA:</p>
                  <p className="text-sm font-mono text-green-900">{decodedVpa}</p>
                </div>
              </div>
            )}

            {decodedVpa && (
              <Button
                onClick={() => recordPayment('upi', `Customer QR: ${decodedVpa}`, decodedVpa, undefined, true)}
                disabled={loading}
                className="w-full"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark as Paid
              </Button>
            )}
          </TabsContent>

          {/* ─── Tab 3: Manual VPA / Phone ──────────────────────────────── */}
          <TabsContent value="manual" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vpa">Customer's VPA</Label>
              <Input
                id="vpa"
                placeholder="customer@okhdfcbank"
                value={customerVpa}
                onChange={(e) => void validateVpa(e.target.value)}
              />
              {vpaValid === true && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Valid VPA format
                </p>
              )}
              {vpaValid === false && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Invalid VPA format
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Customer's UPI Phone</Label>
              <Input
                id="phone"
                placeholder="9876543210"
                value={customerPhone}
                onChange={(e) => void validatePhone(e.target.value)}
              />
              {phoneValid === true && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Valid Indian mobile
                </p>
              )}
              {phoneValid === false && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Invalid phone format
                </p>
              )}
            </div>

            <Button
              onClick={() => recordPayment(
                'upi',
                `Manual: VPA=${customerVpa || 'N/A'} Phone=${customerPhone || 'N/A'}`,
                customerVpa || undefined,
                customerPhone || undefined,
                false
              )}
              disabled={loading || (!customerVpa && !customerPhone)}
              className="w-full"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Record UPI Payment
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
