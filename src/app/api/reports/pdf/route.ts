import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAdmin, logApiError } from '@/lib/api-utils'
import {
  generatePLReport,
  generateGSTReport,
  generateInventoryReport,
  type PLReportData,
  type GSTReportData,
  type InventoryValuationData,
} from '@/lib/pdf'
import { logUserActivity } from '@/lib/activity'

/**
 * GET /api/reports/pdf?ownerId=<id>&type=<pl|gst|inventory>&startDate=...&endDate=...
 *
 * Generates a PDF report and returns it as a downloadable file.
 *
 * Report types:
 *   - pl         : Profit & Loss statement (date range)
 *   - gst        : GSTR-1 style GST summary (date range)
 *   - inventory  : Inventory valuation (as-of date)
 *
 * The ownerId is taken from the authenticated user (admin+), so the
 * caller can't snoop on other tenants' data.
 */

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const searchParams = request.nextUrl.searchParams
    const reportType = searchParams.get('type') || 'pl'
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = searchParams.get('endDate') || new Date().toISOString()

    // Validate report type
    if (!['pl', 'gst', 'inventory'].includes(reportType)) {
      return NextResponse.json({ error: 'Invalid report type. Use pl, gst, or inventory.' }, { status: 400 })
    }

    // Get shop name from settings
    const shopNameSetting = await db.appSetting.findFirst({
      where: { ownerId: user.ownerId, key: 'shop_name' },
    })
    const shopName = shopNameSetting?.value || 'Liafon Stock Management'

    const shopGstinSetting = await db.appSetting.findFirst({
      where: { ownerId: user.ownerId, key: 'shop_gstin' },
    })

    let pdfBuffer: Buffer
    let filename: string

    if (reportType === 'pl') {
      const data = await buildPLData(user.ownerId, shopName, startDate, endDate)
      pdfBuffer = await generatePLReport(data)
      filename = `PL_${startDate.slice(0, 10)}_to_${endDate.slice(0, 10)}.pdf`
    } else if (reportType === 'gst') {
      const data = await buildGSTData(user.ownerId, shopName, shopGstinSetting?.value || '', startDate, endDate)
      pdfBuffer = await generateGSTReport(data)
      filename = `GSTR1_${startDate.slice(0, 10)}_to_${endDate.slice(0, 10)}.pdf`
    } else {
      const data = await buildInventoryData(user.ownerId, shopName)
      pdfBuffer = await generateInventoryReport(data)
      filename = `Inventory_${new Date().toISOString().slice(0, 10)}.pdf`
    }

    // Log the report generation
    await logUserActivity(user, {
      action: 'EXPORT',
      entityType: 'sale',
      summary: `Generated PDF report: ${reportType.toUpperCase()}`,
      metadata: {
        reportType,
        startDate,
        endDate,
        filename,
        sizeBytes: pdfBuffer.length,
      },
    })

    // Return as downloadable PDF — convert Buffer to Uint8Array for NextResponse
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logApiError('reports/pdf/GET', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF report', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// ─── Report data builders ───────────────────────────────────────────────────

async function buildPLData(
  ownerId: string,
  shopName: string,
  startDate: string,
  endDate: string
): Promise<PLReportData> {
  const start = new Date(startDate)
  const end = new Date(endDate)

  // Fetch sales + purchases in the date range
  const [sales, purchases] = await Promise.all([
    db.sale.findMany({
      where: { ownerId, date: { gte: start, lte: end } },
      include: { part: { select: { name: true, costPrice: true } } },
    }),
    db.purchase.findMany({
      where: { ownerId, date: { gte: start, lte: end } },
    }),
  ])

  // Revenue = sum of sale taxable values (post-discount, pre-tax)
  const revenue = sales.reduce((sum, s) => sum + s.taxableValue, 0)
  // COGS = sum of (part.costPrice * quantity) for each sale
  const costOfGoodsSold = sales.reduce(
    (sum, s) => sum + (s.part?.costPrice || 0) * s.quantity,
    0
  )
  const grossProfit = revenue - costOfGoodsSold
  // Operating expenses = total purchases (simplified — assumes all purchases are expenses)
  const expenses = purchases.reduce((sum, p) => sum + p.totalCost, 0)
  const netProfit = grossProfit - expenses

  // Build line items for the detailed table
  const lineItems: PLReportData['lineItems'] = [
    { label: 'Sales Revenue', amount: revenue, type: 'income' },
    { label: 'Cost of Goods Sold', amount: costOfGoodsSold, type: 'expense' },
    { label: 'Gross Profit', amount: grossProfit, type: 'income' },
    { label: 'Purchases (Operating)', amount: expenses, type: 'expense' },
    { label: 'Net Profit', amount: netProfit, type: 'income' },
  ]

  return {
    shopName,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    currency: 'INR',
    revenue,
    costOfGoodsSold,
    grossProfit,
    expenses,
    netProfit,
    lineItems,
  }
}

async function buildGSTData(
  ownerId: string,
  shopName: string,
  gstin: string,
  startDate: string,
  endDate: string
): Promise<GSTReportData> {
  const start = new Date(startDate)
  const end = new Date(endDate)

  const sales = await db.sale.findMany({
    where: { ownerId, date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
    include: {
      customer: { select: { gstNumber: true } },
    },
  })

  const totalSales = sales.reduce((sum, s) => sum + s.totalPrice, 0)
  const totalTaxableValue = sales.reduce((sum, s) => sum + s.taxableValue, 0)
  const totalCGST = sales.reduce((sum, s) => sum + s.cgstAmount, 0)
  const totalSGST = sales.reduce((sum, s) => sum + s.sgstAmount, 0)
  const totalIGST = sales.reduce((sum, s) => sum + s.igstAmount, 0)
  const totalTax = totalCGST + totalSGST + totalIGST

  return {
    shopName,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    gstin,
    totalSales,
    totalTaxableValue,
    totalCGST,
    totalSGST,
    totalIGST,
    totalTax,
    invoiceCount: sales.length,
    invoices: sales.map((s) => ({
      invoiceNumber: s.invoiceNumber,
      date: s.date.toISOString(),
      customerName: s.customerName,
      // Use the linked customer's GSTIN if available
      customerGstin: s.customer?.gstNumber || '',
      taxableValue: s.taxableValue,
      cgst: s.cgstAmount,
      sgst: s.sgstAmount,
      igst: s.igstAmount,
      total: s.totalPrice,
    })),
  }
}

async function buildInventoryData(
  ownerId: string,
  shopName: string
): Promise<InventoryValuationData> {
  const parts = await db.sparePart.findMany({
    where: { ownerId },
    select: {
      category: true,
      currentStock: true,
      costPrice: true,
      sellingPrice: true,
    },
  })

  const totalParts = parts.length
  const totalStockValue = parts.reduce((sum, p) => sum + p.costPrice * p.currentStock, 0)
  const totalRetailValue = parts.reduce((sum, p) => sum + p.sellingPrice * p.currentStock, 0)
  const potentialProfit = totalRetailValue - totalStockValue

  // Group by category
  const categoryMap = new Map<string, { partCount: number; stockUnits: number; stockValue: number; retailValue: number }>()
  for (const p of parts) {
    const cat = p.category || 'Uncategorized'
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { partCount: 0, stockUnits: 0, stockValue: 0, retailValue: 0 })
    }
    const entry = categoryMap.get(cat)!
    entry.partCount++
    entry.stockUnits += p.currentStock
    entry.stockValue += p.costPrice * p.currentStock
    entry.retailValue += p.sellingPrice * p.currentStock
  }

  const categories = Array.from(categoryMap.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.stockValue - a.stockValue)

  return {
    shopName,
    asOfDate: new Date().toISOString(),
    currency: 'INR',
    totalParts,
    totalStockValue,
    totalRetailValue,
    potentialProfit,
    categories,
  }
}
