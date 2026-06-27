import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, guardManager, logApiError, apiBadRequest, apiNotFound } from '@/lib/api-utils'
import { validate, recordPaymentSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'

/**
 * /api/payments — record and list payments against sales.
 *
 * GET  /api/payments?saleId=<id>           — list payments for a sale
 * POST /api/payments { saleId, amount, method, ... }  — record a new payment
 *
 * Recording a payment:
 *   - Validates the sale exists + belongs to the caller's tenant
 *   - Records the Payment row
 *   - Updates the sale's amountPaid + paymentStatus atomically
 *   - Logs activity
 *
 * Multiple payments against the same sale are allowed (installments).
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const saleId = request.nextUrl.searchParams.get('saleId')
    const customerId = request.nextUrl.searchParams.get('customerId')

    const where: Record<string, unknown> = { ownerId: user.ownerId }
    if (saleId) where.saleId = saleId
    if (customerId) where.customerId = customerId

    const payments = await db.payment.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 500,   // cap for safety
    })

    return NextResponse.json({ payments, total: payments.length })
  } catch (error) {
    logApiError('payments/GET', error)
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const result = validate(recordPaymentSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    const { saleId, amount, method, reference, notes, date } = result.data

    // Atomic transaction: verify sale + record payment + update sale.amountPaid
    const payment = await db.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: saleId } })
      if (!sale) throw new Error('SALE_NOT_FOUND')
      if (sale.ownerId !== user.ownerId) throw new Error('SALE_NOT_FOUND')  // don't leak existence

      const newAmountPaid = sale.amountPaid + amount
      const paymentStatus =
        newAmountPaid >= sale.totalPrice ? 'paid' :
        newAmountPaid > 0 ? 'partial' :
        'unpaid'

      // Create the payment record
      const newPayment = await tx.payment.create({
        data: {
          ownerId: user.ownerId,
          saleId,
          amount,
          method,
          reference,
          notes,
          date: date ? new Date(date) : new Date(),
        },
      })

      // Update the sale's running totals
      await tx.sale.update({
        where: { id: saleId },
        data: {
          amountPaid: newAmountPaid,
          paymentStatus,
        },
      })

      return newPayment
    })

    await logUserActivity(user, {
      action: 'CREATE',
      entityType: 'sale',
      entityId: saleId,
      summary: `Payment recorded: ₹${amount} via ${method}`,
      metadata: { saleId, amount, method, paymentId: payment.id },
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'SALE_NOT_FOUND') {
      return apiNotFound('Sale not found')
    }
    logApiError('payments/POST', error)
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
  }
}
