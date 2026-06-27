import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAuth, guardManager, logApiError, apiBadRequest } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

/**
 * GET /api/bulk-export?type=<parts|sales|purchases|customers|suppliers>&format=<xlsx|csv>&startDate=...&endDate=...
 *
 * Exports the specified entity type as XLSX or CSV.
 * For sales/purchases, startDate + endDate filter the date range.
 *
 * Returns the file as a downloadable attachment.
 *
 * Uses the existing `xlsx` package — no new deps.
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAuth(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    // Manager+ required for sales/purchases (financial data)
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'parts'
    const format = searchParams.get('format') || 'xlsx'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!['parts', 'sales', 'purchases', 'customers', 'suppliers'].includes(type)) {
      return apiBadRequest('Invalid type. Use parts, sales, purchases, customers, or suppliers.')
    }
    if (!['xlsx', 'csv'].includes(format)) {
      return apiBadRequest('Invalid format. Use xlsx or csv.')
    }

    if (type === 'sales' || type === 'purchases') {
      const [mgrUser, mgrErr] = await guardManager(request)
      if (mgrErr || !mgrUser) return mgrErr ?? NextResponse.json({ error: 'Manager+ access required for sales/purchases export' }, { status: 403 })
    }

    // Fetch data based on type
    let data: Record<string, unknown>[] = []
    let filename = `${type}_export_${new Date().toISOString().slice(0, 10)}`

    if (type === 'parts') {
      const parts = await db.sparePart.findMany({
        where: { ownerId: user.ownerId },
        orderBy: { partNumber: 'asc' },
      })
      data = parts.map((p) => ({
        PartNumber: p.partNumber,
        Name: p.name,
        Category: p.category,
        Brand: p.brand,
        VehicleModel: p.vehicleModel,
        CostPrice: p.costPrice,
        SellingPrice: p.sellingPrice,
        CurrentStock: p.currentStock,
        MinStockLevel: p.minStockLevel,
        Location: p.location,
        BaseUom: p.baseUom,
        Barcode: p.barcode,
        Currency: p.currency,
        IsActive: p.isActive,
      }))
    } else if (type === 'sales') {
      const where: Record<string, unknown> = { ownerId: user.ownerId }
      if (startDate && endDate) {
        where.date = { gte: new Date(startDate), lte: new Date(endDate) }
        filename = `sales_${startDate.slice(0, 10)}_to_${endDate.slice(0, 10)}`
      }
      const sales = await db.sale.findMany({
        where,
        include: { part: { select: { name: true, partNumber: true } } },
        orderBy: { date: 'asc' },
      })
      data = sales.map((s) => ({
        Invoice: s.invoiceNumber,
        Date: s.date,
        Part: s.part?.name,
        PartNumber: s.part?.partNumber,
        Quantity: s.quantity,
        UnitPrice: s.unitPrice,
        TaxableValue: s.taxableValue,
        CGST: s.cgstAmount,
        SGST: s.sgstAmount,
        IGST: s.igstAmount,
        Total: s.totalPrice,
        CustomerName: s.customerName,
        CustomerPhone: s.customerPhone,
        PaymentStatus: s.paymentStatus,
        AmountPaid: s.amountPaid,
        Currency: s.currency,
      }))
    } else if (type === 'purchases') {
      const where: Record<string, unknown> = { ownerId: user.ownerId }
      if (startDate && endDate) {
        where.date = { gte: new Date(startDate), lte: new Date(endDate) }
        filename = `purchases_${startDate.slice(0, 10)}_to_${endDate.slice(0, 10)}`
      }
      const purchases = await db.purchase.findMany({
        where,
        include: { part: { select: { name: true, partNumber: true } } },
        orderBy: { date: 'asc' },
      })
      data = purchases.map((p) => ({
        Invoice: p.invoiceNumber,
        Date: p.date,
        Part: p.part?.name,
        PartNumber: p.part?.partNumber,
        Quantity: p.quantity,
        UnitCost: p.unitCost,
        TotalCost: p.totalCost,
        SupplierName: p.supplierName,
        SupplierPhone: p.supplierPhone,
        Currency: p.currency,
      }))
    } else if (type === 'customers') {
      const customers = await db.customer.findMany({
        where: { ownerId: user.ownerId },
        orderBy: { name: 'asc' },
      })
      data = customers.map((c) => ({
        Name: c.name,
        Phone: c.phone,
        Email: c.email,
        Address: c.address,
        GSTNumber: c.gstNumber,
        State: c.state,
        CreditLimit: c.creditLimit,
        IsActive: c.isActive,
      }))
    } else if (type === 'suppliers') {
      const suppliers = await db.supplier.findMany({
        where: { ownerId: user.ownerId },
        orderBy: { name: 'asc' },
      })
      data = suppliers.map((s) => ({
        Name: s.name,
        Phone: s.phone,
        Email: s.email,
        Address: s.address,
        GSTNumber: s.gstNumber,
        IsActive: s.isActive,
      }))
    }

    // Generate the file
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, type.charAt(0).toUpperCase() + type.slice(1))

    let buffer: Buffer
    let contentType: string
    let fileExtension: string

    if (format === 'xlsx') {
      buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      fileExtension = 'xlsx'
    } else {
      const csv = XLSX.utils.sheet_to_csv(ws)
      buffer = Buffer.from(csv, 'utf-8')
      contentType = 'text/csv'
      fileExtension = 'csv'
    }

    const fullFilename = `${filename}.${fileExtension}`

    await logUserActivity(user, {
      action: 'EXPORT',
      entityType: type === 'parts' ? 'part' : type === 'sales' ? 'sale' : type === 'purchases' ? 'purchase' : 'system',
      summary: `Bulk export: ${fullFilename} (${data.length} rows)`,
      metadata: { type, format, filename: fullFilename, rows: data.length },
    })

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fullFilename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logApiError('bulk-export/GET', error)
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 })
  }
}
