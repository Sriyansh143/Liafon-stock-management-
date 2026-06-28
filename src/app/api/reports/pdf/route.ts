import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardAdmin, logApiError } from '@/lib/api-utils'
import { generatePLReport, generateGSTReport, generateInventoryReport, type PLReportData, type GSTReportData, type InventoryValuationData } from '@/lib/pdf'
import { logUserActivity } from '@/lib/activity'

export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Auth required' }, { status: 401 })
    const sp = request.nextUrl.searchParams
    const reportType = sp.get('type') || 'pl'
    const startDate = sp.get('startDate') || new Date(Date.now() - 30 * 86400000).toISOString()
    const endDate = sp.get('endDate') || new Date().toISOString()
    if (!['pl', 'gst', 'inventory'].includes(reportType)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    const shopNameSetting = await db.appSetting.findFirst({ where: { ownerId: user.ownerId, key: 'shop_name' } })
    const shopName = shopNameSetting?.value || 'Liafon Stock Management'
    let pdfBuffer: Buffer; let filename: string
    if (reportType === 'pl') {
      const data = await buildPLData(user.ownerId, shopName, startDate, endDate)
      pdfBuffer = await generatePLReport(data); filename = `PL_${startDate.slice(0, 10)}_to_${endDate.slice(0, 10)}.pdf`
    } else if (reportType === 'gst') {
      const data = await buildGSTData(user.ownerId, shopName, '', startDate, endDate)
      pdfBuffer = await generateGSTReport(data); filename = `GSTR1_${startDate.slice(0, 10)}_to_${endDate.slice(0, 10)}.pdf`
    } else {
      const data = await buildInventoryData(user.ownerId, shopName)
      pdfBuffer = await generateInventoryReport(data); filename = `Inventory_${new Date().toISOString().slice(0, 10)}.pdf`
    }
    await logUserActivity(user, { action: 'EXPORT', entityType: 'sale', summary: `PDF: ${reportType.toUpperCase()}`, metadata: { reportType, filename, sizeBytes: pdfBuffer.length } })
    return new NextResponse(new Uint8Array(pdfBuffer), { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': String(pdfBuffer.length), 'Cache-Control': 'no-store' } })
  } catch (error) { logApiError('reports/pdf/GET', error); return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

async function buildPLData(ownerId: string, shopName: string, startDate: string, endDate: string): Promise<PLReportData> {
  const start = new Date(startDate); const end = new Date(endDate)
  const [sales, purchases] = await Promise.all([db.sale.findMany({ where: { ownerId, date: { gte: start, lte: end } }, include: { part: { select: { name: true, costPrice: true } } } }), db.purchase.findMany({ where: { ownerId, date: { gte: start, lte: end } } })])
  const revenue = sales.reduce((s, x) => s + x.taxableValue, 0)
  const cogs = sales.reduce((s, x) => s + (x.part?.costPrice || 0) * x.quantity, 0)
  const expenses = purchases.reduce((s, x) => s + x.totalCost, 0)
  return { shopName, startDate: start.toISOString(), endDate: end.toISOString(), currency: 'INR', revenue, costOfGoodsSold: cogs, grossProfit: revenue - cogs, expenses, netProfit: revenue - cogs - expenses, lineItems: [{ label: 'Sales Revenue', amount: revenue, type: 'income' }, { label: 'COGS', amount: cogs, type: 'expense' }, { label: 'Gross Profit', amount: revenue - cogs, type: 'income' }, { label: 'Purchases', amount: expenses, type: 'expense' }, { label: 'Net Profit', amount: revenue - cogs - expenses, type: 'income' }] }
}

async function buildGSTData(ownerId: string, shopName: string, gstin: string, startDate: string, endDate: string): Promise<GSTReportData> {
  const start = new Date(startDate); const end = new Date(endDate)
  const sales = await db.sale.findMany({ where: { ownerId, date: { gte: start, lte: end } }, orderBy: { date: 'asc' }, include: { customer: { select: { gstNumber: true } } } })
  return { shopName, startDate: start.toISOString(), endDate: end.toISOString(), gstin, totalSales: sales.reduce((s, x) => s + x.totalPrice, 0), totalTaxableValue: sales.reduce((s, x) => s + x.taxableValue, 0), totalCGST: sales.reduce((s, x) => s + x.cgstAmount, 0), totalSGST: sales.reduce((s, x) => s + x.sgstAmount, 0), totalIGST: sales.reduce((s, x) => s + x.igstAmount, 0), totalTax: sales.reduce((s, x) => s + x.cgstAmount + x.sgstAmount + x.igstAmount, 0), invoiceCount: sales.length, invoices: sales.map((s) => ({ invoiceNumber: s.invoiceNumber, date: s.date.toISOString(), customerName: s.customerName, customerGstin: s.customer?.gstNumber || '', taxableValue: s.taxableValue, cgst: s.cgstAmount, sgst: s.sgstAmount, igst: s.igstAmount, total: s.totalPrice })) }
}

async function buildInventoryData(ownerId: string, shopName: string): Promise<InventoryValuationData> {
  const parts = await db.sparePart.findMany({ where: { ownerId }, select: { category: true, currentStock: true, costPrice: true, sellingPrice: true } })
  const totalParts = parts.length
  const totalStockValue = parts.reduce((s, p) => s + p.costPrice * p.currentStock, 0)
  const totalRetailValue = parts.reduce((s, p) => s + p.sellingPrice * p.currentStock, 0)
  return { shopName, asOfDate: new Date().toISOString(), currency: 'INR', totalParts, totalStockValue, totalRetailValue, potentialProfit: totalRetailValue - totalStockValue, categories: [] }
}
