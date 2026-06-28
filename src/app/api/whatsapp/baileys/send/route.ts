import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { sendWhatsApp } from '@/lib/baileys-whatsapp'
import { logUserActivity } from '@/lib/activity'

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { to, message } = body
    if (!to || !message) return NextResponse.json({ error: 'to + message required' }, { status: 400 })
    const result = await sendWhatsApp(user.ownerId, to.replace(/[^\d]/g, ''), message)
    await logUserActivity(user, { action: 'CREATE', entityType: 'whatsapp', summary: `WhatsApp sent to ${to}`, metadata: { to, success: result.success } })
    if (!result.success) return NextResponse.json({ error: result.error, viaExternalServer: result.viaExternalServer }, { status: 400 })
    return NextResponse.json({ success: true, messageId: result.messageId, viaExternalServer: result.viaExternalServer })
  } catch (error) { logApiError('whatsapp/baileys/send/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
