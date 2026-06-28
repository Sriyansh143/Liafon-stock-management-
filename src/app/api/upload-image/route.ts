import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError, apiBadRequest } from '@/lib/api-utils'

const MAX_IMAGE_SIZE_KB = 200

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { image } = body
    if (!image) return apiBadRequest('image required (base64 data URL)')
    if (!image.startsWith('data:image/')) return apiBadRequest('Must be data URL')
    const sizeKb = Math.round((image.length * 3) / 4 / 1024)
    if (sizeKb > MAX_IMAGE_SIZE_KB) return apiBadRequest(`Image too large: ${sizeKb}KB. Max ${MAX_IMAGE_SIZE_KB}KB.`)
    if (!image.match(/^data:image\/(jpeg|jpg|png|webp|gif);base64,/)) return apiBadRequest('Unsupported format')
    return NextResponse.json({ success: true, url: image, sizeKb })
  } catch (error) { logApiError('upload-image/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
