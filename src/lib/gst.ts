/**
 * Indian GST (Goods & Services Tax) calculation utilities.
 *
 * GST has two modes in India:
 *   - Intra-state sale (seller + buyer in same state):
 *       CGST + SGST, each = rate / 2
 *       e.g. 18% GST → 9% CGST + 9% SGST
 *   - Inter-state sale (seller + buyer in different states):
 *       IGST = full rate
 *       e.g. 18% GST → 18% IGST
 *
 * The mode is determined by comparing the seller's state (derived from
 * the owner's GSTIN) with the buyer's state (derived from the customer's
 * address or GSTIN, if provided).
 *
 * For non-Indian currencies, tax is computed as a single flat rate
 * (no CGST/SGST/IGST split) — this matches most other countries' VAT/GST.
 */

import { db } from '@/lib/db'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GSTBreakdown {
  /** Subtotal after discount, before tax. */
  taxableValue: number
  /** Total tax rate (%). e.g. 18 for 18% GST. */
  taxRate: number
  /** CGST rate (%) — intra-state only. */
  cgstRate: number
  /** CGST amount in currency. */
  cgstAmount: number
  /** SGST rate (%) — intra-state only. */
  sgstRate: number
  /** SGST amount in currency. */
  sgstAmount: number
  /** IGST rate (%) — inter-state only. */
  igstRate: number
  /** IGST amount in currency. */
  igstAmount: number
  /** Grand total = taxableValue + total tax. */
  grandTotal: number
  /** Whether this was an intra-state sale (CGST+SGST) or inter-state (IGST). */
  isInterState: boolean
}

export interface GSTCalcInput {
  /** Line subtotal before discount (unitPrice × quantity). */
  subtotal: number
  /** Discount amount already computed (in currency). */
  discountAmount: number
  /** Total tax rate (%). e.g. 18. */
  taxRate: number
  /** Whether the sale is inter-state. If undefined, defaults to false (intra-state). */
  isInterState?: boolean
  /** Currency code — if not INR, tax is applied as a single flat rate. */
  currency?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Round to 2 decimal places (standard for currency). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Compute GST breakdown for a sale line.
 *
 * Returns all fields (CGST/SGST/IGST) — the caller persists all of them,
 * even if some are 0. This makes reporting simpler (no NULL handling).
 */
export function calculateGST(input: GSTCalcInput): GSTBreakdown {
  const { subtotal, discountAmount, taxRate, currency = 'INR' } = input
  const isInterState = input.isInterState ?? false

  // Taxable value = subtotal minus discount
  const taxableValue = round2(Math.max(0, subtotal - discountAmount))

  // For non-INR currencies, treat as flat VAT (single rate, no split)
  if (currency !== 'INR') {
    const taxAmount = round2((taxableValue * taxRate) / 100)
    return {
      taxableValue,
      taxRate,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: taxRate, // Store as IGST for simplicity in non-INR case
      igstAmount: taxAmount,
      grandTotal: round2(taxableValue + taxAmount),
      isInterState: true,
    }
  }

  // INR — split into CGST+SGST or IGST
  if (isInterState) {
    const igstAmount = round2((taxableValue * taxRate) / 100)
    return {
      taxableValue,
      taxRate,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: taxRate,
      igstAmount,
      grandTotal: round2(taxableValue + igstAmount),
      isInterState: true,
    }
  }

  // Intra-state: split evenly
  const halfRate = round2(taxRate / 2)
  const cgstAmount = round2((taxableValue * halfRate) / 100)
  const sgstAmount = round2((taxableValue * halfRate) / 100)
  return {
    taxableValue,
    taxRate,
    cgstRate: halfRate,
    cgstAmount,
    sgstRate: halfRate,
    sgstAmount,
    igstRate: 0,
    igstAmount: 0,
    grandTotal: round2(taxableValue + cgstAmount + sgstAmount),
    isInterState: false,
  }
}

/**
 * Compute discount amount from a discount value + type.
 *
 * @param subtotal  The line subtotal (unitPrice × quantity)
 * @param discount  The discount value
 * @param type      'flat' (currency amount) or 'percent' (0-100)
 * @returns         The actual discount amount in currency (capped at subtotal)
 */
export function computeDiscountAmount(
  subtotal: number,
  discount: number,
  type: 'flat' | 'percent'
): number {
  if (discount <= 0) return 0
  let amount: number
  if (type === 'percent') {
    amount = (subtotal * Math.min(discount, 100)) / 100
  } else {
    amount = discount
  }
  return round2(Math.min(amount, subtotal))
}

// ─── State code extraction from GSTIN ──────────────────────────────────────

/**
 * Extract the state code from an Indian GSTIN.
 *
 * GSTIN format: 2-digit state code + 10-char PAN + 1 entity + 1 Z + 1 checksum
 * e.g. 27AABCA1234F1Z5 → state code 27 (Maharashtra)
 *
 * Returns null if the GSTIN doesn't match the expected format.
 */
export function getStateCodeFromGSTIN(gstin: string): string | null {
  const trimmed = gstin.trim().toUpperCase()
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$/.test(trimmed)) return null
  return trimmed.slice(0, 2)
}

/**
 * Determine if a sale is inter-state by comparing seller + buyer state codes.
 *
 * If either state code is unknown, defaults to false (intra-state) — this is
 * the safer default for a single-shop business (most sales are local).
 */
export function isInterStateSale(
  sellerStateCode?: string | null,
  buyerStateCode?: string | null
): boolean {
  if (!sellerStateCode || !buyerStateCode) return false
  return sellerStateCode !== buyerStateCode
}

// ─── Tax rate lookup ────────────────────────────────────────────────────────

/**
 * Look up the tax rate for a part's category from the TaxRate table.
 * Falls back to 0 if no rate is configured.
 *
 * @param ownerId   The owner ID
 * @param category  The part's category
 * @returns         The tax rate (%) and HSN code, or null if not configured
 */
export async function lookupTaxRate(
  ownerId: string,
  category: string
): Promise<{ rate: number; hsnCode: string } | null> {
  const taxRate = await db.taxRate.findFirst({
    where: {
      ownerId,
      category: { equals: category, mode: 'insensitive' },
      isActive: true,
    },
  })
  if (!taxRate) return null
  return { rate: taxRate.rate, hsnCode: taxRate.hsnCode }
}
