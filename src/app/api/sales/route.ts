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
    const {
      partId, quantity, unitPrice: unitPriceOverride,
      customerName, customerPhone, notes,
      taxRate: taxRateOverride, isInterState: isInterStateOverride,
      hsnCode: hsnCodeOverride,
      discount, discountType,
      amountPaid: amountPaidOverride,
      paymentMethod, paymentReference,
      allowBelowCost,
      customerId,
    } = result.data

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

      // ─── Customer credit limit enforcement (Phase 4) ──────────────────
      // If a customerId is provided AND the customer has a creditLimit > 0,
      // check that their outstanding balance + this sale's total won't
      // exceed the limit. Outstanding = sum of (totalPrice - amountPaid)
      // for all their sales where paymentStatus != 'paid'.
      let linkedCustomer: { id: string; name: string; creditLimit: number; state?: string; gstNumber?: string } | null = null
      if (customerId) {
        linkedCustomer = await tx.customer.findFirst({
          where: { id: customerId, ownerId: user.ownerId },
          select: { id: true, name: true, creditLimit: true, state: true, gstNumber: true },
        })
        if (!linkedCustomer) {
          throw new Error('CUSTOMER_NOT_FOUND')
        }

        if (linkedCustomer.creditLimit > 0) {
          // Sum outstanding across all this customer's sales
          const outstandingSales = await tx.sale.aggregate({
            where: {
              customerId,
              paymentStatus: { in: ['partial', 'unpaid'] },
            },
            _sum: { totalPrice: true, amountPaid: true },
          })
          const outstanding =
            (outstandingSales._sum.totalPrice ?? 0) - (outstandingSales._sum.amountPaid ?? 0)

          // We can't know the final sale total yet (GST/discount not computed).
          // Use the worst-case: subtotal = unitPriceOverride × qty
          const estimatedTotal =
            (unitPriceOverride ?? part.sellingPrice) * quantity * (1 + (taxRateOverride ?? 0) / 100)

          if (outstanding + estimatedTotal > linkedCustomer.creditLimit) {
            throw new Error(
              `CREDIT_LIMIT_EXCEEDED:${outstanding}:${estimatedTotal}:${linkedCustomer.creditLimit}`
            )
          }
        }
      }

      const effectiveUnitPrice = unitPriceOverride ?? part.sellingPrice
      const subtotal = effectiveUnitPrice * quantity

      // Business-logic guard: refuse to record a sale at a price below
      // the part's cost price unless the caller explicitly opts in.
      if (!allowBelowCost && effectiveUnitPrice < part.costPrice) {
        throw new Error(
          `BELOW_COST:${effectiveUnitPrice}:${part.costPrice}`
        )
      }

      // ─── Compute discount ─────────────────────────────────────────────
      const discountAmount = computeDiscountAmount(subtotal, discount, discountType)

      // ─── Compute tax (auto-lookup if not provided) ────────────────────
      let taxRate = taxRateOverride
      let hsnCode = hsnCodeOverride

      if (taxRate === undefined) {
        const lookedUp = await lookupTaxRate(user.ownerId, part.category)
        taxRate = lookedUp?.rate ?? 0
        if (!hsnCode && lookedUp?.hsnCode) hsnCode = lookedUp.hsnCode
      }

      // Determine inter-state: if caller didn't specify, try to derive from
      // the customer's GSTIN (if linked) or default to intra-state.
      let isInterState = isInterStateOverride ?? false
      if (isInterStateOverride === undefined) {
        // Look up the shop's GSTIN from AppSettings (key: 'shop_gstin')
        // OR from the Shop model if a shopId is set on the sale
        const shopGstinSetting = await tx.appSetting.findFirst({
          where: { ownerId: user.ownerId, key: 'shop_gstin' },
        })
        const shopStateCode = shopGstinSetting?.value
          ? getStateCodeFromGSTIN(shopGstinSetting.value)
          : null

        // Try to get customer's state code from their GSTIN (if linked)
        const customerStateCode = linkedCustomer?.gstNumber
          ? getStateCodeFromGSTIN(linkedCustomer.gstNumber)
          : null

        // If we have both, use them. Otherwise default to intra-state.
        isInterState = isInterStateSale(shopStateCode, customerStateCode)
      }

      const gst = calculateGST({
        subtotal,
        discountAmount,
        taxRate,
        isInterState,
        currency: part.currency,
      })

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

      // ─── Payment tracking ─────────────────────────────────────────────
      // Default: fully paid. Caller can override to record partial / unpaid.
      const finalTotal = gst.grandTotal
      const amountPaid = amountPaidOverride !== undefined ? amountPaidOverride : finalTotal
      const paymentStatus =
        amountPaid >= finalTotal ? 'paid' :
        amountPaid > 0 ? 'partial' :
        'unpaid'

      const newSale = await tx.sale.create({
        data: {
          ownerId: user.ownerId,
          partId,
          quantity,
          unitPrice: effectiveUnitPrice,
          totalPrice: finalTotal,
          customerName,
          customerPhone,
          notes,
          invoiceNumber,
          customerId: linkedCustomer?.id || null,
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
          hsnCode,
          // Payment tracking
          amountPaid,
          paymentStatus,
        },
      })

      // ─── Record the initial payment (if any) ─────────────────────────
      if (amountPaid > 0) {
        await tx.payment.create({
          data: {
            ownerId: user.ownerId,
            saleId: newSale.id,
            amount: amountPaid,
            method: paymentMethod,
            reference: paymentReference,
            notes: amountPaid >= finalTotal ? 'Full payment on sale' : 'Partial payment on sale',
          },
        })
      }

      const previousStock = part.currentStock
      const newStock = previousStock - quantity

      await tx.sparePart.update({
        where: { id: partId },
        data: { currentStock: newStock },
      })

      await tx.stockLog.create({
        data: {
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

      // ─── FEFO batch deduction (Phase 6) ──────────────────────────────
      // If the part has batches with expiry tracking, deduct from the
      // earliest-expiring batch first. Best-effort — silently skipped if
      // the part has no batches or the FEFO calculation fails.
      try {
        const { suggestBatches, applyFefoPick } = await import('@/lib/fefo')
        const fefo = await suggestBatches(partId, quantity, false)
        if (fefo.suggestions.length > 0 && fefo.totalFulfillable > 0) {
          await applyFefoPick(
            tx,
            fefo.suggestions,
            user.ownerId,
            null,  // shopId — passed via the sale below
            partId,
            newSale.id,
            `Sale ${newSale.invoiceNumber}`
          )
        }
      } catch (fefoErr) {
        // Don't fail the sale if FEFO fails — just log + continue
        console.error('[sales/POST] FEFO pick failed (non-fatal):', fefoErr)
      }

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
        taxRate: sale.taxRate,
        discountAmount: sale.discountAmount,
        paymentStatus: sale.paymentStatus,
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
      if (error.message === 'CUSTOMER_NOT_FOUND') {
        return NextResponse.json({ error: 'Linked customer not found' }, { status: 404 })
      }
      if (error.message.startsWith('CREDIT_LIMIT_EXCEEDED:')) {
        const [, outstanding, newAmount, limit] = error.message.split(':')
        return NextResponse.json(
          {
            error:
              `Credit limit exceeded. Outstanding: ₹${Number(outstanding).toFixed(2)}, ` +
              `this sale: ₹${Number(newAmount).toFixed(2)}, ` +
              `limit: ₹${Number(limit).toFixed(2)}. ` +
              'Record a payment against the customer\'s outstanding balance first, ' +
              'or increase their credit limit.',
            code: 'CREDIT_LIMIT_EXCEEDED',
            outstanding: Number(outstanding),
            newAmount: Number(newAmount),
            limit: Number(limit),
          },
          { status: 400 }
        )
      }
    }
    logApiError('sales/POST', error)
    return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 })
  }
}
