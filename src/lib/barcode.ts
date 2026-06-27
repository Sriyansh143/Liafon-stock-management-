/**
 * Barcode generation + scan helpers.
 *
 * ─── Barcode scanning (client-side, in the browser) ────────────────────────
 * The actual camera capture + decode happens CLIENT-SIDE because:
 *   1. Camera APIs only work in browser, not server
 *   2. We don't want to upload images to the server just to decode a barcode
 *
 * The client-side scanning uses `@zxing/browser` (Apache 2.0, free,
 * based on the popular ZXing port). It's installed separately as a
 * client-only dependency. See `src/components/barcode-scanner.tsx` for
 * the React component that wraps it.
 *
 * ─── Barcode generation (server-side) ──────────────────────────────────────
 * This module generates barcodes as PNG/SVG using `bwip-js` (MIT, free).
 * Used to:
 *   - Generate barcodes for new parts (printed on labels)
 *   - Generate QR codes for invoices (already covered by `upi.ts`)
 *
 * ─── Supported barcode formats ─────────────────────────────────────────────
 * For auto parts, EAN-13 is most common (13 digits). Code128 is the
 * fallback for alphanumeric part numbers.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BarcodeGenerateOptions {
  /** The value to encode (part number, SKU, etc.). */
  value: string
  /** Barcode type. Default: 'code128' (alphanumeric). */
  format?: 'code128' | 'ean13' | 'ean8' | 'upc' | 'qr'
  /** Output format. Default: 'svg' (smaller + scalable). */
  output?: 'svg' | 'png'
  /** Width in pixels (PNG only). Default: 200. */
  width?: number
  /** Height in pixels. Default: 60. */
  height?: number
  /** Whether to include the value as text below the barcode. Default: true. */
  includeText?: boolean
}

export interface BarcodeResult {
  /** The barcode value (echoed back). */
  value: string
  /** The format used. */
  format: string
  /** SVG string (if output='svg') — render via dangerouslySetInnerHTML. */
  svg?: string
  /** Base64 PNG data URL (if output='png') — render via <img src="...">. */
  pngDataUrl?: string
}

// ─── Server-side generation (uses bwip-js, MIT) ─────────────────────────────

/**
 * Generate a barcode as SVG or PNG.
 *
 * For PNG output, returns a Base64 data URL.
 * For SVG output, returns the raw SVG string.
 *
 * Uses dynamic import of bwip-js so it doesn't bloat the serverless bundle
 * if barcode generation isn't used.
 */
export async function generateBarcode(options: BarcodeGenerateOptions): Promise<BarcodeResult> {
  const {
    value,
    format = 'code128',
    output = 'svg',
    width = 200,
    height = 60,
    includeText = true,
  } = options

  // Validate EAN-13 (must be exactly 12-13 digits)
  if (format === 'ean13' && !/^\d{12,13}$/.test(value)) {
    throw new Error('EAN-13 requires 12-13 digits')
  }
  if (format === 'ean8' && !/^\d{7,8}$/.test(value)) {
    throw new Error('EAN-8 requires 7-8 digits')
  }
  if (format === 'upc' && !/^\d{11,12}$/.test(value)) {
    throw new Error('UPC requires 11-12 digits')
  }

  if (format === 'qr') {
    // Use the qrcode package (already a dep) for QR codes
    const QRCode = (await import('qrcode')).default
    const dataUrl = await QRCode.toDataURL(value, { width, margin: 1 })
    return { value, format, pngDataUrl: dataUrl }
  }

  // bwip-js for 1D barcodes — import via the explicit node entry to work
  // around Turbopack's resolver issue with the package's export conditions.
  // The "node" export condition points to ./dist/bwip-js-node.mjs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bwip: any = (await import('bwip-js/dist/bwip-js-node.mjs' as string)).default || (await import('bwip-js/dist/bwip-js-node.mjs' as string))
  const buffer = await bwip.toBuffer({
    bcid: format,
    text: value,
    scale: 3,
    height: Math.floor(height / 3),
    includetext: includeText,
    textxalign: 'center',
  })

  if (output === 'png') {
    const base64 = buffer.toString('base64')
    return {
      value,
      format,
      pngDataUrl: `data:image/png;base64,${base64}`,
    }
  }

  // For SVG, bwip-js doesn't natively output SVG. Convert PNG buffer to a
  // data URL embedded in an SVG (simpler than a true SVG path).
  const base64 = buffer.toString('base64')
  return {
    value,
    format,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <image href="data:image/png;base64,${base64}" width="${width}" height="${height}" />
    </svg>`,
  }
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate a barcode value based on its format.
 */
export function validateBarcode(value: string, format: 'code128' | 'ean13' | 'ean8' | 'upc'): boolean {
  switch (format) {
    case 'code128': return value.length > 0 && value.length <= 80
    case 'ean13':   return /^\d{12,13}$/.test(value)
    case 'ean8':    return /^\d{7,8}$/.test(value)
    case 'upc':     return /^\d{11,12}$/.test(value)
    default:        return false
  }
}

/**
 * Auto-detect the best barcode format for a value.
 *   - All digits, 12-13 chars → EAN-13
 *   - All digits, 7-8 chars → EAN-8
 *   - All digits, 11-12 chars → UPC
 *   - Anything else → Code128 (alphanumeric-safe fallback)
 */
export function detectBarcodeFormat(value: string): 'code128' | 'ean13' | 'ean8' | 'upc' {
  if (/^\d{12,13}$/.test(value)) return 'ean13'
  if (/^\d{7,8}$/.test(value)) return 'ean8'
  if (/^\d{11,12}$/.test(value)) return 'upc'
  return 'code128'
}
