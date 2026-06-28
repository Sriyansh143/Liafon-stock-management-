import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardOwner, logApiError } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

interface BrandingConfig { shopName: string; shopLogo: string; tagline: string; addressLine: string; phone: string; email: string; gstin: string; upiVpa: string }
const DEFAULT_BRANDING: BrandingConfig = { shopName: 'Liafon Stock Management', shopLogo: '', tagline: '', addressLine: '', phone: '', email: '', gstin: '', upiVpa: '' }

export async function GET(request: NextRequest) {
  try {
    let ownerId = ''
    try { const [user, authErr] = await guardOwner(request); if (!authErr && user) ownerId = user.ownerId } catch {}
    if (!ownerId) return NextResponse.json({ branding: DEFAULT_BRANDING })
    const setting = await db.appSetting.findFirst({ where: { ownerId, key: 'branding' } })
    if (!setting) return NextResponse.json({ branding: DEFAULT_BRANDING })
    try { return NextResponse.json({ branding: { ...DEFAULT_BRANDING, ...JSON.parse(setting.value) } }) } catch { return NextResponse.json({ branding: DEFAULT_BRANDING }) }
  } catch (error) { logApiError('branding/GET', error); return NextResponse.json({ branding: DEFAULT_BRANDING }) }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardOwner(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { shopName, shopLogo, tagline, addressLine, phone, email, gstin, upiVpa } = body
    if (!shopName?.trim()) return NextResponse.json({ error: 'shopName required' }, { status: 400 })
    if (shopLogo && shopLogo.length > 100 * 1024) return NextResponse.json({ error: 'Logo too large. Max 100KB.' }, { status: 400 })
    const branding: BrandingConfig = { shopName: shopName.trim().slice(0, 100), shopLogo: shopLogo || '', tagline: (tagline || '').slice(0, 200), addressLine: (addressLine || '').slice(0, 500), phone: (phone || '').slice(0, 40), email: (email || '').slice(0, 120), gstin: (gstin || '').toUpperCase().slice(0, 20), upiVpa: (upiVpa || '').slice(0, 50) }
    const existing = await db.appSetting.findFirst({ where: { ownerId: user.ownerId, key: 'branding' } })
    if (existing) await db.appSetting.update({ where: { id: existing.id }, data: { value: JSON.stringify(branding) } })
    else await db.appSetting.create({ data: { ownerId: user.ownerId, key: 'branding', value: JSON.stringify(branding) } })
    await logUserActivity(user, { action: 'UPDATE', entityType: 'setting', summary: `Branding updated: ${branding.shopName}`, metadata: { shopName: branding.shopName, hasLogo: !!branding.shopLogo } })
    return NextResponse.json({ success: true, branding })
  } catch (error) { logApiError('branding/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
