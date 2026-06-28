import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { getWhatsAppStatus, disconnectWhatsApp } from '@/lib/baileys-whatsapp'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const status = await getWhatsAppStatus(user.ownerId)
    return NextResponse.json(status)
  } catch (error) { logApiError('whatsapp/baileys/status/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    if (body.action !== 'logout') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    const result = await disconnectWhatsApp(user.ownerId)
    return NextResponse.json({ success: result.success })
  } catch (error) { logApiError('whatsapp/baileys/status/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
