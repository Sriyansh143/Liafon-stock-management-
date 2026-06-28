import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { verifyTwoFactorCode, verifyTwoFactor, removeUsedBackupCode } from '@/lib/totp'
import { logUserActivity } from '@/lib/activity'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { action, code } = body
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })

    if (action === 'enable') {
      const [user, authErr] = await guardAuth(request)
      if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
      const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, twoFactorSecret: true, twoFactorEnabled: true } })
      if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
      if (dbUser.twoFactorEnabled) return NextResponse.json({ error: 'Already enabled' }, { status: 400 })
      if (!dbUser.twoFactorSecret) return NextResponse.json({ error: 'No pending setup' }, { status: 400 })
      let setup: { secret: string; backupCodesHashed: string[] }
      try { setup = JSON.parse(dbUser.twoFactorSecret) } catch { return NextResponse.json({ error: 'Invalid state' }, { status: 500 }) }
      if (!verifyTwoFactorCode(code, setup.secret)) return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
      await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true, twoFactorSecret: JSON.stringify({ secret: setup.secret, backupCodesHashed: setup.backupCodesHashed }) } })
      await logUserActivity(user, { action: 'UPDATE', entityType: 'user', entityId: user.id, summary: `2FA enabled for ${dbUser.email}`, metadata: { email: dbUser.email } })
      return NextResponse.json({ success: true, message: '2FA enabled.' })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) { logApiError('auth/2fa/verify/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
