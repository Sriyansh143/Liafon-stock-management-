/**
 * Tally XML + QuickBooks (IIF) export.
 *
 * Two formats:
 *   1. Tally XML — Indian accounting software. Imports sales vouchers.
 *   2. QuickBooks IIF — Intuit's interchange format. Imports invoices.
 *
 * Both formats are exported as downloadable files from the API.
 */

import { db } from '@/lib/db'

interface ExportSale {
  id: string
  invoiceNumber: string
  date: Date
  customerName: string
  customerPhone: string
  taxableValue: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalPrice: number
  currency: string
  notes: string
  part: {
    name: string
    partNumber: string
  }
  quantity: number
  unitPrice: number
}

async function fetchSalesForExport(
  ownerId: string,
  startDate: Date,
  endDate: Date
): Promise<ExportSale[]> {
  const sales = await db.sale.findMany({
    where: {
      ownerId,
      date: { gte: startDate, lte: endDate },
    },
    include: {
      part: { select: { name: true, partNumber: true } },
    },
    orderBy: { date: 'asc' },
  })
  return sales.map((s) => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber || s.id.slice(-8).toUpperCase(),
    date: s.date,
    customerName: s.customerName || 'Walk-in Customer',
    customerPhone: s.customerPhone,
    taxableValue: s.taxableValue,
    cgstAmount: s.cgstAmount,
    sgstAmount: s.sgstAmount,
    igstAmount: s.igstAmount,
    totalPrice: s.totalPrice,
    currency: s.currency,
    notes: s.notes,
    part: {
      name: s.part.name,
      partNumber: s.part.partNumber,
    },
    quantity: s.quantity,
    unitPrice: s.unitPrice,
  }))
}

/**
 * Generate Tally-compatible XML for sales vouchers.
 *
 * Tally expects a specific XML schema (TallyPrime XML format) where each
 * voucher has envelope, request, data, tallymessage, voucher tags.
 *
 * Format reference: https://docs.tallysolutions.com/tally-prime/developer/
 */
export async function generateTallyXml(
  ownerId: string,
  startDate: Date,
  endDate: Date
): Promise<string> {
  const sales = await fetchSalesForExport(ownerId, startDate, endDate)

  const voucherXml = sales.map((s) => {
    const dateStr = s.date.toISOString().slice(0, 10)
    const ledgerEntries = [
      // Customer debit (full invoice value)
      `<ENVELOPE>
        <LEDGERNAME>${escapeXml(s.customerName)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>${s.totalPrice.toFixed(2)}</AMOUNT>
      </ENVELOPE>`,
      // Taxable sales credit
      `<ENVELOPE>
        <LEDGERNAME>Sales</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${s.taxableValue.toFixed(2)}</AMOUNT>
      </ENVELOPE>`,
    ]
    // CGST
    if (s.cgstAmount > 0) {
      ledgerEntries.push(`<ENVELOPE>
        <LEDGERNAME>Output CGST</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${s.cgstAmount.toFixed(2)}</AMOUNT>
      </ENVELOPE>`)
    }
    // SGST
    if (s.sgstAmount > 0) {
      ledgerEntries.push(`<ENVELOPE>
        <LEDGERNAME>Output SGST</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${s.sgstAmount.toFixed(2)}</AMOUNT>
      </ENVELOPE>`)
    }
    // IGST
    if (s.igstAmount > 0) {
      ledgerEntries.push(`<ENVELOPE>
        <LEDGERNAME>Output IGST</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>${s.igstAmount.toFixed(2)}</AMOUNT>
      </ENVELOPE>`)
    }

    return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
      <VOUCHER VCHTYPE="Sales" ACTION="Create">
        <DATE>${dateStr}</DATE>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
        <VOUCHERNUMBER>${escapeXml(s.invoiceNumber)}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${escapeXml(s.customerName)}</PARTYLEDGERNAME>
        <NARRATION>Invoice ${escapeXml(s.invoiceNumber)} — ${escapeXml(s.part.name)} × ${s.quantity}${s.notes ? ' — ' + escapeXml(s.notes) : ''}</NARRATION>
        ${ledgerEntries.join('\n        ')}
      </VOUCHER>
    </TALLYMESSAGE>`
  }).join('\n      ')

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
      ${voucherXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`
}

/**
 * Generate QuickBooks IIF (Intuit Interchange Format) for invoices.
 *
 * IIF is tab-separated. Two sections:
 *   !TRNS  — Transaction header (one per invoice)
 *   !SPL   — Split lines (one per line item + tax)
 *   !ENDTRNS — End of transaction
 *
 * Format reference: https://quickbooks.intuit.com/learn-support/en-us/help-article/intuit-payment-solutions/import-iif-files/
 */
export async function generateQuickBooksIif(
  ownerId: string,
  startDate: Date,
  endDate: Date
): Promise<string> {
  const sales = await fetchSalesForExport(ownerId, startDate, endDate)

  const lines: string[] = []
  // Headers
  lines.push('!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO')
  lines.push('!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO')
  lines.push('!ENDTRNS')

  for (const s of sales) {
    const dateStr = s.date.toISOString().slice(0, 10)
    // TRNS line (the invoice header — debits Accounts Receivable)
    lines.push([
      'TRNS', 'INVOICE', dateStr, 'Accounts Receivable', s.customerName,
      s.totalPrice.toFixed(2), s.invoiceNumber,
      `Invoice ${s.invoiceNumber}`,
    ].join('\t'))

    // SPL line 1: Sales (credit)
    lines.push([
      'SPL', 'INVOICE', dateStr, 'Sales Income', s.customerName,
      (-s.taxableValue).toFixed(2), s.invoiceNumber,
      `${s.part.name} × ${s.quantity}`,
    ].join('\t'))

    // SPL line 2: CGST (if any)
    if (s.cgstAmount > 0) {
      lines.push([
        'SPL', 'INVOICE', dateStr, 'Output CGST', s.customerName,
        (-s.cgstAmount).toFixed(2), s.invoiceNumber, 'CGST',
      ].join('\t'))
    }
    // SPL line 3: SGST
    if (s.sgstAmount > 0) {
      lines.push([
        'SPL', 'INVOICE', dateStr, 'Output SGST', s.customerName,
        (-s.sgstAmount).toFixed(2), s.invoiceNumber, 'SGST',
      ].join('\t'))
    }
    // SPL line 4: IGST
    if (s.igstAmount > 0) {
      lines.push([
        'SPL', 'INVOICE', dateStr, 'Output IGST', s.customerName,
        (-s.igstAmount).toFixed(2), s.invoiceNumber, 'IGST',
      ].join('\t'))
    }

    lines.push('ENDTRNS')
  }

  return lines.join('\n')
}

/** XML-escape a string for safe inclusion in Tally XML. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
