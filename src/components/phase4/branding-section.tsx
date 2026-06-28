'use client'
import { useCallback, useEffect, useState } from 'react'
import { Store, Loader2, Save, Upload, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

interface Branding { shopName: string; shopLogo: string; tagline: string; addressLine: string; phone: string; email: string; gstin: string; upiVpa: string }
const DEFAULT: Branding = { shopName: '', shopLogo: '', tagline: '', addressLine: '', phone: '', email: '', gstin: '', upiVpa: '' }

export function BrandingSection() {
  const { toast } = useToast()
  const [branding, setBranding] = useState<Branding>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchBranding = useCallback(async () => { setLoading(true); try { const res = await fetch('/api/branding'); if (!res.ok) throw new Error('Failed'); setBranding((await res.json()).branding || DEFAULT) } catch {} finally { setLoading(false) } }, [])
  useEffect(() => { void fetchBranding() }, [fetchBranding])

  const handleSave = async () => { if (!branding.shopName.trim()) { toast({ title: 'Shop name required', variant: 'destructive' }); return } setSaving(true); try { const res = await fetch('/api/branding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(branding) }); if (!res.ok) throw new Error((await res.json()).error || 'Failed'); toast({ title: 'Branding saved', description: 'Updates appear on all invoices + exports.' }) } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) } finally { setSaving(false) } }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 100 * 1024) { toast({ title: 'Logo too large', description: 'Max 100 KB. Resize to 200×200px.', variant: 'destructive' }); return } const reader = new FileReader(); reader.onload = () => setBranding({ ...branding, shopLogo: reader.result as string }); reader.readAsDataURL(file) }

  if (loading) return null
  return (
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Store className="h-5 w-5 text-indigo-600" />Shop Branding & Identity</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-gray-600">Customize your shop name, logo, and contact info. These appear on all invoices, PDF reports, and exports. "Powered by Liafon" is always included.</p><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="space-y-2 md:col-span-2"><Label>Shop Name *</Label><Input value={branding.shopName} onChange={(e) => setBranding({ ...branding, shopName: e.target.value })} placeholder="Sriyansh Auto Parts" /></div><div className="space-y-2 md:col-span-2"><Label>Shop Logo (optional — max 100 KB, 200×200px recommended)</Label><div className="flex items-center gap-3"><div className="w-16 h-16 border-2 border-dashed rounded-lg overflow-hidden flex items-center justify-center bg-gray-50">{branding.shopLogo ? <img src={branding.shopLogo} alt="Logo" className="w-full h-full object-contain" /> : <Store className="h-6 w-6 text-gray-300" />}</div><input type="file" accept="image/*" className="hidden" id="logo-upload" onChange={handleLogoUpload} /><Button variant="outline" size="sm" onClick={() => document.getElementById('logo-upload')?.click()}><Upload className="h-4 w-4 mr-2" />Upload</Button>{branding.shopLogo && <Button variant="ghost" size="sm" onClick={() => setBranding({ ...branding, shopLogo: '' })}><X className="h-4 w-4" />Remove</Button>}</div></div><div className="space-y-2"><Label>Tagline</Label><Input value={branding.tagline} onChange={(e) => setBranding({ ...branding, tagline: e.target.value })} placeholder="Quality Parts, Fair Prices" /></div><div className="space-y-2"><Label>Phone</Label><Input value={branding.phone} onChange={(e) => setBranding({ ...branding, phone: e.target.value })} placeholder="9876543210" /></div><div className="space-y-2"><Label>Email</Label><Input type="email" value={branding.email} onChange={(e) => setBranding({ ...branding, email: e.target.value })} placeholder="shop@example.com" /></div><div className="space-y-2"><Label>GSTIN</Label><Input value={branding.gstin} onChange={(e) => setBranding({ ...branding, gstin: e.target.value.toUpperCase() })} placeholder="27AABCA1234F1Z5" maxLength={15} /></div><div className="space-y-2"><Label>UPI VPA</Label><Input value={branding.upiVpa} onChange={(e) => setBranding({ ...branding, upiVpa: e.target.value })} placeholder="shop@okhdfcbank" /></div><div className="space-y-2 md:col-span-2"><Label>Address</Label><Input value={branding.addressLine} onChange={(e) => setBranding({ ...branding, addressLine: e.target.value })} placeholder="123 Main Street, Mumbai, Maharashtra 400001" /></div></div><div className="flex justify-end"><Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Branding</Button></div></CardContent></Card>
  )
}
