'use client'

/**
 * 2FA Setup Component
 *
 * Walks the user through enabling TOTP 2FA:
 *   1. Verify current password (initiates setup, returns secret + QR + backup codes)
 *   2. Scan QR with authenticator app (Google Authenticator / Authy / 1Password)
 *   3. Enter 6-digit code to verify
 *   4. Save backup codes (shown ONCE)
 *
 * Also includes a "Disable 2FA" flow that requires password + current TOTP code.
 */

import { useState, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  Shield, ShieldCheck, QrCode, Key, Copy, Download, AlertTriangle, Loader2,
} from 'lucide-react'

interface TwoFactorSetupProps {
  open: boolean
  onClose: () => void
  /** Whether 2FA is currently enabled (controls which flow to show). */
  enabled: boolean
  onStatusChange?: (enabled: boolean) => void
}

interface SetupResponse {
  otpauthUrl: string
  secret: string
  backupCodes: string[]
  message: string
}

export function TwoFactorSetup({ open, onClose, enabled, onStatusChange }: TwoFactorSetupProps) {
  const { toast } = useToast()
  const [step, setStep] = useState<'password' | 'qr' | 'verify' | 'backup-codes' | 'disable'>(enabled ? 'disable' : 'password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [setup, setSetup] = useState<SetupResponse | null>(null)
  const [backupCodesAcknowledged, setBackupCodesAcknowledged] = useState(false)

  // ─── Initiate setup (verify password → get secret + QR + backup codes) ──
  const initiateSetup = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: password }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to initiate 2FA setup')
      }
      const data: SetupResponse = await res.json()
      setSetup(data)
      setStep('qr')
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to start 2FA setup',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [password, toast])

  // ─── Generate a QR image from the otpauth URL ──────────────────────────
  // We use the public `qrcode` REST endpoint to render the otpauth URL as
  // a PNG. This avoids bundling another client-side dep.
  const qrImageUrl = setup
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setup.otpauthUrl)}`
    : null

  // ─── Verify the TOTP code → complete enablement ────────────────────────
  const verifyAndEnable = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable', code }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Invalid code')
      }
      setStep('backup-codes')
      toast({ title: '2FA enabled', description: 'Save your backup codes now.' })
    } catch (err) {
      toast({
        title: 'Verification failed',
        description: err instanceof Error ? err.message : 'Invalid 2FA code',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [code, toast])

  // ─── Disable 2FA ────────────────────────────────────────────────────────
  const disable2fa = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: password, code }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to disable 2FA')
      }
      toast({ title: '2FA disabled' })
      onStatusChange?.(false)
      onClose()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to disable 2FA',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [password, code, toast, onStatusChange, onClose])

  const copyBackupCodes = useCallback(() => {
    if (!setup) return
    navigator.clipboard.writeText(setup.backupCodes.join('\n'))
    toast({ title: 'Copied', description: 'Backup codes copied to clipboard' })
  }, [setup, toast])

  const downloadBackupCodes = useCallback(() => {
    if (!setup) return
    const blob = new Blob([setup.backupCodes.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'liafon-2fa-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }, [setup])

  const handleClose = () => {
    setPassword('')
    setCode('')
    setSetup(null)
    setBackupCodesAcknowledged(false)
    setStep(enabled ? 'disable' : 'password')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-600" />
            {enabled ? 'Disable Two-Factor Authentication' : 'Enable Two-Factor Authentication'}
          </DialogTitle>
        </DialogHeader>

        {/* ─── Disable flow ─────────────────────────────────────────────── */}
        {step === 'disable' && (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Disabling 2FA reduces account security. You'll need your current
                password and a valid TOTP code to disable.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>2FA Code</Label>
              <Input
                placeholder="123456"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <Button onClick={disable2fa} disabled={loading || !password || code.length !== 6} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Disable 2FA
            </Button>
          </div>
        )}

        {/* ─── Enable: Step 1 (password) ───────────────────────────────── */}
        {step === 'password' && (
          <div className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                2FA adds an extra layer of security. After enabling, you'll need
                your password AND a 6-digit code from your authenticator app
                (Google Authenticator, Authy, 1Password) to log in.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Verify Current Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your current password"
              />
              <p className="text-xs text-gray-500">
                Required to prevent session hijacking from silently enabling 2FA.
              </p>
            </div>
            <Button onClick={initiateSetup} disabled={loading || !password} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
              Start Setup
            </Button>
          </div>
        )}

        {/* ─── Enable: Step 2 (scan QR) ────────────────────────────────── */}
        {step === 'qr' && setup && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              {qrImageUrl && (
                <img src={qrImageUrl} alt="2FA QR Code" className="w-48 h-48 border rounded" />
              )}
              <p className="text-sm text-gray-600 text-center">
                Scan with your authenticator app, OR enter this secret manually:
              </p>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono break-all">
                {setup.secret}
              </code>
            </div>
            <Button onClick={() => setStep('verify')} className="w-full">
              I've scanned the QR — continue
            </Button>
          </div>
        )}

        {/* ─── Enable: Step 3 (verify code) ────────────────────────────── */}
        {step === 'verify' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Enter the 6-digit code shown in your authenticator app.
            </p>
            <Input
              placeholder="123456"
              maxLength={6}
              className="text-center text-2xl tracking-widest font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <Button
              onClick={verifyAndEnable}
              disabled={loading || code.length !== 6}
              className="w-full"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Verify & Enable
            </Button>
          </div>
        )}

        {/* ─── Enable: Step 4 (backup codes) ───────────────────────────── */}
        {step === 'backup-codes' && setup && (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Save these 8 backup codes in a safe place. Each can be used ONCE
                if you lose access to your authenticator app. They will never be
                shown again.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded font-mono text-sm">
              {setup.backupCodes.map((code, i) => (
                <div key={i} className="text-center">{code}</div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={copyBackupCodes} className="flex-1">
                <Copy className="h-4 w-4 mr-2" /> Copy
              </Button>
              <Button variant="outline" onClick={downloadBackupCodes} className="flex-1">
                <Download className="h-4 w-4 mr-2" /> Download
              </Button>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={backupCodesAcknowledged}
                onChange={(e) => setBackupCodesAcknowledged(e.target.checked)}
              />
              I've saved my backup codes in a safe place
            </label>

            <Button
              onClick={() => {
                onStatusChange?.(true)
                handleClose()
              }}
              disabled={!backupCodesAcknowledged}
              className="w-full"
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Done
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
