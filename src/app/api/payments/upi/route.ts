import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { generateUpiQrCode, decodeQrImage, validateVpa, validateUpiPhone, parseUpiDeepLink, extractVpa } from '@/lib/upi'

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { action } = body
    if (action === 'generate_qr') {
      if (!body.payeeVpa) return NextResponse.json({ error: 'payeeVpa required' }, { status: 400 })
      if (!validateVpa(body.payeeVpa)) return NextResponse.json({ error: 'Invalid VPA' }, { status: 400 })
      const result = await generateUpiQrCode({ payeeVpa: body.payeeVpa, payeeName: body.payeeName, amount: body.amount, note: body.note, transactionRef: body.transactionRef }, body.size || 256)
      return NextResponse.json({ success: true, qrCode: result.dataUrl, deepLink: result.deepLink, size: result.size })
    }
    if (action === 'decode_qr') {
      if (!body.imageBase64) return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 })
      const buffer = Buffer.from(body.imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, ''), 'base64')
      const result = await decodeQrImage(buffer)
      return NextResponse.json({ success: result.success, rawText: result.rawText, upi: result.upi, error: result.error })
    }
    if (action === 'validate_vpa') { const e = extractVpa(body.vpa || ''); return NextResponse.json({ success: true, input: body.vpa, isValid: e !== null, normalizedVpa: e }) }
    if (action === 'validate_phone') { return NextResponse.json({ success: true, input: body.phone, isValid: validateUpiPhone(body.phone || '') }) }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) { logApiError('payments/upi/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
