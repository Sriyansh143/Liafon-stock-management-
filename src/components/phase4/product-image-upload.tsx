'use client'
import { useRef, useState } from 'react'
import { Upload, X, Loader2, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ProductImageUploadProps { value: string; onChange: (url: string) => void; label?: string }
const MAX_DIM = 400, QUALITY = 0.8

export function ProductImageUpload({ value, onChange, label = 'Product Image' }: ProductImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Image too large. Max 5 MB.'); return }
    setError(''); setLoading(true)
    try {
      const dataUrl = await resizeImage(file, MAX_DIM, QUALITY)
      const res = await fetch('/api/upload-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl }) })
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed')
      onChange(dataUrl)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-start gap-3">
        <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden flex items-center justify-center bg-gray-50 flex-shrink-0">{value ? <img src={value} alt="Product" className="w-full h-full object-cover" /> : <ImageIcon className="h-8 w-8 text-gray-300" />}</div>
        <div className="flex-1 space-y-2">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}Upload Image</Button>
            {value && <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(''); if (fileInputRef.current) fileInputRef.current.value = '' }}><X className="h-4 w-4 mr-2" />Remove</Button>}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-xs text-gray-500">Optional. Auto-resized to 400×400px. Shown on invoices + reports.</p>
        </div>
      </div>
    </div>
  )
}

function resizeImage(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); const size = Math.min(img.width, img.height); const sx = (img.width - size) / 2; const sy = (img.height - size) / 2; canvas.width = maxDim; canvas.height = maxDim; const ctx = canvas.getContext('2d'); if (!ctx) { reject(new Error('Canvas not supported')); return }; ctx.drawImage(img, sx, sy, size, size, 0, 0, maxDim, maxDim); resolve(canvas.toDataURL('image/jpeg', quality)) }; img.onerror = () => reject(new Error('Failed to load')); img.src = e.target?.result as string }
    reader.onerror = () => reject(new Error('Failed to read')); reader.readAsDataURL(file)
  })
}
