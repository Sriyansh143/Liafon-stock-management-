/**
 * Indian GST calculation — CGST+SGST for intra-state, IGST for inter-state.
 */
import { db } from '@/lib/db'

export interface GSTBreakdown {
  taxableValue: number; taxRate: number; cgstRate: number; cgstAmount: number
  sgstRate: number; sgstAmount: number; igstRate: number; igstAmount: number
  grandTotal: number; isInterState: boolean
}

export interface GSTCalcInput {
  subtotal: number; discountAmount: number; taxRate: number
  isInterState?: boolean; currency?: string
}

function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100 }

export function calculateGST(input: GSTCalcInput): GSTBreakdown {
  const { subtotal, discountAmount, taxRate, currency = 'INR' } = input
  const isInterState = input.isInterState ?? false
  const taxableValue = round2(Math.max(0, subtotal - discountAmount))

  if (currency !== 'INR') {
    const taxAmount = round2((taxableValue * taxRate) / 100)
    return { taxableValue, taxRate, cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0, igstRate: taxRate, igstAmount: taxAmount, grandTotal: round2(taxableValue + taxAmount), isInterState: true }
  }

  if (isInterState) {
    const igstAmount = round2((taxableValue * taxRate) / 100)
    return { taxableValue, taxRate, cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0, igstRate: taxRate, igstAmount, grandTotal: round2(taxableValue + igstAmount), isInterState: true }
  }

  const halfRate = round2(taxRate / 2)
  const cgstAmount = round2((taxableValue * halfRate) / 100)
  const sgstAmount = round2((taxableValue * halfRate) / 100)
  return { taxableValue, taxRate, cgstRate: halfRate, cgstAmount, sgstRate: halfRate, sgstAmount, igstRate: 0, igstAmount: 0, grandTotal: round2(taxableValue + cgstAmount + sgstAmount), isInterState: false }
}

export function computeDiscountAmount(subtotal: number, discount: number, type: 'flat' | 'percent'): number {
  if (discount <= 0) return 0
  const amount = type === 'percent' ? (subtotal * Math.min(discount, 100)) / 100 : discount
  return round2(Math.min(amount, subtotal))
}

export function getStateCodeFromGSTIN(gstin: string): string | null {
  const trimmed = gstin.trim().toUpperCase()
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$/.test(trimmed)) return null
  return trimmed.slice(0, 2)
}

export function isInterStateSale(sellerStateCode?: string | null, buyerStateCode?: string | null): boolean {
  if (!sellerStateCode || !buyerStateCode) return false
  return sellerStateCode !== buyerStateCode
}

export async function lookupTaxRate(ownerId: string, category: string): Promise<{ rate: number; hsnCode: string } | null> {
  const taxRate = await db.taxRate.findFirst({ where: { ownerId, category: { equals: category, mode: 'insensitive' }, isActive: true } })
  if (!taxRate) return null
  return { rate: taxRate.rate, hsnCode: taxRate.hsnCode }
}
