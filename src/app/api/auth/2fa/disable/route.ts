import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { verifyPassword } from '@/lib/auth'
import { verifyTwoFactorCode } from '@/lib/totp'
import { logUserActivity } from '@/lib/activity'

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { currentPassword, code } = body
    if (!currentPassword || !code) return NextResponse.json({ error: 'Password + code required' }, { status: 400 })
    const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, password: true, twoFactorEnabled: true, twoFactorSecret: true } })
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (!dbUser.twoFactorEnabled) return NextResponse.json({ error: '2FA not enabled' }, { status: 400 })
    const { valid: pwValid } = await verifyPassword(currentPassword, dbUser.password)
    if (!pwValid) return NextResponse.json({ error: 'Incorrect password' }, { status: 403 })
    let setup: { secret: string }
    try { setup = JSON.parse(dbUser.twoFactorSecret!) } catch { return NextResponse.json({ error: 'Invalid state' }, { status: 500 }) }
    if (!verifyTwoFactorCode(code, setup.secret)) return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 400 })
    await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } })
    await logUserActivity(user, { action: 'UPDATE', entityType: 'user', entityId: user.id, summary: `2FA disabled for ${dbUser.email}`, metadata: { email: dbUser.email } })
    return NextResponse.json({ success: true, message: '2FA disabled.' })
  } catch (error) { logApiError('auth/2fa/disable/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
