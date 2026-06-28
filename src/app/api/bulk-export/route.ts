import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, guardManager, logApiError, apiBadRequest } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const sp = request.nextUrl.searchParams
    const type = sp.get('type') || 'parts'; const format = sp.get('format') || 'xlsx'
    const startDate = sp.get('startDate'); const endDate = sp.get('endDate')
    if (!['parts', 'sales', 'purchases', 'customers', 'suppliers'].includes(type)) return apiBadRequest('Invalid type')
    if (!['xlsx', 'csv'].includes(format)) return apiBadRequest('Invalid format')
    if (type === 'sales' || type === 'purchases') { const [, e] = await guardManager(request); if (e) return e }

    let data: Record<string, unknown>[] = []; let filename = `${type}_export_${new Date().toISOString().slice(0,10)}`
    if (type === 'parts') { const parts = await db.sparePart.findMany({ where: { ownerId: user.ownerId }, orderBy: { partNumber: 'asc' } }); data = parts.map(p => ({ PartNumber: p.partNumber, Name: p.name, Category: p.category, Brand: p.brand, CostPrice: p.costPrice, SellingPrice: p.sellingPrice, CurrentStock: p.currentStock, MinStockLevel: p.minStockLevel, Location: p.location, Barcode: p.barcode, IsActive: p.isActive })) }
    else if (type === 'sales') { const where: Record<string, unknown> = { ownerId: user.ownerId }; if (startDate && endDate) { where.date = { gte: new Date(startDate), lte: new Date(endDate) }; filename = `sales_${startDate.slice(0,10)}_to_${endDate.slice(0,10)}` } const sales = await db.sale.findMany({ where, include: { part: { select: { name: true, partNumber: true } } }, orderBy: { date: 'asc' } }); data = sales.map(s => ({ Invoice: s.invoiceNumber, Date: s.date, Part: s.part?.name, Quantity: s.quantity, Total: s.totalPrice, Customer: s.customerName, PaymentStatus: s.paymentStatus })) }
    else if (type === 'purchases') { const where: Record<string, unknown> = { ownerId: user.ownerId }; if (startDate && endDate) { where.date = { gte: new Date(startDate), lte: new Date(endDate) }; filename = `purchases_${startDate.slice(0,10)}_to_${endDate.slice(0,10)}` } const purchases = await db.purchase.findMany({ where, include: { part: { select: { name: true, partNumber: true } } }, orderBy: { date: 'asc' } }); data = purchases.map(p => ({ Invoice: p.invoiceNumber, Date: p.date, Part: p.part?.name, Quantity: p.quantity, TotalCost: p.totalCost, Supplier: p.supplierName })) }
    else if (type === 'customers') { const customers = await db.customer.findMany({ where: { ownerId: user.ownerId }, orderBy: { name: 'asc' } }); data = customers.map(c => ({ Name: c.name, Phone: c.phone, Email: c.email, GSTNumber: c.gstNumber, State: c.state, CreditLimit: c.creditLimit, IsActive: c.isActive })) }
    else if (type === 'suppliers') { const suppliers = await db.supplier.findMany({ where: { ownerId: user.ownerId }, orderBy: { name: 'asc' } }); data = suppliers.map(s => ({ Name: s.name, Phone: s.phone, Email: s.email, GSTNumber: s.gstNumber, IsActive: s.isActive })) }

    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, type.charAt(0).toUpperCase() + type.slice(1))
    let buffer: Buffer; let contentType: string; let ext: string
    if (format === 'xlsx') { buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer; contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; ext = 'xlsx' }
    else { const csv = XLSX.utils.sheet_to_csv(ws); buffer = Buffer.from(csv, 'utf-8'); contentType = 'text/csv'; ext = 'csv' }
    const fullFilename = `${filename}.${ext}`
    await logUserActivity(user, { action: 'EXPORT', entityType: 'system', summary: `Export: ${fullFilename} (${data.length} rows)`, metadata: { type, format, filename: fullFilename, rows: data.length } })
    return new NextResponse(new Uint8Array(buffer), { status: 200, headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${fullFilename}"`, 'Content-Length': String(buffer.length), 'Cache-Control': 'no-store' } })
  } catch (error) { logApiError('bulk-export/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
