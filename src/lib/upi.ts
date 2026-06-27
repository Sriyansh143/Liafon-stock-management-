/**
 * UPI Payment helpers — VPA, QR code generation, QR code decoding.
 *
 * ─── What is UPI? ──────────────────────────────────────────────────────────
 * Unified Payments Interface (UPI) is India's national real-time payment
 * system. Users pay by scanning a QR code OR by entering a VPA
 * (Virtual Payment Address, e.g. "merchant@okhdfcbank") OR by entering
 * their phone number linked to UPI.
 *
 * ─── What this module does ─────────────────────────────────────────────────
 * 1. `generateUpiQrCode(payeeVpa, payeeName, amount, note)` — Generates a
 *    PNG QR code (Base64 data URL) that customers scan with any UPI app
 *    (PhonePe, Google Pay, Paytm, BHIM, etc.). Uses the `qrcode` package
 *    (MIT license, no paid API).
 *
 * 2. `decodeQrImage(buffer)` — Decodes a QR code image uploaded by the
 *    user (e.g. a screenshot of a customer's UPI QR). Uses the `jsqr`
 *    package (MIT license, no paid API). Returns the raw QR string + a
 *    parsed UPI deep link (extracts VPA, amount, note).
 *
 * 3. `buildUpiDeepLink(payeeVpa, payeeName, amount, note)` — Builds the
 *    `upi://pay?...` deep link that gets encoded into QR codes.
 *
 * 4. `parseUpiDeepLink(url)` — Parses a `upi://pay?...` URL into its
 *    parts (pa, pn, am, tn, etc.).
 *
 * 5. `validateVpa(vpa)` — Basic format validation for VPA strings.
 *
 * ─── No paid APIs ──────────────────────────────────────────────────────────
 * All QR operations are done locally with `qrcode` + `jsqr`. No external
 * API calls. No per-transaction fees.
 */

import QRCode from 'qrcode'
import jsQR from 'jsqr'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UpiPaymentParams {
  payeeVpa: string       // pa — e.g. "merchant@okhdfcbank"
  payeeName: string      // pn — e.g. "Liafon Auto Parts"
  amount?: number        // am — e.g. 1500.00 (optional, user can edit in app)
  note?: string          // tn — e.g. "Invoice INV-20240101-00001"
  transactionRef?: string  // tr — merchant's internal reference
  transactionNote?: string // tn — note for the payee
}

export interface UpiDeepLink {
  url: string   // The full "upi://pay?pa=...&pn=...&am=...&tn=..."
}

export interface ParsedUpiLink {
  payeeVpa: string | null
  payeeName: string | null
  amount: number | null
  note: string | null
  transactionRef: string | null
  raw: string
  isValid: boolean
}

// ─── Validators ────────────────────────────────────────────────────────────

/**
 * Validate a UPI VPA format. VPA is `name@bank` where:
 *   - name: 4-30 chars, alphanumeric + dots + hyphens + underscores
 *   - bank: 4-30 chars, alphanumeric (typically a bank/PSP handle like okhdfcbank)
 *
 * Examples of valid VPAs:
 *   - merchant@okhdfcbank
 *   - john.doe-1@oksbi
 *   - 9876543210@upi
 */
export function validateVpa(vpa: string): boolean {
  const trimmed = vpa.trim()
  // Pattern: name@handle, both 4-30 chars, name allows . - _
  return /^[a-zA-Z0-9.\-_]{4,30}@[a-zA-Z0-9]{2,30}$/.test(trimmed)
}

/** Validate a 10-digit Indian mobile number (or with country code +91). */
export function validateUpiPhone(phone: string): boolean {
  const digits = phone.replace(/[^\d]/g, '')
  // Strip leading 91 if present
  const normalized = digits.startsWith('91') && digits.length === 12
    ? digits.slice(2)
    : digits
  return /^[6-9]\d{9}$/.test(normalized)
}

// ─── Deep link builder ─────────────────────────────────────────────────────

/**
 * Build a UPI deep link (`upi://pay?...`) from payment params.
 * This URL can be:
 *   - Encoded into a QR code (most common)
 *   - Opened directly on mobile (launches the user's default UPI app)
 *   - Sent via WhatsApp/SMS as a clickable link
 */
export function buildUpiDeepLink(params: UpiPaymentParams): UpiDeepLink {
  const parts = new URLSearchParams()
  parts.set('pa', params.payeeVpa)
  parts.set('pn', params.payeeName)
  if (params.amount !== undefined && params.amount > 0) {
    parts.set('am', params.amount.toFixed(2))
  }
  if (params.note) {
    parts.set('tn', params.note.slice(0, 50))   // UPI spec: max 50 chars for tn
  }
  if (params.transactionRef) {
    parts.set('tr', params.transactionRef.slice(0, 35))
  }
  return { url: `upi://pay?${parts.toString()}` }
}

