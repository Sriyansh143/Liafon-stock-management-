import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError, apiBadRequest } from '@/lib/api-utils'
import { generateUpiQrCode, decodeQrImage, validateVpa, validateUpiPhone, parseUpiDeepLink, extractVpa } from '@/lib/upi'

/**
 * /api/payments/upi — UPI payment helpers.
 *
 * POST /api/payments/upi
 *   Body: {
 *     action: 'generate_qr' | 'decode_qr' | 'validate_vpa' | 'validate_phone'
 *     payeeVpa, payeeName, amount, note (for generate_qr)
 *     imageBase64 (for decode_qr — base64-encoded PNG/JPEG of a UPI QR)
 *     vpa (for validate_vpa)
 *     phone (for validate_phone)
 *   }
 *
 * ─── generate_qr ──────────────────────────────────────────────────────────
 * Generates a UPI QR code (Base64 PNG data URL) that the customer scans
 * with any UPI app (PhonePe, Google Pay, Paytm, BHIM). No paid API.
 *
 * ─── decode_qr ────────────────────────────────────────────────────────────
 * Decodes a QR code image uploaded by the user (e.g. customer's screenshot
 * of their UPI QR). Returns the parsed VPA, amount, note. No paid API —
 * uses `jsqr` + `sharp` locally.
 *
 * ─── validate_vpa / validate_phone ────────────────────────────────────────
 * Quick format validators. Used by the client for live form validation.
 */

interface UpiApiBody {
  action: 'generate_qr' | 'decode_qr' | 'validate_vpa' | 'validate_phone'
  payeeVpa?: string
  payeeName?: string
  amount?: number
  note?: string
  transactionRef?: string
  imageBase64?: string
  vpa?: string
  phone?: string
  size?: number
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = (await request.json().catch(() => null)) as UpiApiBody | null
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { action } = body

    // ─── Generate UPI QR ────────────────────────────────────────────────
    if (action === 'generate_qr') {
      if (!body.payeeVpa) return apiBadRequest('payeeVpa is required')
      if (!body.payeeName) return apiBadRequest('payeeName is required')
      if (!validateVpa(body.payeeVpa)) {
        return apiBadRequest(`Invalid VPA format: ${body.payeeVpa}. Expected format: name@bank (e.g. merchant@okhdfcbank)`)
      }
      if (body.amount !== undefined && (!Number.isFinite(body.amount) || body.amount < 0)) {
        return apiBadRequest('amount must be a non-negative number')
      }
      try {
        const result = await generateUpiQrCode({
          payeeVpa: body.payeeVpa,
          payeeName: body.payeeName,
          amount: body.amount,
          note: body.note,
          transactionRef: body.transactionRef,
        }, body.size || 256)
        return NextResponse.json({
          success: true,
          qrCode: result.dataUrl,
          deepLink: result.deepLink,
          size: result.size,
        })
      } catch (err) {
        return NextResponse.json(
          { error: 'Failed to generate QR code', details: err instanceof Error ? err.message : 'Unknown' },
          { status: 500 }
        )
      }
    }

    // ─── Decode UPI QR (from uploaded image) ────────────────────────────
    if (action === 'decode_qr') {
      if (!body.imageBase64) return apiBadRequest('imageBase64 is required (Base64-encoded PNG/JPEG)')
      try {
        // Strip the data URL prefix if present
        const base64Data = body.imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')
        const result = await decodeQrImage(buffer)
        return NextResponse.json({
          success: result.success,
          rawText: result.rawText,
          upi: result.upi,
          error: result.error,
        })
      } catch (err) {
        return NextResponse.json(
          { error: 'Failed to decode QR image', details: err instanceof Error ? err.message : 'Unknown' },
          { status: 500 }
        )
      }
    }

    // ─── Validate VPA ───────────────────────────────────────────────────
    if (action === 'validate_vpa') {
      if (!body.vpa) return apiBadRequest('vpa is required')
      const extracted = extractVpa(body.vpa)
      const isValid = extracted !== null
      return NextResponse.json({
        success: true,
        input: body.vpa,
        isValid,
        normalizedVpa: extracted,
      })
    }

    // ─── Validate phone ─────────────────────────────────────────────────
    if (action === 'validate_phone') {
      if (!body.phone) return apiBadRequest('phone is required')
      return NextResponse.json({
        success: true,
        input: body.phone,
        isValid: validateUpiPhone(body.phone),
      })
    }

    return apiBadRequest(`Unknown action: ${action}. Use generate_qr, decode_qr, validate_vpa, or validate_phone.`)
  } catch (error) {
    logApiError('payments/upi/POST', error)
    return NextResponse.json({ error: 'Failed to process UPI request' }, { status: 500 })
  }
}

// GET — return info about supported UPI actions (for client discovery)
export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    return NextResponse.json({
      actions: ['generate_qr', 'decode_qr', 'validate_vpa', 'validate_phone'],
      description: 'UPI payment helpers — QR generation, QR decoding (image upload), VPA + phone validation',
    })
  } catch (error) {
    logApiError('payments/upi/GET', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
