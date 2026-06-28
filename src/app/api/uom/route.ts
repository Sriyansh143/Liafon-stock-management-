import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError } from '@/lib/api-utils'

const COMMON_UOMS = [
  { code: 'PCS', name: 'Piece', symbol: 'pcs' },
  { code: 'BOX', name: 'Box', symbol: 'box' },
  { code: 'PKT', name: 'Packet', symbol: 'pkt' },
  { code: 'SET', name: 'Set', symbol: 'set' },
  { code: 'PAIR', name: 'Pair', symbol: 'pair' },
  { code: 'KG', name: 'Kilogram', symbol: 'kg' },
  { code: 'GM', name: 'Gram', symbol: 'g' },
  { code: 'LTR', name: 'Litre', symbol: 'L' },
  { code: 'ML', name: 'Millilitre', symbol: 'mL' },
  { code: 'MTR', name: 'Metre', symbol: 'm' },
  { code: 'CM', name: 'Centimetre', symbol: 'cm' },
  { code: 'ROLL', name: 'Roll', symbol: 'roll' },
  { code: 'BAG', name: 'Bag', symbol: 'bag' },
  { code: 'DRM', name: 'Drum', symbol: 'drum' },
  { code: 'DOZEN', name: 'Dozen (12)', symbol: 'dz' },
  { code: 'GROSS', name: 'Gross (144)', symbol: 'gr' },
  { code: 'NOS', name: 'Numbers', symbol: 'nos' },
  { code: 'UNIT', name: 'Unit', symbol: 'unit' },
]

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    return NextResponse.json({ uoms: COMMON_UOMS, total: COMMON_UOMS.length })
  } catch (error) { logApiError('uom/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
