import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { generateTwoFactorSetup } from '@/lib/totp'
import { verifyPassword } from '@/lib/auth'
import { logUserActivity } from '@/lib/activity'

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { currentPassword } = body
    if (!currentPassword) return NextResponse.json({ error: 'Password required' }, { status: 400 })
    const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, password: true, twoFactorEnabled: true } })
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    const { valid } = await verifyPassword(currentPassword, dbUser.password)
    if (!valid) return NextResponse.json({ error: 'Incorrect password' }, { status: 403 })
    if (dbUser.twoFactorEnabled) return NextResponse.json({ error: '2FA already enabled' }, { status: 400 })
    const setup = generateTwoFactorSetup(dbUser.email)
    await db.user.update({ where: { id: user.id }, data: { twoFactorSecret: JSON.stringify({ secret: setup.secret, backupCodesHashed: setup.backupCodesHashed, pendingEnable: true }) } })
    await logUserActivity(user, { action: 'UPDATE', entityType: 'user', entityId: user.id, summary: `2FA setup initiated for ${dbUser.email}`, metadata: { email: dbUser.email } })
    return NextResponse.json({ success: true, otpauthUrl: setup.otpauthUrl, secret: setup.secret, backupCodes: setup.backupCodes, message: 'Scan QR, then verify code.' })
  } catch (error) { logApiError('auth/2fa/enable/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
