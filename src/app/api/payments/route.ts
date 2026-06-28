import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, guardManager, logApiError } from '@/lib/api-utils'
import { validate, recordPaymentSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const saleId = request.nextUrl.searchParams.get('saleId')
    const customerId = request.nextUrl.searchParams.get('customerId')
    const where: Record<string, unknown> = { ownerId: user.ownerId }
    if (saleId) where.saleId = saleId
    if (customerId) where.customerId = customerId
    const payments = await db.payment.findMany({ where, orderBy: { date: 'desc' }, take: 500 })
    return NextResponse.json({ payments, total: payments.length })
  } catch (error) { logApiError('payments/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const result = validate(recordPaymentSchema, body)
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
    const { saleId, amount, method, reference, notes, date } = result.data
    const payment = await db.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: saleId, ownerId: user.ownerId } })
      if (!sale) throw new Error('SALE_NOT_FOUND')
      const newAmountPaid = sale.amountPaid + amount
      const paymentStatus = newAmountPaid >= sale.totalPrice ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid'
      const newPayment = await tx.payment.create({ data: { ownerId: user.ownerId, saleId, amount, method, reference, notes, date: date ? new Date(date) : new Date() } })
      await tx.sale.update({ where: { id: saleId }, data: { amountPaid: newAmountPaid, paymentStatus } })
      return newPayment
    })
    await logUserActivity(user, { action: 'CREATE', entityType: 'sale', entityId: saleId, summary: `Payment: ${amount} via ${method}`, metadata: { saleId, amount, method } })
    return NextResponse.json(payment, { status: 201 })
  } catch (error) { if (error instanceof Error && error.message === 'SALE_NOT_FOUND') return NextResponse.json({ error: 'Sale not found' }, { status: 404 }); logApiError('payments/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
