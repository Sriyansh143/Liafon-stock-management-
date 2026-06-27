import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardManager, logApiError } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

/**
 * /api/stock-transfers — move stock between shops.
 *
 * POST /api/stock-transfers
 *   Body: { fromShopId, toShopId, partId, quantity, notes }
 *   Creates a transfer with status='pending'. Source shop's stock is NOT
 *   decremented until status='shipped'. Destination shop's stock is NOT
 *   incremented until status='received'.
 *
 * PATCH /api/stock-transfers/[id]
 *   Body: { action: 'ship' | 'receive' | 'cancel' }
 *
 * On 'ship': source part.currentStock -= quantity
 * On 'receive': destination part.currentStock += quantity
 *   (creates the part at destination shop if it doesn't exist there,
 *    copying cost/selling prices from source)
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')

    const where: Record<string, unknown> = { ownerId: user.ownerId }
    if (status) where.status = status

    const transfers = await db.stockTransfer.findMany({
      where,
      include: {
        fromShop: { select: { name: true } },
        toShop: { select: { name: true } },
        part: { select: { name: true, partNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json({ transfers, total: transfers.length })
  } catch (error) {
    logApiError('stock-transfers/GET', error)
    return NextResponse.json({ error: 'Failed to fetch stock transfers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { fromShopId, toShopId, partId, quantity, notes } = body as {
      fromShopId?: string
      toShopId?: string
      partId?: string
      quantity?: number
      notes?: string
    }

    if (!fromShopId || !toShopId) {
      return NextResponse.json({ error: 'fromShopId and toShopId are required' }, { status: 400 })
    }
    if (fromShopId === toShopId) {
      return NextResponse.json({ error: 'Source and destination shops must be different' }, { status: 400 })
    }
    if (!partId) {
      return NextResponse.json({ error: 'partId is required' }, { status: 400 })
    }
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: 'Quantity must be positive' }, { status: 400 })
    }

    // Verify both shops belong to the owner
    const [fromShop, toShop, part] = await Promise.all([
      db.shop.findFirst({ where: { id: fromShopId, ownerId: user.ownerId } }),
      db.shop.findFirst({ where: { id: toShopId, ownerId: user.ownerId } }),
      db.sparePart.findFirst({
        where: { id: partId, ownerId: user.ownerId, shopId: fromShopId },
      }),
    ])
    if (!fromShop) return NextResponse.json({ error: 'Source shop not found' }, { status: 404 })
    if (!toShop) return NextResponse.json({ error: 'Destination shop not found' }, { status: 404 })
    if (!part) return NextResponse.json({ error: 'Part not found in source shop' }, { status: 404 })
    if (part.currentStock < qty) {
      return NextResponse.json(
        { error: `Insufficient stock. Available: ${part.currentStock}` },
        { status: 400 }
      )
    }

    // Generate transfer number
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const startOfToday = new Date(today)
    startOfToday.setHours(0, 0, 0, 0)
    const transfersToday = await db.stockTransfer.count({
      where: { createdAt: { gte: startOfToday } },
    })
    const transferNumber = `TR-${dateStr}-${String(transfersToday + 1).padStart(5, '0')}`

    const transfer = await db.stockTransfer.create({
      data: {
        ownerId: user.ownerId,
        transferNumber,
        fromShopId,
        toShopId,
        partId,
        quantity: qty,
        status: 'pending',
        notes: notes || '',
      },
    })

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'part',
      entityId: transfer.id,
      summary: `Stock transfer ${transferNumber}: ${qty} × ${part.name} from ${fromShop.name} to ${toShop.name}`,
      metadata: { transferId: transfer.id, transferNumber, fromShopId, toShopId, partId, quantity: qty },
    })

    return NextResponse.json(transfer, { status: 201 })
  } catch (error) {
    logApiError('stock-transfers/POST', error)
    return NextResponse.json({ error: 'Failed to create stock transfer' }, { status: 500 })
  }
}
