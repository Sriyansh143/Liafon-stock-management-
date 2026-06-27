import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardManager, guardAdmin, logApiError } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

/**
 * /api/purchase-orders — full PO workflow (draft → approved → received → cancelled)
 *
 * GET  /api/purchase-orders?status=<status>&shopId=<id>    — list POs
 * POST /api/purchase-orders { shopId, supplierId, lineItems, notes }  — create draft PO
 * PATCH (via /api/purchase-orders/[id]) — change status: approve / receive / cancel
 *
 * Line items are stored as JSON in `PurchaseOrder.lineItems`. Each line:
 *   { partId, partNumber, name, quantity, unitCost, totalCost, batchNumber, expiryDate }
 *
 * When a PO is marked 'received':
 *   1. For each line: increment part.currentStock
 *   2. Create a Purchase record (for historical ledger)
 *   3. Create a Batch record (with batch number + expiry, if provided)
 *   4. Create a StockLog entry
 *   5. Update PO.totalAmount + receivedAt + receivedById
 */

interface POLineItem {
  partId: string
  partNumber?: string
  name?: string
  quantity: number
  unitCost: number
  totalCost: number
  batchNumber?: string
  expiryDate?: string
}

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const shopId = searchParams.get('shopId')

    const where: Record<string, unknown> = { ownerId: user.ownerId }
    if (status) where.status = status
    if (shopId && shopId !== 'all') where.shopId = shopId

    const pos = await db.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { name: true, phone: true } },
        shop: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json({ purchaseOrders: pos, total: pos.length })
  } catch (error) {
    logApiError('purchase-orders/GET', error)
    return NextResponse.json({ error: 'Failed to fetch purchase orders' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { shopId, supplierId, lineItems, notes } = body as {
      shopId?: string
      supplierId?: string
      lineItems?: POLineItem[]
      notes?: string
    }

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })
    }

    // Validate line items
    for (const [i, line] of lineItems.entries()) {
      if (!line.partId) {
        return NextResponse.json({ error: `Line ${i + 1}: partId is required` }, { status: 400 })
      }
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        return NextResponse.json({ error: `Line ${i + 1}: quantity must be positive` }, { status: 400 })
      }
      if (!Number.isFinite(line.unitCost) || line.unitCost < 0) {
        return NextResponse.json({ error: `Line ${i + 1}: unitCost must be ≥ 0` }, { status: 400 })
      }
    }

    // Generate PO number
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const startOfToday = new Date(today)
    startOfToday.setHours(0, 0, 0, 0)
    const posToday = await db.purchaseOrder.count({
      where: { createdAt: { gte: startOfToday } },
    })
    const poNumber = `PO-${dateStr}-${String(posToday + 1).padStart(5, '0')}`

    // Compute total
    const totalAmount = lineItems.reduce((sum, l) => sum + l.totalCost, 0)

    // Verify all parts belong to the owner
    const partIds = lineItems.map((l) => l.partId)
    const parts = await db.sparePart.findMany({
      where: { id: { in: partIds }, ownerId: user.ownerId },
      select: { id: true, partNumber: true, name: true, costPrice: true },
    })
    if (parts.length !== partIds.length) {
      return NextResponse.json({ error: 'One or more parts not found' }, { status: 400 })
    }

    // Enrich line items with part info
    const enrichedLines = lineItems.map((l) => {
      const part = parts.find((p) => p.id === l.partId)
      return {
        ...l,
        partNumber: part?.partNumber,
        name: part?.name,
      }
    })

    const po = await db.purchaseOrder.create({
      data: {
        ownerId: user.ownerId,
        shopId: shopId || null,
        supplierId: supplierId || null,
        poNumber,
        status: 'draft',
        totalAmount,
        currency: 'INR',
        notes: notes || '',
        lineItems: JSON.stringify(enrichedLines),
      },
    })

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'purchase',
      entityId: po.id,
      summary: `PO created: ${poNumber} (${lineItems.length} lines, ₹${totalAmount.toFixed(2)})`,
      metadata: { poId: po.id, poNumber, totalAmount, lineItemCount: lineItems.length },
    })

    return NextResponse.json(po, { status: 201 })
  } catch (error) {
    logApiError('purchase-orders/POST', error)
    return NextResponse.json({ error: 'Failed to create purchase order' }, { status: 500 })
  }
}
