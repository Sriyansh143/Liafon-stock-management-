import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardManager, logApiError, apiBadRequest, apiNotFound } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const saleId = request.nextUrl.searchParams.get('saleId')
    const where: Record<string, unknown> = { ownerId: user.ownerId }
    if (saleId) where.saleId = saleId
    const returns = await db.saleReturn.findMany({ where, include: { sale: { select: { invoiceNumber: true, customerName: true, part: { select: { name: true, partNumber: true } } } } }, orderBy: { createdAt: 'desc' }, take: 200 })
    return NextResponse.json({ returns, total: returns.length })
  } catch (error) { logApiError('sale-returns/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardManager(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const { saleId, quantity, refundAmount, reason, condition, restocked, notes } = body
    if (!saleId) return apiBadRequest('saleId required')
    if (!quantity || quantity <= 0) return apiBadRequest('quantity must be positive')
    if (refundAmount === undefined || refundAmount < 0) return apiBadRequest('refundAmount must be >= 0')
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
    const startOfToday = new Date(today); startOfToday.setHours(0, 0, 0, 0)
    const returnsToday = await db.saleReturn.count({ where: { createdAt: { gte: startOfToday } } })
    const returnNumber = `RET-${dateStr}-${String(returnsToday + 1).padStart(5, '0')}`
    const result = await db.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: saleId, ownerId: user.ownerId }, include: { part: true } })
      if (!sale) throw new Error('SALE_NOT_FOUND')
      if (quantity > sale.quantity) throw new Error('RETURN_QTY_EXCEEDS_SALE_QTY')
      if (restocked) {
        const prev = sale.part.currentStock; const ns = prev + quantity
        await tx.sparePart.update({ where: { id: sale.partId }, data: { currentStock: ns } })
        await tx.stockLog.create({ data: { ownerId: user.ownerId, partId: sale.partId, type: 'RETURN', quantity, previousStock: prev, newStock: ns, referenceId: saleId, notes: `Return ${returnNumber}` } })
      }
      const newAmountPaid = Math.max(0, sale.amountPaid - refundAmount)
      const newPaymentStatus = newAmountPaid >= sale.totalPrice ? 'paid' : newAmountPaid > 0 ? 'partial' : 'unpaid'
      await tx.sale.update({ where: { id: saleId }, data: { amountPaid: newAmountPaid, paymentStatus: newPaymentStatus } })
      return tx.saleReturn.create({ data: { ownerId: user.ownerId, saleId, returnNumber, quantity, refundAmount, reason: reason || '', condition: condition || 'resellable', restocked: restocked ?? true, notes: notes || '', processedById: user.id } })
    })
    await logUserActivity(user, { action: 'CREATE', entityType: 'sale', entityId: saleId, summary: `Return: ${returnNumber} — ${quantity} units, refund ${refundAmount}`, metadata: { saleId, returnNumber, quantity, refundAmount } })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof Error) { if (error.message === 'SALE_NOT_FOUND') return apiNotFound('Sale not found'); if (error.message === 'RETURN_QTY_EXCEEDS_SALE_QTY') return NextResponse.json({ error: 'Return qty exceeds sale qty' }, { status: 400 }) }
    logApiError('sale-returns/POST', error); return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
