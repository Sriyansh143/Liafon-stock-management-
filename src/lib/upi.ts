/** UPI payment helpers — VPA, QR generation, QR decoding. */
import QRCode from 'qrcode'
import jsQR from 'jsqr'

export interface UpiPaymentParams { payeeVpa: string; payeeName: string; amount?: number; note?: string; transactionRef?: string }
export interface ParsedUpiLink { payeeVpa: string | null; payeeName: string | null; amount: number | null; note: string | null; raw: string; isValid: boolean }

export function validateVpa(vpa: string): boolean { return /^[a-zA-Z0-9.\-_]{4,30}@[a-zA-Z0-9]{2,30}$/.test(vpa.trim()) }
export function validateUpiPhone(phone: string): boolean { const d = phone.replace(/[^\d]/g, ''); const n = d.startsWith('91') && d.length === 12 ? d.slice(2) : d; return /^[6-9]\d{9}$/.test(n) }

export function buildUpiDeepLink(params: UpiPaymentParams): string {
  const p = new URLSearchParams()
  p.set('pa', params.payeeVpa); p.set('pn', params.payeeName)
  if (params.amount && params.amount > 0) p.set('am', params.amount.toFixed(2))
  if (params.note) p.set('tn', params.note.slice(0, 50))
  if (params.transactionRef) p.set('tr', params.transactionRef.slice(0, 35))
  return `upi://pay?${p.toString()}`
}

export function parseUpiDeepLink(url: string): ParsedUpiLink {
  const t = url.trim()
  if (!t.startsWith('upi://pay?')) return { payeeVpa: null, payeeName: null, amount: null, note: null, raw: t, isValid: false }
  const params = new URLSearchParams(t.slice('upi://pay?'.length))
  const a = params.get('am')
  return { payeeVpa: params.get('pa'), payeeName: params.get('pn'), amount: a ? parseFloat(a) : null, note: params.get('tn'), raw: t, isValid: !!params.get('pa') }
}

export async function generateUpiQrCode(params: UpiPaymentParams, size = 256): Promise<{ dataUrl: string; deepLink: string; size: number }> {
  if (!validateVpa(params.payeeVpa)) throw new Error(`Invalid VPA: ${params.payeeVpa}`)
  const url = buildUpiDeepLink(params)
  const dataUrl = await QRCode.toDataURL(url, { width: size, margin: 2, color: { dark: '#000000', light: '#FFFFFF' }, errorCorrectionLevel: 'M' })
  return { dataUrl, deepLink: url, size }
}

export async function decodeQrImage(imageBuffer: Buffer): Promise<{ success: boolean; rawText: string | null; upi: ParsedUpiLink | null; error?: string }> {
  try {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(imageBuffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: 'attemptBoth' })
    if (!code) return { success: false, rawText: null, upi: null, error: 'No QR code found in the image.' }
    const parsed = parseUpiDeepLink(code.data)
    return { success: true, rawText: code.data, upi: parsed.isValid ? parsed : null, error: parsed.isValid ? undefined : 'QR decoded but not a UPI link.' }
  } catch (err) { return { success: false, rawText: null, upi: null, error: `Failed: ${err instanceof Error ? err.message : 'Unknown'}` } }
}

export function extractVpa(input: string): string | null {
  const t = input.trim()
  if (t.startsWith('upi://')) { const p = parseUpiDeepLink(t); if (p.payeeVpa && validateVpa(p.payeeVpa)) return p.payeeVpa }
  const m = t.match(/[a-zA-Z0-9.\-_]{4,30}@[a-zA-Z0-9]{2,30}/)
  return m && validateVpa(m[0]) ? m[0] : null
}
