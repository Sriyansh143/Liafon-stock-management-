import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const q = request.nextUrl.searchParams.get('q') || ''
    const limit = Math.min(200, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '50')))
    const codes = q ? await db.hsnCode.findMany({ where: { OR: [{ code: { startsWith: q.toUpperCase() } }, { description: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }] }, take: limit, orderBy: { code: 'asc' } }) : await db.hsnCode.findMany({ take: limit, orderBy: { code: 'asc' } })
    return NextResponse.json({ codes, total: codes.length })
  } catch (error) { logApiError('hsn-codes/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
