/** PDF report generation — P&L, GSTR-1, inventory valuation. */
import PDFDocument from 'pdfkit'

const PAGE_WIDTH = 595.28, PAGE_HEIGHT = 841.89, MARGIN = 50

function formatMoney(amount: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? 'Rs.' : currency
  return `${amount < 0 ? '-' : ''}${symbol} ${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function addHeader(doc: PDFKit.PDFDocument, title: string, shopName: string) {
  doc.fillColor('#4f46e5').rect(0, 0, PAGE_WIDTH, 80).fill()
  doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text(shopName, MARGIN, 30)
  doc.fontSize(11).font('Helvetica').text(title, MARGIN, 52)
  doc.fillColor('#000000')
}

function addFooter(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    doc.fontSize(7).fillColor('#9ca3af').text('Powered by Liafon Stock Management', MARGIN, PAGE_HEIGHT - 40, { align: 'left', width: 200 })
    doc.fontSize(8).fillColor('#9ca3af').text(`Generated on ${new Date().toLocaleString('en-IN')} · Page ${i - range.start + 1} of ${range.count}`, MARGIN, PAGE_HEIGHT - 30, { align: 'center', width: PAGE_WIDTH - MARGIN * 2 })
  }
}

export interface PLReportData { shopName: string; startDate: string; endDate: string; currency: string; revenue: number; costOfGoodsSold: number; grossProfit: number; expenses: number; netProfit: number; lineItems: Array<{ label: string; amount: number; type: 'income' | 'expense' }> }

export function generatePLReport(data: PLReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 100, bottom: 60, left: MARGIN, right: MARGIN }, bufferPages: true })
      const chunks: Buffer[] = []
      doc.on('data', (c) => chunks.push(Buffer.from(c)))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
      addHeader(doc, 'Profit & Loss Statement', data.shopName)
      doc.font('Helvetica-Bold').fontSize(11).text(`Period: ${new Date(data.startDate).toLocaleDateString('en-IN')} to ${new Date(data.endDate).toLocaleDateString('en-IN')}`, MARGIN, 100)
      const lines: [string, string][] = [['Total Revenue', formatMoney(data.revenue, data.currency)], ['Cost of Goods Sold', `(${formatMoney(data.costOfGoodsSold, data.currency)})`], ['Gross Profit', formatMoney(data.grossProfit, data.currency)], ['Operating Expenses', `(${formatMoney(data.expenses, data.currency)})`], ['Net Profit', formatMoney(data.netProfit, data.currency)]]
      let y = 160
      doc.font('Helvetica').fontSize(10)
      for (const [label, value] of lines) { doc.text(label, MARGIN + 12, y); doc.text(value, PAGE_WIDTH - MARGIN - 12 - 150, y, { width: 150, align: 'right' }); y += 20 }
      addFooter(doc); doc.end()
    } catch (err) { reject(err) }
  })
}

export interface GSTReportData { shopName: string; startDate: string; endDate: string; gstin: string; totalSales: number; totalTaxableValue: number; totalCGST: number; totalSGST: number; totalIGST: number; totalTax: number; invoiceCount: number; invoices: Array<{ invoiceNumber: string; date: string; customerName: string; customerGstin: string; taxableValue: number; cgst: number; sgst: number; igst: number; total: number }> }

export function generateGSTReport(data: GSTReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 100, bottom: 60, left: MARGIN, right: MARGIN }, bufferPages: true })
      const chunks: Buffer[] = []
      doc.on('data', (c) => chunks.push(Buffer.from(c)))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
      addHeader(doc, 'GSTR-1 Style Summary', data.shopName)
      doc.font('Helvetica-Bold').fontSize(11).text(`Period: ${new Date(data.startDate).toLocaleDateString('en-IN')} to ${new Date(data.endDate).toLocaleDateString('en-IN')}`, MARGIN, 100)
      addFooter(doc); doc.end()
    } catch (err) { reject(err) }
  })
}

export interface InventoryValuationData { shopName: string; asOfDate: string; currency: string; totalParts: number; totalStockValue: number; totalRetailValue: number; potentialProfit: number; categories: Array<{ category: string; partCount: number; stockUnits: number; stockValue: number; retailValue: number }> }

export function generateInventoryReport(data: InventoryValuationData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 100, bottom: 60, left: MARGIN, right: MARGIN }, bufferPages: true })
      const chunks: Buffer[] = []
      doc.on('data', (c) => chunks.push(Buffer.from(c)))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)
      addHeader(doc, 'Inventory Valuation Report', data.shopName)
      addFooter(doc); doc.end()
    } catch (err) { reject(err) }
  })
}
