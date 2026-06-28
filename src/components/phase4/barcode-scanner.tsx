'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, X, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface BarcodeScannerProps { onScan: (code: string) => void; onClose: () => void; }

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error' | 'denied'>('starting')
  const [errorMessage, setErrorMessage] = useState('')
  const [lastScan, setLastScan] = useState<string | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const stop = useCallback(() => { if (controlsRef.current) { try { controlsRef.current.stop() } catch {}; controlsRef.current = null } }, [])

  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) { setStatus('error'); setErrorMessage('Camera not supported.'); return }
        let stream: MediaStream
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }) }
        catch (err) { if (err instanceof DOMException && err.name === 'NotAllowedError') { setStatus('denied'); setErrorMessage('Camera permission denied.') } else { setStatus('error'); setErrorMessage('No camera found.') } return }
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        const controls = reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => { if (result && !cancelled) { const text = result.getText(); if (text !== lastScan) { setLastScan(text); onScan(text); stop(); setTimeout(() => onClose(), 500) } } })
        if (controls && typeof controls === 'object' && 'stop' in controls) controlsRef.current = controls as { stop: () => void }
        else if (controls instanceof Promise) controls.then((c) => { if (!cancelled) controlsRef.current = c; else try { c.stop() } catch {} })
        if (!cancelled) setStatus('scanning')
      } catch (err) { if (!cancelled) { setStatus('error'); setErrorMessage(err instanceof Error ? err.message : 'Failed') } }
    }
    void start()
    return () => { cancelled = true; stop(); if (videoRef.current?.srcObject) { const s = videoRef.current.srcObject as MediaStream; s.getTracks().forEach((t) => t.stop()); videoRef.current.srcObject = null } }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2 text-white"><Camera className="h-5 w-5" /><span className="font-semibold">Scan Barcode</span></div><Button variant="ghost" size="icon" onClick={() => { stop(); onClose() }}><X className="h-5 w-5 text-white" /></Button></div>
        <div className="relative aspect-square w-full bg-black rounded-lg overflow-hidden">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {status === 'scanning' && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-3/4 h-1/3 border-4 border-red-500 rounded-lg" /></div>}
          {status === 'starting' && <div className="absolute inset-0 flex items-center justify-center text-white"><Loader2 className="h-8 w-8 animate-spin" /></div>}
        </div>
        <div className="mt-4">
          {status === 'scanning' && <p className="text-white/80 text-sm text-center">Point camera at a barcode</p>}
          {status === 'starting' && <p className="text-white/80 text-sm text-center">Starting camera…</p>}
          {(status === 'error' || status === 'denied') && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{errorMessage}</AlertDescription></Alert>}
          {lastScan && <Alert><span className="text-xs">Last scan:</span><span className="font-mono font-bold ml-2">{lastScan}</span></Alert>}
        </div>
        <div className="mt-4"><Button variant="outline" className="w-full" onClick={() => { stop(); onClose() }}>Cancel</Button></div>
      </div>
    </div>
  )
}
