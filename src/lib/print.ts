// ────────────────────────────────────────────────────────────────────────────
// Print / PDF helper utilities for invoices, receipts and reports.
// Uses the browser's native print dialog so users can save as PDF too.
// ────────────────────────────────────────────────────────────────────────────

import { formatCurrency, getCurrencySymbol } from '@/lib/currency'

export interface InvoiceLineItem {
  partNumber: string
  name: string
  brand?: string
  quantity: number
  unitPrice: number
  totalPrice: number
  // Optional GST/tax breakdown per line (for itemized invoices)
  taxRate?: number // e.g. 0.18 for 18% GST
  taxAmount?: number
}

export interface InvoiceData {
  invoiceNumber: string
  date: string
  customerName: string
  customerPhone?: string
  notes?: string
  currency: string
  items: InvoiceLineItem[]
  subtotal: number
  total: number
  shopName?: string
  shopPhone?: string
  shopAddress?: string
  // Optional tax/GST info (added in v3.6)
  shopGstNumber?: string
  customerGstNumber?: string
  taxRate?: number // e.g. 0.18 for 18% GST
  taxAmount?: number
  discount?: number
  // Optional payment info
  paymentMethod?: string
  paymentStatus?: 'paid' | 'unpaid' | 'partial'
  amountPaid?: number
}

/**
 * Convert a number to its English-word representation (rounded to 2 dp).
 * Used for the "Amount in words" line on invoices.
 * Supports up to billions. Returns "Zero" for 0.
 */
export function numberToWords(num: number): string {
  if (num === 0) return 'Zero'
  if (!Number.isFinite(num)) return ''
  const rounded = Math.round(num * 100) / 100
  const wholePart = Math.floor(rounded)
  const decimalPart = Math.round((rounded - wholePart) * 100)

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function below1000(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '')
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + below1000(n % 100) : '')
  }

  function inIndianSystem(n: number): string {
    if (n === 0) return ''
    const crore = Math.floor(n / 10000000)
    n %= 10000000
    const lakh = Math.floor(n / 100000)
    n %= 100000
    const thousand = Math.floor(n / 1000)
    n %= 1000
    const parts: string[] = []
    if (crore) parts.push(below1000(crore) + ' Crore')
    if (lakh) parts.push(below1000(lakh) + ' Lakh')
    if (thousand) parts.push(below1000(thousand) + ' Thousand')
    if (n) parts.push(below1000(n))
    return parts.join(' ')
  }

  const words = inIndianSystem(wholePart).trim()
  if (decimalPart === 0) return words
  return `${words} and ${below1000(decimalPart)} Paise`
}

/**
 * Open a print-friendly invoice in a new window and trigger the print
 * dialog. The HTML is fully self-contained (inline CSS, no external
 * dependencies) so it works offline too.
 */
