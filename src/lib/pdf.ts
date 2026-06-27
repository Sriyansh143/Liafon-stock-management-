/**
 * PDF report generation for Liafon Stock Management.
 *
 * Uses `pdfkit` to generate server-side PDFs for:
 *   - Profit & Loss statement (date range)
 *   - GST summary (GSTR-1 style: invoices + tax breakup)
 *   - Inventory valuation
 *
 * PDFkit is the only major Node.js PDF library that:
 *   - Doesn't require a headless browser (unlike Puppeteer)
 *   - Works in Vercel serverless (pure JS, no native deps)
 *   - Is reasonably small (~500 KB)
 *
 * Font: We use the built-in Helvetica — no custom font files needed.
 * For Indian Rupee symbol (₹) support, we use the unicode escape; PDFKit's
 * built-in Helvetica uses WinAnsi encoding which doesn't include ₹. We
 * work around this by using "Rs." instead of ₹ in PDFs (the symbol renders
 * as a blank box in WinAnsi). If you need true ₹ rendering, ship a TTF
 * like NotoSans and call doc.registerFont() — see PDFKit docs.
 */

import PDFDocument from 'pdfkit'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PLLineItem {
  label: string
  amount: number
  /** 'income' or 'expense' — affects sign and grouping. */
  type: 'income' | 'expense'
}

export interface PLReportData {
  shopName: string
  startDate: string
  endDate: string
  currency: string
  revenue: number
  costOfGoodsSold: number
  grossProfit: number
  expenses: number
  netProfit: number
  lineItems: PLLineItem[]
}

export interface GSTReportData {
  shopName: string
  startDate: string
  endDate: string
  gstin: string
  totalSales: number
  totalTaxableValue: number
  totalCGST: number
  totalSGST: number
  totalIGST: number
  totalTax: number
  invoiceCount: number
  /** Per-invoice breakdown for the GSTR-1 table. */
  invoices: Array<{
    invoiceNumber: string
    date: string
    customerName: string
    customerGstin: string
    taxableValue: number
    cgst: number
    sgst: number
    igst: number
    total: number
  }>
}

export interface InventoryValuationData {
  shopName: string
  asOfDate: string
  currency: string
  totalParts: number
  totalStockValue: number   // At cost price
  totalRetailValue: number  // At selling price
  potentialProfit: number
  categories: Array<{
    category: string
    partCount: number
    stockUnits: number
    stockValue: number
    retailValue: number
  }>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595.28   // A4 in points (72 dpi)
const PAGE_HEIGHT = 841.89
const MARGIN = 50

function formatMoney(amount: number, currency: string = 'INR'): string {
  // Use "Rs." instead of ₹ for PDF (Helvetica WinAnsi doesn't have ₹)
  const symbol = currency === 'INR' ? 'Rs.' : currency
  const formatted = Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${amount < 0 ? '-' : ''}${symbol} ${formatted}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

/** Add a header (shop name + report title) + footer with page numbers. */
function addHeader(doc: PDFKit.PDFDocument, title: string, shopName: string) {
  // Header band
  doc
    .fillColor('#4f46e5')
    .rect(0, 0, PAGE_WIDTH, 80)
    .fill()

  doc
    .fillColor('#ffffff')
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(shopName, MARGIN, 30)

  doc
    .fontSize(11)
    .font('Helvetica')
    .text(title, MARGIN, 52)

  doc.fillColor('#000000')
}

function addFooter(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    doc
      .fontSize(8)
      .fillColor('#9ca3af')
      .text(
        `Generated on ${new Date().toLocaleString('en-IN')} · Page ${i - range.start + 1} of ${range.count}`,
        MARGIN,
        PAGE_HEIGHT - 30,
        { align: 'center', width: PAGE_WIDTH - MARGIN * 2 }
      )
  }
}

function drawTable(
  doc: PDFKit.PDFDocument,
  startX: number,
  startY: number,
  columns: Array<{ header: string; width: number; align?: 'left' | 'right' }>,
  rows: Array<string[]>
): number {
  const rowHeight = 20
  const headerHeight = 22

  // Header row
  doc.font('Helvetica-Bold').fontSize(9)
  let x = startX
  for (const col of columns) {
    doc
      .fillColor('#ffffff')
      .rect(x, startY, col.width, headerHeight)
      .fill('#4f46e5')
    doc
      .fillColor('#ffffff')
      .text(col.header, x + 4, startY + 6, {
        width: col.width - 8,
        align: col.align || 'left',
      })
    x += col.width
  }

  // Data rows
  doc.font('Helvetica').fontSize(9).fillColor('#000000')
  let y = startY + headerHeight
  for (let i = 0; i < rows.length; i++) {
    // Zebra striping
    if (i % 2 === 1) {
      doc.rect(startX, y, columns.reduce((sum, c) => sum + c.width, 0), rowHeight).fill('#f9fafb')
      doc.fillColor('#000000')
    }

    x = startX
    for (let j = 0; j < columns.length; j++) {
      doc.text(rows[i][j] ?? '', x + 4, y + 4, {
        width: columns[j].width - 8,
        align: columns[j].align || 'left',
      })
      x += columns[j].width
    }
    y += rowHeight

    // Add page break if needed
    if (y > PAGE_HEIGHT - 80) {
      doc.addPage()
      y = MARGIN
    }
  }

  return y
}

// ─── Report generators ──────────────────────────────────────────────────────

/**
 * Generate a Profit & Loss statement PDF.
 * Returns a Buffer that can be streamed as the API response body.
 */
export function generatePLReport(data: PLReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 100, bottom: 60, left: MARGIN, right: MARGIN },
        bufferPages: true,
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      addHeader(doc, `Profit & Loss Statement`, data.shopName)

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(`Period: ${formatDate(data.startDate)} to ${formatDate(data.endDate)}`, MARGIN, 100)

      doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
      doc.text(`Currency: ${data.currency}`, MARGIN, 118)
      doc.moveDown(2)

      // Summary box
      const summaryY = 160
      doc.fillColor('#f3f4f6').rect(MARGIN, summaryY, PAGE_WIDTH - MARGIN * 2, 100).fill()
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10)
      doc.text('Summary', MARGIN + 12, summaryY + 12)

      doc.font('Helvetica').fontSize(10)
      const summaryLines: Array<[string, string]> = [
        ['Total Revenue', formatMoney(data.revenue, data.currency)],
        ['Cost of Goods Sold', `(${formatMoney(data.costOfGoodsSold, data.currency)})`],
        ['Gross Profit', formatMoney(data.grossProfit, data.currency)],
        ['Operating Expenses', `(${formatMoney(data.expenses, data.currency)})`],
        ['Net Profit', formatMoney(data.netProfit, data.currency)],
      ]
      let lineY = summaryY + 32
      for (const [label, value] of summaryLines) {
        doc.text(label, MARGIN + 12, lineY)
        doc.text(value, PAGE_WIDTH - MARGIN - 12 - 150, lineY, { width: 150, align: 'right' })
        lineY += 13
      }

      // Detailed line items table
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
      doc.text('Detailed Breakdown', MARGIN, summaryY + 120)

      const tableY = summaryY + 145
      drawTable(
        doc,
        MARGIN,
        tableY,
        [
          { header: 'Description', width: 280 },
          { header: 'Type', width: 80, align: 'left' },
          { header: 'Amount', width: 135, align: 'right' },
        ],
        data.lineItems.map((item) => [
          item.label,
          item.type === 'income' ? 'Income' : 'Expense',
          formatMoney(item.amount, data.currency),
        ])
      )

      addFooter(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Generate a GSTR-1 style GST summary PDF.
 * Includes a per-invoice table suitable for Indian GST filing.
 */
export function generateGSTReport(data: GSTReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 100, bottom: 60, left: MARGIN, right: MARGIN },
        bufferPages: true,
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      addHeader(doc, `GSTR-1 Style Summary`, data.shopName)

      doc.font('Helvetica-Bold').fontSize(11)
      doc.text(`Period: ${formatDate(data.startDate)} to ${formatDate(data.endDate)}`, MARGIN, 100)

      doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
      doc.text(`GSTIN: ${data.gstin || 'Not configured'}`, MARGIN, 118)
      doc.moveDown(2)

      // Summary box
      const summaryY = 160
      doc.fillColor('#f3f4f6').rect(MARGIN, summaryY, PAGE_WIDTH - MARGIN * 2, 100).fill()
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10)
      doc.text('Tax Liability Summary', MARGIN + 12, summaryY + 12)

      doc.font('Helvetica').fontSize(10)
      const summaryLines: Array<[string, string]> = [
        ['Total Invoices', String(data.invoiceCount)],
        ['Total Taxable Value', formatMoney(data.totalTaxableValue)],
        ['Total CGST', formatMoney(data.totalCGST)],
        ['Total SGST', formatMoney(data.totalSGST)],
        ['Total IGST', formatMoney(data.totalIGST)],
        ['Total Tax Payable', formatMoney(data.totalTax)],
      ]
      let lineY = summaryY + 32
      for (const [label, value] of summaryLines) {
        doc.text(label, MARGIN + 12, lineY)
        doc.text(value, PAGE_WIDTH - MARGIN - 12 - 150, lineY, { width: 150, align: 'right' })
        lineY += 13
      }

      // Detailed invoices table
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
      doc.text('Invoice-wise Breakdown', MARGIN, summaryY + 120)

      const tableY = summaryY + 145
      drawTable(
        doc,
        MARGIN,
        tableY,
        [
          { header: 'Invoice #', width: 90 },
          { header: 'Date', width: 65 },
          { header: 'Customer', width: 100 },
          { header: 'Taxable', width: 70, align: 'right' },
          { header: 'CGST', width: 55, align: 'right' },
          { header: 'SGST', width: 55, align: 'right' },
          { header: 'IGST', width: 55, align: 'right' },
        ],
        data.invoices.map((inv) => [
          inv.invoiceNumber,
          formatDate(inv.date),
          inv.customerName.slice(0, 18),
          formatMoney(inv.taxableValue),
          formatMoney(inv.cgst),
          formatMoney(inv.sgst),
          formatMoney(inv.igst),
        ])
      )

      addFooter(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Generate an inventory valuation PDF report.
 */
export function generateInventoryReport(data: InventoryValuationData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 100, bottom: 60, left: MARGIN, right: MARGIN },
        bufferPages: true,
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      addHeader(doc, `Inventory Valuation Report`, data.shopName)

      doc.font('Helvetica-Bold').fontSize(11)
      doc.text(`As of: ${formatDate(data.asOfDate)}`, MARGIN, 100)

      doc.font('Helvetica').fontSize(9).fillColor('#6b7280')
      doc.text(`Currency: ${data.currency}`, MARGIN, 118)
      doc.moveDown(2)

      // Summary box
      const summaryY = 160
      doc.fillColor('#f3f4f6').rect(MARGIN, summaryY, PAGE_WIDTH - MARGIN * 2, 80).fill()
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(10)
      doc.text('Summary', MARGIN + 12, summaryY + 12)

      doc.font('Helvetica').fontSize(10)
      const summaryLines: Array<[string, string]> = [
        ['Total Parts', String(data.totalParts)],
        ['Stock Value (at cost)', formatMoney(data.totalStockValue, data.currency)],
        ['Retail Value (at selling price)', formatMoney(data.totalRetailValue, data.currency)],
        ['Potential Profit', formatMoney(data.potentialProfit, data.currency)],
      ]
      let lineY = summaryY + 32
      for (const [label, value] of summaryLines) {
        doc.text(label, MARGIN + 12, lineY)
        doc.text(value, PAGE_WIDTH - MARGIN - 12 - 150, lineY, { width: 150, align: 'right' })
        lineY += 13
      }

      // Per-category table
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
      doc.text('Category-wise Breakdown', MARGIN, summaryY + 100)

      const tableY = summaryY + 125
      drawTable(
        doc,
        MARGIN,
        tableY,
        [
          { header: 'Category', width: 180 },
          { header: 'Parts', width: 80, align: 'right' },
          { header: 'Stock Units', width: 100, align: 'right' },
          { header: 'Stock Value', width: 135, align: 'right' },
        ],
        data.categories.map((cat) => [
          cat.category,
          String(cat.partCount),
          String(cat.stockUnits),
          formatMoney(cat.stockValue, data.currency),
        ])
      )

      addFooter(doc)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
