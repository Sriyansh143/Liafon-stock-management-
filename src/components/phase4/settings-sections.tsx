'use client'

/**
 * Phase 4 Settings Sections — drop-in components for the Settings page.
 *
 * Exports:
 *   - TaxRatesSection     : per-category GST rate management
 *   - TwoFactorSection    : 2FA enable/disable + status
 *   - WhatsAppSection     : WhatsApp pairing + status
 *   - PaymentsSection     : placeholder for future payment settings
 *
 * Usage in settings-page.tsx:
 *   import { TaxRatesSection, TwoFactorSection, WhatsAppSection } from '@/components/phase4/settings-sections'
 *   // ... render inside the existing Settings layout
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  Percent, Shield, ShieldCheck, MessageCircle, Plus, Pencil, Loader2,
  CheckCircle2, AlertCircle,
} from 'lucide-react'
import { TwoFactorSetup } from './two-factor-setup'
import { WhatsAppPairing } from './whatsapp-pairing'

// ═══════════════════════════════════════════════════════════════════════════
// 1. TAX RATES SECTION
// ═══════════════════════════════════════════════════════════════════════════

interface TaxRate {
  id: string
  category: string
  rate: number
  hsnCode: string
  description: string
  isActive: boolean
}

export function TaxRatesSection() {
  const { toast } = useToast()
  const [rates, setRates] = useState<TaxRate[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ category: '', rate: 0, hsnCode: '', description: '' })

  const fetchRates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tax-rates')
      if (!res.ok) throw new Error('Failed to fetch tax rates')
      const data = await res.json()
      setRates(data.rates)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load tax rates',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void fetchRates() }, [fetchRates])

  const handleSave = async () => {
    if (!form.category.trim()) {
      toast({ title: 'Category required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/tax-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
      toast({ title: 'Tax rate saved' })
      setDialogOpen(false)
      setForm({ category: '', rate: 0, hsnCode: '', description: '' })
      void fetchRates()
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-indigo-600" />
          Tax Rates (per category)
          <Button size="sm" className="ml-auto" onClick={() => { setForm({ category: '', rate: 0, hsnCode: '', description: '' }); setDialogOpen(true) }}>
            <Plus className="h-4 w-4 mr-1" /> Add Rate
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-32" />
        ) : rates.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            No tax rates configured. Sales will default to 0% GST until you add rates per category.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4 text-right">Rate %</th>
                  <th className="py-2 pr-4">HSN Code</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-4 font-medium">{r.category}</td>
                    <td className="py-2 pr-4 text-right font-semibold">{r.rate}%</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.hsnCode || '—'}</td>
                    <td className="py-2 pr-4 text-xs text-gray-600">{r.description || '—'}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={r.isActive ? 'default' : 'secondary'}>
                        {r.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">
          When a sale is created without an explicit taxRate, the API auto-looks-up the part's category here.
        </p>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Tax Rate</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Category *</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Brakes" />
              <p className="text-xs text-gray-500">Must match the part's category exactly (case-insensitive).</p>
            </div>
            <div>
              <Label>Rate % *</Label>
              <Input type="number" min={0} max={100} step="0.5" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} placeholder="28" />
              <p className="text-xs text-gray-500">Total GST %. For 18% GST, enter 18 (will be split into CGST+SGST or IGST automatically).</p>
            </div>
            <div>
              <Label>HSN Code</Label>
              <Input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} placeholder="8708" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Auto parts" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. TWO-FACTOR SECTION
// ═══════════════════════════════════════════════════════════════════════════

export function TwoFactorSection({ user }: { user: { twoFactorEnabled?: boolean } | null }) {
  const [setupOpen, setSetupOpen] = useState(false)
  const [enabled, setEnabled] = useState(user?.twoFactorEnabled ?? false)

  useEffect(() => {
    setEnabled(user?.twoFactorEnabled ?? false)
  }, [user?.twoFactorEnabled])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-indigo-600" />
          Two-Factor Authentication (2FA)
          <Badge className={`ml-auto ${enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
            {enabled ? (
              <><ShieldCheck className="h-3 w-3 mr-1" /> Enabled</>
            ) : 'Disabled'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          2FA adds an extra layer of security. After enabling, you'll need your password AND a 6-digit code
          from your authenticator app (Google Authenticator, Authy, 1Password) to log in.
        </p>
        {enabled ? (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded text-sm mb-3">
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
            <div>
              <strong>2FA is active.</strong> Save your backup codes in a safe place — they're the only way
              to recover access if you lose your phone.
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm mb-3">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div>
              <strong>2FA is not enabled.</strong> If your password is leaked, your account is fully compromised.
              Enable 2FA to protect against credential theft.
            </div>
          </div>
        )}
        <Button variant={enabled ? 'outline' : 'default'} onClick={() => setSetupOpen(true)}>
          {enabled ? 'Manage 2FA' : 'Enable 2FA'}
        </Button>
        <TwoFactorSetup
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          enabled={enabled}
          onStatusChange={setEnabled}
        />
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. WHATSAPP SECTION
// ═══════════════════════════════════════════════════════════════════════════

export function WhatsAppSection() {
  const [pairOpen, setPairOpen] = useState(false)
  const [status, setStatus] = useState<{ connected: boolean; phoneNumber?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/baileys/status')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setStatus({ connected: data.connected, phoneNumber: data.phoneNumber })
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchStatus() }, [fetchStatus])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-green-600" />
          WhatsApp (Free via Baileys)
          {status?.connected && (
            <Badge className="ml-auto bg-green-100 text-green-800">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          Send invoices + low-stock alerts via WhatsApp — no per-message fees.
          Connects to your own WhatsApp account (like web.whatsapp.com).
        </p>
        {loading ? (
          <Skeleton className="h-12" />
        ) : status?.connected ? (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded text-sm mb-3">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <div>
              <strong>Connected as +{status.phoneNumber || '?'}</strong>
              <p className="text-xs text-gray-600 mt-1">
                Messages will be sent from this number. Logout anytime to disconnect.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm mb-3">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div>
              <strong>Not connected.</strong> Click Pair to scan a QR code with your WhatsApp app
              (Settings → Linked Devices → Link a Device).
            </div>
          </div>
        )}
        <Button variant={status?.connected ? 'outline' : 'default'} onClick={() => setPairOpen(true)}>
          {status?.connected ? 'Manage Connection' : 'Pair WhatsApp'}
        </Button>
        <WhatsAppPairing open={pairOpen} onClose={() => { setPairOpen(false); void fetchStatus() }} />
      </CardContent>
    </Card>
  )
}