/**
 * Parse a UPI deep link (`upi://pay?...`) into its component parts.
 * Returns `isValid: false` if the URL doesn't match the UPI scheme.
 */
export function parseUpiDeepLink(url: string): ParsedUpiLink {
  const trimmed = url.trim()
  if (!trimmed.startsWith('upi://pay?')) {
    return {
      payeeVpa: null,
      payeeName: null,
      amount: null,
      note: null,
      transactionRef: null,
      raw: trimmed,
      isValid: false,
    }
  }
  const queryPart = trimmed.slice('upi://pay?'.length)
  const params = new URLSearchParams(queryPart)
  const amountStr = params.get('am')
  return {
    payeeVpa: params.get('pa'),
    payeeName: params.get('pn'),
    amount: amountStr ? parseFloat(amountStr) : null,
    note: params.get('tn'),
    transactionRef: params.get('tr'),
    raw: trimmed,
    isValid: !!params.get('pa'),
  }
}

// ─── QR generation ─────────────────────────────────────────────────────────

export interface QrCodeResult {
  /** Base64-encoded PNG, with `data:image/png;base64,` prefix — render in <img src="...">. */
  dataUrl: string
  /** The deep link that was encoded into the QR. */
  deepLink: string
  /** Size in pixels of the generated QR. */
  size: number
}

/**
 * Generate a UPI QR code as a Base64 data URL.
 *
 * @param params  UPI payment params (VPA, name, amount, note)
 * @param size    QR code size in pixels (default 256)
 */
export async function generateUpiQrCode(
  params: UpiPaymentParams,
  size: number = 256
): Promise<QrCodeResult> {
  if (!validateVpa(params.payeeVpa)) {
    throw new Error(`Invalid VPA format: ${params.payeeVpa}`)
  }
  const { url } = buildUpiDeepLink(params)
  const dataUrl = await QRCode.toDataURL(url, {
    width: size,
    margin: 2,           // 2 modules of quiet zone (UPI spec requires ≥2)
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',   // UPI QRs use level M
  })
  return { dataUrl, deepLink: url, size }
}

// ─── QR decoding (from uploaded image) ─────────────────────────────────────

export interface DecodedQrResult {
  success: boolean
  /** The raw string encoded in the QR (e.g. "upi://pay?pa=..."). */
  rawText: string | null
  /** If the QR contained a UPI deep link, the parsed parts. */
  upi: ParsedUpiLink | null
  error?: string
}

/**
 * Decode a QR code from an image buffer (e.g. uploaded by the user).
 *
 * The image must be a PNG/JPEG with the QR visible. Works in Node.js
 * (uses `jsqr` which accepts raw RGBA pixel data). The caller must first
 * decode the image into pixels — we use `sharp` (already a dep) for this.
 *
 * @param imageBuffer  Buffer containing PNG/JPEG image bytes
 */
export async function decodeQrImage(imageBuffer: Buffer): Promise<DecodedQrResult> {
  try {
    // Use sharp to convert any image format to raw RGBA pixels
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(imageBuffer)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true })

    // jsQR expects Uint8ClampedArray (RGBA)
    const clamped = new Uint8ClampedArray(data)
    const code = jsQR(clamped, info.width, info.height, {
      inversionAttempts: 'attemptBoth',   // Try both normal + inverted colors
    })

    if (!code) {
      return {
        success: false,
        rawText: null,
        upi: null,
        error: 'No QR code found in the image. Make sure the QR is clearly visible and fills most of the image.',
      }
    }

    // Check if it's a UPI deep link
    const parsed = parseUpiDeepLink(code.data)
    return {
      success: true,
      rawText: code.data,
      upi: parsed.isValid ? parsed : null,
      error: parsed.isValid ? undefined : 'QR decoded but it is not a UPI payment link.',
    }
  } catch (err) {
    return {
      success: false,
      rawText: null,
      upi: null,
      error: `Failed to decode image: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }
}

// ─── Convenience: extract VPA from any string (deep link or raw VPA) ────────

/**
 * Try to extract a VPA from an arbitrary user input string.
 * Handles:
 *   - "upi://pay?pa=foo@bar&am=100"  → "foo@bar"
 *   - "foo@bar"                       → "foo@bar"
 *   - "VPA: foo@bar"                  → "foo@bar"
 */
export function extractVpa(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed.startsWith('upi://')) {
    const parsed = parseUpiDeepLink(trimmed)
    if (parsed.payeeVpa && validateVpa(parsed.payeeVpa)) return parsed.payeeVpa
  }
  // Try direct match
  const match = trimmed.match(/[a-zA-Z0-9.\-_]{4,30}@[a-zA-Z0-9]{2,30}/)
  if (match && validateVpa(match[0])) return match[0]
  return null
}
