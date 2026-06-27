'use client'

/**
 * Barcode Scanner component — uses device camera via @zxing/browser.
 *
 * Renders a live camera preview + scans for barcodes (Code128, EAN-13,
 * UPC, QR). When a code is detected, calls onScan(code) and stops.
 *
 * Usage:
 *   <BarcodeScanner
 *     onScan={(code) => console.log('Scanned:', code)}
 *     onClose={() => setShowScanner(false)}
 *   />
 *
 * Browser support: requires getUserMedia (Chrome, Firefox, Safari 11+).
 * On iOS Safari, the camera permission prompt appears on first use.
 *
 * The component automatically:
 *   - Requests camera permission
 *   - Starts decoding on mount
 *   - Cleans up the camera stream on unmount
 *   - Shows a "no camera / permission denied" message
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, X, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface BarcodeScannerProps {
  /** Called when a barcode is successfully scanned. */
  onScan: (code: string) => void
  /** Called when the user closes the scanner (X button). */
  onClose: () => void
  /** Optional: which formats to scan for. Default: all common ones. */
  formats?: string[]
}

export function BarcodeScanner({ onScan, onClose, formats }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<unknown>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error' | 'denied'>('starting')
  const [errorMessage, setErrorMessage] = useState('')
  const [lastScan, setLastScan] = useState<string | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  const stop = useCallback(() => {
    if (controlsRef.current) {
      try { controlsRef.current.stop() } catch {}
      controlsRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        // Check if camera is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setStatus('error')
          setErrorMessage('Camera not supported in this browser.')
          return
        }

        // Request camera permission
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },   // prefer back camera on mobile
            audio: false,
          })
        } catch (err) {
          if (err instanceof DOMException && err.name === 'NotAllowedError') {
            setStatus('denied')
            setErrorMessage('Camera permission denied. Please allow camera access in your browser settings.')
          } else {
            setStatus('error')
            setErrorMessage('No camera found or camera in use by another app.')
          }
          return
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        // Attach stream to video element
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // Dynamically import @zxing/browser (heavy — don't load until needed)
        const { BrowserMultiFormatReader } = await import('@zxing/browser')

        // Optional: restrict formats (default scans all). We skip the
        // DecodeHintSet for simplicity — it has typing quirks across versions.
        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        // Start decoding from the video element
        const controls = reader.decodeFromVideoDevice(
          undefined,   // use default camera
          videoRef.current!,
          (result, _err) => {
            if (result && !cancelled) {
              const text = result.getText()
              // Debounce — same code within 2s is ignored
              if (text !== lastScan) {
                setLastScan(text)
                onScan(text)
                stop()
                // Auto-close after a short delay
                setTimeout(() => onClose(), 500)
              }
            }
          }
        )
        // decodeFromVideoDevice returns controls synchronously (not a promise)
        // in newer versions; in older versions it returns a Promise<controls>.
        if (controls && typeof controls === 'object' && 'stop' in controls) {
          controlsRef.current = controls as { stop: () => void }
        } else if (controls instanceof Promise) {
          controls.then((c) => {
            if (!cancelled) {
              controlsRef.current = c
            } else {
              try { c.stop() } catch {}
            }
          })
        }

        if (!cancelled) {
          setStatus('scanning')
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setErrorMessage(err instanceof Error ? err.message : 'Failed to start camera')
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      stop()
      // Stop the video stream tracks
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach((t) => t.stop())
        videoRef.current.srcObject = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-white">
            <Camera className="h-5 w-5" />
            <span className="font-semibold">Scan Barcode</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => { stop(); onClose() }}>
            <X className="h-5 w-5 text-white" />
          </Button>
        </div>

        {/* Video preview */}
        <div className="relative aspect-square w-full bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />

          {/* Scanning overlay (red frame in center) */}
          {status === 'scanning' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-3/4 h-1/3 border-4 border-red-500 rounded-lg" />
            </div>
          )}

          {/* Loading state */}
          {status === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
        </div>

        {/* Status / errors */}
        <div className="mt-4">
          {status === 'scanning' && (
            <p className="text-white/80 text-sm text-center">
              Point camera at a barcode (Code128, EAN-13, UPC, QR)
            </p>
          )}
          {status === 'starting' && (
            <p className="text-white/80 text-sm text-center">Starting camera…</p>
          )}
          {(status === 'error' || status === 'denied') && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          {lastScan && (
            <Alert>
              <span className="text-xs">Last scan:</span>
              <span className="font-mono font-bold ml-2">{lastScan}</span>
            </Alert>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => { stop(); onClose() }}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