export function printInvoice(data: InvoiceData): void {
  if (typeof window === 'undefined') return

  const sym = getCurrencySymbol(data.currency)
  const formattedDate = new Date(data.date).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const shopName = data.shopName || 'Liafon Stock Management'
  const shopPhone = data.shopPhone || ''
  const shopAddress = data.shopAddress || ''
  const shopGst = data.shopGstNumber || ''
  const customerGst = data.customerGstNumber || ''

  // Compute derived values for the new totals block
  const subtotal = data.subtotal
  const discount = data.discount ?? 0
  const taxableAmount = Math.max(0, subtotal - discount)
  const taxRate = data.taxRate ?? 0
  const taxAmount = data.taxAmount ?? Math.round(taxableAmount * taxRate * 100) / 100
  const total = data.total
  const amountPaid = data.amountPaid ?? 0
  const balanceDue = Math.max(0, total - amountPaid)
  const amountInWords = numberToWords(total)

  const itemsRows = data.items
    .map(
      (item, idx) => `
      <tr class="${idx % 2 === 0 ? 'row-even' : 'row-odd'}">
        <td class="col-num">${idx + 1}</td>
        <td class="col-part">
          <div class="part-name">${escapeHtml(item.name)}</div>
          <div class="part-meta">
            <span class="part-number">#${escapeHtml(item.partNumber)}</span>
            ${item.brand ? `<span class="part-brand">${escapeHtml(item.brand)}</span>` : ''}
          </div>
        </td>
        <td class="col-qty">${item.quantity}</td>
        <td class="col-price">${formatCurrency(item.unitPrice, data.currency)}</td>
        <td class="col-total">${formatCurrency(item.totalPrice, data.currency)}</td>
      </tr>`
    )
    .join('')

  // NOTE: formatCurrency() takes an optional 3rd arg `amountCurrency`
  // for multi-currency conversion. We don't pass it here because
  // invoices are always stored in the sale's currency — conversion
  // would silently change the numbers. (Previously we also didn't
  // pass it; this comment documents the intentional behavior.)
  const totalsRows: string[] = []
  totalsRows.push(
    `<div class="totals-row subtle"><span>Subtotal</span><span>${formatCurrency(subtotal, data.currency)}</span></div>`
  )
  if (discount > 0) {
    totalsRows.push(
      `<div class="totals-row subtle"><span>Discount</span><span>− ${formatCurrency(discount, data.currency)}</span></div>`
    )
  }
  if (taxAmount > 0) {
    const ratePct = taxRate > 0 ? ` (${(taxRate * 100).toFixed(2)}%)` : ''
    totalsRows.push(
      `<div class="totals-row subtle"><span>${taxRate > 0 ? 'GST' : 'Tax'}${ratePct}</span><span>${formatCurrency(taxAmount, data.currency)}</span></div>`
    )
  }
  totalsRows.push(
    `<div class="totals-row grand"><span>Total ${escapeHtml(data.currency)}</span><span>${formatCurrency(total, data.currency)}</span></div>`
  )
  if (amountPaid > 0) {
    totalsRows.push(
      `<div class="totals-row subtle"><span>Amount Paid</span><span>${formatCurrency(amountPaid, data.currency)}</span></div>`
    )
    if (balanceDue > 0) {
      totalsRows.push(
        `<div class="totals-row grand" style="color:#b91c1c;border-top-color:#dc2626"><span>Balance Due</span><span>${formatCurrency(balanceDue, data.currency)}</span></div>`
      )
    }
  }
  const totalsBlock = totalsRows.join('')

  // Payment status badge
  const paymentBadge = data.paymentStatus
    ? `<span class="payment-badge payment-${escapeHtml(data.paymentStatus)}">${escapeHtml(data.paymentStatus.toUpperCase())}</span>`
    : ''

  // GST block in billing section (if either party has GST)
  const gstBlock =
    shopGst || customerGst
      ? `<div class="billing-block" style="text-align: right;">
          <div class="billing-label">Tax Info</div>
          ${shopGst ? `<div class="billing-sub"><strong>Shop GST:</strong> ${escapeHtml(shopGst)}</div>` : ''}
          ${customerGst ? `<div class="billing-sub"><strong>Customer GST:</strong> ${escapeHtml(customerGst)}</div>` : ''}
        </div>`
      : `<div class="billing-block" style="text-align: right;">
          <div class="billing-label">Payment Terms</div>
          <div class="billing-value">Due on receipt</div>
          <div class="billing-sub">Currency: ${escapeHtml(data.currency)} (${sym})</div>
        </div>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
<style>
  @page { size: A5; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1f2937; background: #fff;
    font-size: 11px; line-height: 1.45;
  }
  .invoice { max-width: 580px; margin: 0 auto; padding: 8px 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 14px; }
  .shop { flex: 1; }
  .shop-name { font-size: 18px; font-weight: 700; color: #064e3b; margin: 0 0 4px; }
  .shop-meta { font-size: 10px; color: #6b7280; }
  .invoice-meta { text-align: right; }
  .invoice-title { font-size: 22px; font-weight: 800; color: #10b981; margin: 0 0 4px; letter-spacing: 1px; }
  .invoice-number { font-size: 11px; color: #6b7280; }
  .invoice-number strong { color: #1f2937; }
  .billing { display: flex; justify-content: space-between; margin-bottom: 14px; gap: 16px; }
  .billing-block { flex: 1; }
  .billing-label { font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .billing-value { font-size: 12px; font-weight: 600; color: #1f2937; }
  .billing-sub { font-size: 10px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  thead th {
    background: #f3f4f6; color: #374151;
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    padding: 8px 6px; text-align: left;
    border-bottom: 2px solid #10b981;
  }
  thead th.right { text-align: right; }
  thead th.center { text-align: center; }
  tbody td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .row-odd { background: #fafafa; }
  .col-num { width: 28px; text-align: center; color: #6b7280; font-size: 10px; }
  .col-qty { width: 50px; text-align: center; font-weight: 600; }
  .col-price, .col-total { width: 80px; text-align: right; font-variant-numeric: tabular-nums; }
  .col-total { font-weight: 700; color: #064e3b; }
  .part-name { font-weight: 600; }
  .part-meta { font-size: 9px; color: #9ca3af; margin-top: 2px; }
  .part-number { font-family: 'Courier New', monospace; }
  .part-brand { margin-left: 8px; }
  .totals { margin-left: auto; width: 220px; margin-bottom: 18px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; }
  .totals-row.subtle { color: #6b7280; }
  .totals-row.grand { border-top: 2px solid #10b981; padding-top: 8px; margin-top: 6px; font-size: 14px; font-weight: 800; color: #064e3b; }
  .notes { background: #fef3c7; border-left: 3px solid #f59e0b; padding: 8px 10px; font-size: 10px; color: #92400e; margin-bottom: 14px; border-radius: 0 4px 4px 0; }
  .footer { text-align: center; padding-top: 14px; border-top: 1px dashed #d1d5db; font-size: 9px; color: #9ca3af; }
  .footer .thanks { font-weight: 700; color: #064e3b; margin-bottom: 4px; font-size: 10px; }
  .currency-note { font-size: 9px; color: #9ca3af; text-align: right; margin-top: -10px; margin-bottom: 10px; }
  .payment-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 9px; font-weight: 700; letter-spacing: 0.5px; }
  .payment-paid { background: #d1fae5; color: #065f46; }
  .payment-unpaid { background: #fee2e2; color: #991b1b; }
  .payment-partial { background: #fef3c7; color: #92400e; }
  .amount-in-words { background: #f9fafb; border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 10px; color: #374151; font-style: italic; margin-bottom: 14px; border-radius: 4px; }
  .amount-in-words strong { font-style: normal; color: #1f2937; }
  @media print {
    .no-print { display: none !important; }
    body { font-size: 10px; }
  }
  .print-btn {
    position: fixed; top: 10px; right: 10px;
    background: #10b981; color: #fff; border: none;
    padding: 8px 16px; border-radius: 6px;
    font-size: 12px; font-weight: 600; cursor: pointer;
    box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
  }
  .print-btn:hover { background: #059669; }
  .close-btn {
    position: fixed; top: 10px; right: 90px;
    background: #6b7280; color: #fff; border: none;
    padding: 8px 16px; border-radius: 6px;
    font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .close-btn:hover { background: #4b5563; }
</style>
</head>
<body>
  <button class="no-print close-btn" onclick="window.close()">Close</button>
  <button class="no-print print-btn" onclick="window.print()">Print / Save PDF</button>

  <div class="invoice">
    <div class="header">
      <div class="shop">
        <div class="shop-name">${escapeHtml(shopName)}</div>
        <div class="shop-meta">
          ${shopPhone ? `<div>Phone: ${escapeHtml(shopPhone)}</div>` : ''}
          ${shopAddress ? `<div>${escapeHtml(shopAddress)}</div>` : ''}
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-title">INVOICE ${paymentBadge}</div>
        <div class="invoice-number"><strong>#${escapeHtml(data.invoiceNumber)}</strong></div>
        <div class="invoice-number">${formattedDate}</div>
      </div>
    </div>

    <div class="billing">
      <div class="billing-block">
        <div class="billing-label">Billed To</div>
        <div class="billing-value">${escapeHtml(data.customerName || 'Walk-in Customer')}</div>
        ${data.customerPhone ? `<div class="billing-sub">${escapeHtml(data.customerPhone)}</div>` : ''}
      </div>
      ${gstBlock}
    </div>

    <table>
      <thead>
        <tr>
          <th class="col-num center">#</th>
          <th>Item</th>
          <th class="center">Qty</th>
          <th class="right">Unit Price</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    ${
      data.notes
        ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(data.notes)}</div>`
        : ''
    }

    <div class="amount-in-words">
      <strong>Amount in words:</strong> ${escapeHtml(amountInWords)} ${escapeHtml(data.currency)} only
    </div>

    <div class="totals">
      ${totalsBlock}
    </div>

    <div class="footer">
      <div class="thanks">Thank you for your business!</div>
      <div>Powered by ${escapeHtml(shopName)} · Generated on ${formattedDate}</div>
    </div>
  </div>

  <script>
    // Auto-trigger print dialog after a small delay (let styles apply)
    window.addEventListener('load', function() {
      setTimeout(function() {
        try { window.print(); } catch (e) {}
      }, 300);
    });
  </script>
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=720,height=900')
  if (!printWindow) {
    alert('Please allow pop-ups to print the invoice.')
    return
  }
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── CSV Export ─────────────────────────────────────────────────────────────

/**
 * Build a CSV string from an array of records. Handles escaping of
 * commas, quotes and newlines per RFC 4180.
 */
export function buildCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns?: { key: keyof T; label: string }[]
): string {
  if (rows.length === 0) return ''
  const cols =
    columns ??
    (Object.keys(rows[0]).map((k) => ({ key: k as keyof T, label: k })))

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return ''
    const s = String(val)
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const header = cols.map((c) => escapeCell(c.label)).join(',')
  const body = rows
    .map((row) => cols.map((c) => escapeCell(row[c.key])).join(','))
    // RFC 4180 specifies CRLF line endings. Some Windows Excel builds
    // mis-parse LF-only CSVs.
    .join('\r\n')

  return `${header}\r\n${body}`
}

/**
 * Trigger a CSV download in the browser.
 */
export function downloadCSV(filename: string, csv: string): void {
  if (typeof window === 'undefined') return
  // Prepend BOM so Excel detects UTF-8 correctly
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // 10s grace — large CSV/JSON files on slow devices can take longer
  // than 1s to start downloading.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Trigger a download for any JSON-serialisable data (used by reports).
 */
export function downloadJSON(filename: string, data: unknown): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
