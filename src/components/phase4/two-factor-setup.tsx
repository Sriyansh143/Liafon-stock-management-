'use client'
import { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Shield, ShieldCheck, Key, Copy, Download, AlertTriangle, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
interface TwoFactorSetupProps { open: boolean; onClose: () => void; enabled: boolean; onStatusChange?: (e: boolean) => void }
interface SetupResponse { otpauthUrl: string; secret: string; backupCodes: string[]; message: string }

export function TwoFactorSetup({ open, onClose, enabled, onStatusChange }: TwoFactorSetupProps) {
  const { toast } = useToast()
  const [step, setStep] = useState<'password' | 'qr' | 'verify' | 'backup-codes' | 'disable'>(enabled ? 'disable' : 'password')
  const [password, setPassword] = useState(''); const [code, setCode] = useState(''); const [loading, setLoading] = useState(false)
  const [setup, setSetup] = useState<SetupResponse | null>(null); const [acknowledged, setAcknowledged] = useState(false)

  const initiateSetup = useCallback(async () => { setLoading(true); try { const res = await fetch('/api/auth/2fa/enable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: password }) }); if (!res.ok) throw new Error((await res.json()).error || 'Failed'); setSetup(await res.json()); setStep('qr') } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) } finally { setLoading(false) } }, [password, toast])
  const verifyAndEnable = useCallback(async () => { setLoading(true); try { const res = await fetch('/api/auth/2fa/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enable', code }) }); if (!res.ok) throw new Error((await res.json()).error || 'Invalid'); setStep('backup-codes'); toast({ title: '2FA enabled' }) } catch (err) { toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Invalid', variant: 'destructive' }) } finally { setLoading(false) } }, [code, toast])
  const disable2fa = useCallback(async () => { setLoading(true); try { const res = await fetch('/api/auth/2fa/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: password, code }) }); if (!res.ok) throw new Error((await res.json()).error || 'Failed'); toast({ title: '2FA disabled' }); onStatusChange?.(false); handleClose() } catch (err) { toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' }) } finally { setLoading(false) } }, [password, code, toast, onStatusChange])
  const handleClose = () => { setPassword(''); setCode(''); setSetup(null); setAcknowledged(false); setStep(enabled ? 'disable' : 'password'); onClose() }
  const qrImageUrl = setup ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setup.otpauthUrl)}` : null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-indigo-600" />{enabled ? 'Disable 2FA' : 'Enable 2FA'}</DialogTitle></DialogHeader>
        {step === 'disable' && (<div className="space-y-4"><Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Disabling 2FA reduces security. Requires password + TOTP code.</AlertDescription></Alert><div className="space-y-2"><Label>Current Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div><div className="space-y-2"><Label>2FA Code</Label><Input placeholder="123456" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div><Button onClick={disable2fa} disabled={loading || !password || code.length !== 6} className="w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Disable 2FA</Button></div>)}
        {step === 'password' && (<div className="space-y-4"><Alert><Shield className="h-4 w-4" /><AlertDescription>2FA adds security. After enabling, you'll need password + 6-digit code from your authenticator app.</AlertDescription></Alert><div className="space-y-2"><Label>Verify Current Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div><Button onClick={initiateSetup} disabled={loading || !password} className="w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}Start Setup</Button></div>)}
        {step === 'qr' && setup && (<div className="space-y-4"><div className="flex flex-col items-center gap-3">{qrImageUrl && <img src={qrImageUrl} alt="2FA QR" className="w-48 h-48 border rounded" />}<p className="text-sm text-gray-600 text-center">Scan with your authenticator app, OR enter this secret manually:</p><code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono break-all">{setup.secret}</code></div><Button onClick={() => setStep('verify')} className="w-full">I've scanned the QR — continue</Button></div>)}
        {step === 'verify' && (<div className="space-y-4"><p className="text-sm text-gray-600">Enter the 6-digit code from your authenticator app.</p><Input placeholder="123456" maxLength={6} className="text-center text-2xl tracking-widest font-mono" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /><Button onClick={verifyAndEnable} disabled={loading || code.length !== 6} className="w-full">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}Verify & Enable</Button></div>)}
        {step === 'backup-codes' && setup && (<div className="space-y-4"><Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Save these 8 backup codes. Each can be used ONCE if you lose your phone.</AlertDescription></Alert><div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded font-mono text-sm">{setup.backupCodes.map((c, i) => <div key={i} className="text-center">{c}</div>)}</div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />I've saved my backup codes</label><Button onClick={() => { onStatusChange?.(true); handleClose() }} disabled={!acknowledged} className="w-full"><ShieldCheck className="h-4 w-4 mr-2" />Done</Button></div>)}
        <DialogFooter><Button variant="outline" onClick={handleClose}>Cancel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
