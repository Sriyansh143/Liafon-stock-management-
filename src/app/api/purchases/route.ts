import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardManager, logApiError } from '@/lib/api-utils'
import { validate, createPurchaseSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'
import type { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50))
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const search = searchParams.get('search')?.trim() || ''

    const where: Prisma.PurchaseWhereInput = {}
    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.date = dateFilter
    }
    if (search) {
      where.OR = [
        { supplierName: { contains: search } },
        { supplierPhone: { contains: search } },
        { notes: { contains: search } },
        { invoiceNumber: { contains: search } },
        { part: { name: { contains: search } } },
        { part: { partNumber: { contains: search } } },
      ]
    }

    const [purchases, total] = await Promise.all([
      db.purchase.findMany({
        where,
        // Select only the part fields the UI actually uses — previously
        // `include: { part: true }` returned every column for every row.
        include: {
          part: {
            select: {
              id: true,
              name: true,
              partNumber: true,
              brand: true,
              category: true,
              costPrice: true,
              currentStock: true,
              currency: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.purchase.count({ where }),
    ])

    return NextResponse.json({ purchases, total, page, limit })
  } catch (error) {
    logApiError('purchases/GET', error)
    return NextResponse.json({ error: 'Failed to fetch purchases' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(createPurchaseSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    const { partId, quantity, unitCost, supplierName, supplierPhone, notes } = result.data

    const purchase = await db.$transaction(async (tx) => {
      const part = await tx.sparePart.findUnique({ where: { id: partId } })
      if (!part) throw new Error('PART_NOT_FOUND')
      if (!part.isActive) throw new Error('PART_INACTIVE')

      const effectiveCost = unitCost ?? part.costPrice
      const totalCost = effectiveCost * quantity

      // Try to link the supplier by name (optional FK)
      let supplierId: string | undefined
      if (supplierName?.trim()) {
        const supplier = await tx.supplier.findFirst({
          where: { name: { equals: supplierName.trim() } },
          select: { id: true },
        })
        supplierId = supplier?.id
      }

      // Generate a per-day sequential purchase invoice number
      const today = new Date()
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
      const startOfToday = new Date(today)
      startOfToday.setHours(0, 0, 0, 0)
      const purchasesToday = await tx.purchase.count({
        where: { createdAt: { gte: startOfToday } },
      })
      const seq = String(purchasesToday + 1).padStart(5, '0')
      const invoiceNumber = `PUR-${dateStr}-${seq}`

      const newPurchase = await tx.purchase.create({        data: {
          ownerId: user.ownerId,
          partId,
          quantity,
          unitCost: effectiveCost,
          totalCost,
          supplierName,
          supplierPhone,
          notes,
          invoiceNumber,
          ...(supplierId ? { supplierId } : {}),
        },
      })

      const previousStock = part.currentStock
      const newStock = previousStock + quantity

      await tx.sparePart.update({
        where: { id: partId },
        data: {
          ownerId: user.ownerId,
          currentStock: newStock,
          costPrice: effectiveCost,
        },
      })

      await tx.stockLog.create({        data: {
          ownerId: user.ownerId,
          partId,
          type: 'PURCHASE',
          quantity,
          previousStock,
          newStock,
          referenceId: newPurchase.id,
          notes: `Purchase from ${supplierName || 'Supplier'}`,
        },
      })

      return newPurchase
    })

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'purchase',
      entityId: purchase.id,
      summary: `Purchase ${purchase.invoiceNumber || purchase.id.slice(-6)} — ${quantity} × from ${supplierName || 'Supplier'}`,
      metadata: {
        ownerId: user.ownerId,
        invoiceNumber: purchase.invoiceNumber,
        partId,
        quantity,
        totalCost: purchase.totalCost,
      },
    })

    return NextResponse.json(purchase, { status: 201 })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'PART_NOT_FOUND') {
        return NextResponse.json({ error: 'Part not found' }, { status: 404 })
      }
      if (error.message === 'PART_INACTIVE') {
        return NextResponse.json({ error: 'Part is no longer active' }, { status: 400 })
      }
    }
    logApiError('purchases/POST', error)
    return NextResponse.json({ error: 'Failed to create purchase' }, { status: 500 })
  }
}
