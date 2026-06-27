'use client'

/**
 * WhatsApp Pairing (Baileys — free, no Twilio)
 *
 * Walks the owner through pairing their WhatsApp account via QR code:
 *   1. GET /api/whatsapp/baileys/status → returns { connected, qrCode }
 *   2. If not connected: show QR + instructions
 *   3. Poll status every 3s until connected
 *   4. Once connected: show "Connected as +91XXXXXXXXXX" + logout button
 *
 * The QR code returned by the API is already a Base64 PNG data URL.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  MessageCircle, QrCode, RefreshCw, LogOut, CheckCircle2, Loader2, AlertCircle,
} from 'lucide-react'

interface WhatsAppPairingProps {
  open: boolean
  onClose: () => void
}

interface StatusResponse {
  connected: boolean
  qrCode?: string | null
  phoneNumber?: string
  viaExternalServer: boolean
  error?: string
}

export function WhatsAppPairing({ open, onClose }: WhatsAppPairingProps) {
  const { toast } = useToast()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/whatsapp/baileys/status')
      if (!res.ok) throw new Error('Failed to fetch status')
      const data: StatusResponse = await res.json()
      setStatus(data)
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to fetch WhatsApp status',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  // Fetch status on open + poll every 3s when not connected
  useEffect(() => {
    if (!open) return
    void fetchStatus()
    const interval = setInterval(() => {
      if (status && !status.connected) {
        void fetchStatus()
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [open, status?.connected, fetchStatus])

  const handleLogout = useCallback(async () => {
    setLogoutLoading(true)
    try {
      const res = await fetch('/api/whatsapp/baileys/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
      if (!res.ok) throw new Error('Failed to logout')
      toast({ title: 'WhatsApp disconnected' })
      await fetchStatus()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to disconnect',
        variant: 'destructive',
      })
    } finally {
      setLogoutLoading(false)
    }
  }, [fetchStatus, toast])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            WhatsApp Pairing
            {status?.connected && (
              <Badge className="bg-green-100 text-green-800 border-green-300">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status banner */}
          {status?.viaExternalServer && (
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Routing via external Baileys gateway (Vercel mode)
            </div>
          )}

          {status?.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              {status.error}
            </div>
          )}

          {/* ─── Not connected: show QR ────────────────────────────────── */}
          {status && !status.connected && (
            <div className="flex flex-col items-center gap-3">
              {loading && !status.qrCode ? (
                <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
              ) : status.qrCode ? (
                <>
                  <img src={status.qrCode} alt="WhatsApp QR" className="w-64 h-64 border rounded" />
                  <div className="text-center text-sm text-gray-600">
                    <p className="font-semibold mb-1">Scan to link WhatsApp</p>
                    <ol className="text-xs space-y-1 list-decimal list-inside text-left">
                      <li>Open WhatsApp on your phone</li>
                      <li>Settings → Linked Devices → Link a Device</li>
                      <li>Scan this QR code</li>
                    </ol>
                    <p className="mt-2 text-xs text-gray-400">
                      QR refreshes automatically every 3s
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center text-sm text-gray-600 py-8">
                  <QrCode className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No QR code available. Click refresh to try again.</p>
                </div>
              )}
              <Button onClick={fetchStatus} variant="outline" size="sm" disabled={loading}>
                <RefreshCw className="h-3 w-3 mr-1" /> Refresh QR
              </Button>
            </div>
          )}

          {/* ─── Connected: show phone number + logout ─────────────────── */}
          {status?.connected && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <div>
                  <p className="font-semibold text-green-900">Connected</p>
                  {status.phoneNumber && (
                    <p className="text-sm text-green-700">+{status.phoneNumber}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500">
                You can now send WhatsApp messages from the app via your paired number.
                Messages are sent from your own WhatsApp account — no per-message fees.
              </p>
              <Button onClick={handleLogout} variant="outline" disabled={logoutLoading} className="w-full">
                {logoutLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
                Disconnect WhatsApp
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
