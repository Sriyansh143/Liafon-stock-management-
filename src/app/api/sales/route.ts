import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { guardAuth, logApiError } from '@/lib/api-utils'
import { validate, createSaleSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'
import { calculateGST, computeDiscountAmount, lookupTaxRate, isInterStateSale, getStateCodeFromGSTIN } from '@/lib/gst'
import type { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50))
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const search = searchParams.get('search')?.trim() || ''

    const where: Prisma.SaleWhereInput = {}
    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.date = dateFilter
    }
    if (search) {
      where.OR = [
        { customerName: { contains: search } },
        { customerPhone: { contains: search } },
        { notes: { contains: search } },
        { invoiceNumber: { contains: search } },
        { part: { name: { contains: search } } },
        { part: { partNumber: { contains: search } } },
      ]
    }

    const [sales, total] = await Promise.all([
      db.sale.findMany({
        where,
        // Select only the part fields the UI actually uses — previously
        // `include: { part: true }` returned every column (description,
        // barcode, vehicleModel, etc.) for every sale row.
        include: {
          part: {
            select: {
              id: true,
              name: true,
              partNumber: true,
              brand: true,
              category: true,
              sellingPrice: true,
              currentStock: true,
              currency: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.sale.count({ where }),
    ])

    return NextResponse.json({ sales, total, page, limit })
  } catch (error) {
    logApiError('sales/GET', error)
    return NextResponse.json({ error: 'Failed to fetch sales' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    // ── Storage limit check ──
    const { checkStorageLimit } = await import('@/lib/plan-limits')
    const saleLimit = await checkStorageLimit(user.ownerId, 'sales')
    if (!saleLimit.allowed) {
      return NextResponse.json(
        { error: saleLimit.message, upgradeRequired: true, code: 'STORAGE_LIMIT_EXCEEDED' },
        { status: 402 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(createSaleSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    const { partId, quantity, unitPrice, customerName, customerPhone, notes } = result.data

    // Atomic transaction: verify stock + create sale + decrement stock + log.
    // On SQLite the single-writer lock prevents the race; on Postgres this
    // would still need a true SELECT FOR UPDATE — see Prisma's
    // `extension-readReplicas` / interactive-tx docs.
    const sale = await db.$transaction(async (tx) => {
      const part = await tx.sparePart.findUnique({
        where: { id: partId },
      })

      if (!part) {
        throw new Error('PART_NOT_FOUND')
      }
      if (!part.isActive) {
        throw new Error('PART_INACTIVE')
      }
      if (part.currentStock < quantity) {
        throw new Error(`INSUFFICIENT_STOCK:${part.currentStock}`)
      }

      const effectiveUnitPrice = unitPrice ?? part.sellingPrice
      const subtotal = effectiveUnitPrice * quantity

      // ─── GST calculation (Phase 3) ─────────────────────────────────────
      // Auto-lookup tax rate from TaxRate table by part category, or use
      // the rate passed in the request body. Compute discount, then GST.
      const discount = Number((body as { discount?: number })?.discount || 0)
      const discountType = (body as { discountType?: string })?.discountType === 'percent' ? 'percent' : 'flat'
      const discountAmount = computeDiscountAmount(subtotal, discount, discountType)

      let taxRate = Number((body as { taxRate?: number })?.taxRate)
      if (!Number.isFinite(taxRate)) {
        const lookedUp = await lookupTaxRate(user.ownerId, part.category)
        taxRate = lookedUp?.rate ?? 0
      }
      const isInterState = Boolean((body as { isInterState?: boolean })?.isInterState)
      const gst = calculateGST({ subtotal, discountAmount, taxRate, isInterState, currency: part.currency })
      const totalPrice = gst.grandTotal

      // Business-logic guard: refuse below-cost sales
      const allowBelowCost = Boolean((body as { allowBelowCost?: unknown })?.allowBelowCost === true)
      if (!allowBelowCost && effectiveUnitPrice < part.costPrice) {
        throw new Error(`BELOW_COST:${effectiveUnitPrice}:${part.costPrice}`)
      }

      // Generate a collision-resistant invoice number using a per-day
      // counter instead of Math.random (which had only 90k values and
      // no uniqueness guarantee).
      const today = new Date()
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
      const startOfToday = new Date(today)
      startOfToday.setHours(0, 0, 0, 0)
      const salesToday = await tx.sale.count({
        where: { createdAt: { gte: startOfToday } },
      })
      const seq = String(salesToday + 1).padStart(5, '0')
      const invoiceNumber = `INV-${dateStr}-${seq}`

      const newSale = await tx.sale.create({
        data: {
          ownerId: user.ownerId,
          partId,
          quantity,
          unitPrice: effectiveUnitPrice,
          totalPrice,
          customerName,
          customerPhone,
          notes,
          invoiceNumber,
          // GST fields
          taxRate: gst.taxRate,
          cgstRate: gst.cgstRate,
          cgstAmount: gst.cgstAmount,
          sgstRate: gst.sgstRate,
          sgstAmount: gst.sgstAmount,
          igstRate: gst.igstRate,
          igstAmount: gst.igstAmount,
          taxableValue: gst.taxableValue,
          // Discount fields
          discount,
          discountType,
          discountAmount,
          // Payment tracking (default: fully paid)
          amountPaid: totalPrice,
          paymentStatus: 'paid',
        },
      })

      const previousStock = part.currentStock
      const newStock = previousStock - quantity

      await tx.sparePart.update({
        where: { id: partId },
        data: { currentStock: newStock },
      })

      await tx.stockLog.create({        data: {
          ownerId: user.ownerId,
          partId,
          type: 'SALE',
          quantity,
          previousStock,
          newStock,
          referenceId: newSale.id,
          notes: `Sale to ${customerName || 'Walk-in customer'}`,
        },
      })

      return newSale
    })

    // Best-effort activity logging — reuse `user` from guardAuth instead
    // of doing a second getSessionUser() DB round-trip.
    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'sale',
      entityId: sale.id,
      summary: `Sale ${sale.invoiceNumber || sale.id.slice(-6)} — ${quantity} × to ${customerName || 'Walk-in'}`,
      metadata: {
        ownerId: user.ownerId,
        invoiceNumber: sale.invoiceNumber,
        partId,
        quantity,
        totalPrice: sale.totalPrice,
      },
    })

    return NextResponse.json(sale, { status: 201 })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'PART_NOT_FOUND') {
        return NextResponse.json({ error: 'Part not found' }, { status: 404 })
      }
      if (error.message === 'PART_INACTIVE') {
        return NextResponse.json({ error: 'Part is no longer active' }, { status: 400 })
      }
      if (error.message.startsWith('INSUFFICIENT_STOCK:')) {
        const available = error.message.split(':')[1]
        return NextResponse.json(
          { error: `Insufficient stock. Available: ${available}` },
          { status: 400 }
        )
      }
      if (error.message.startsWith('BELOW_COST:')) {
        const [, unitP, costP] = error.message.split(':')
        return NextResponse.json(
          {
            error:
              `Sale price (₹${unitP}) is below cost price (₹${costP}). ` +
              'Pass `allowBelowCost: true` in the request body to override.',
            code: 'BELOW_COST',
            unitPrice: Number(unitP),
            costPrice: Number(costP),
          },
          { status: 400 }
        )
      }
    }
    logApiError('sales/POST', error)
    return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
  }
}
