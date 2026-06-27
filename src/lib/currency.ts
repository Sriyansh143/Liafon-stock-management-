// Currency formatting + conversion utility for Liafon Stock Management
// Default currency: INR (Indian Rupee)

export interface CurrencyInfo {
  code: string
  symbol: string
  name: string
  locale: string
  decimalDigits: number
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  INR: { code: 'INR', symbol: '\u20B9', name: 'Indian Rupee', locale: 'en-IN', decimalDigits: 2 },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', decimalDigits: 2 },
  EUR: { code: 'EUR', symbol: '\u20AC', name: 'Euro', locale: 'de-DE', decimalDigits: 2 },
  GBP: { code: 'GBP', symbol: '\u00A3', name: 'British Pound', locale: 'en-GB', decimalDigits: 2 },
  AED: { code: 'AED', symbol: 'AED', name: 'UAE Dirham', locale: 'ar-AE', decimalDigits: 2 },
  SAR: { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal', locale: 'ar-SA', decimalDigits: 2 },
  JPY: { code: 'JPY', symbol: '\u00A5', name: 'Japanese Yen', locale: 'ja-JP', decimalDigits: 0 },
  CNY: { code: 'CNY', symbol: '\u00A5', name: 'Chinese Yuan', locale: 'zh-CN', decimalDigits: 2 },
  KWD: { code: 'KWD', symbol: 'KD', name: 'Kuwaiti Dinar', locale: 'ar-KW', decimalDigits: 3 },
  QAR: { code: 'QAR', symbol: 'QR', name: 'Qatari Riyal', locale: 'ar-QA', decimalDigits: 2 },
  OMR: { code: 'OMR', symbol: 'OMR', name: 'Omani Rial', locale: 'ar-OM', decimalDigits: 3 },
  BHD: { code: 'BHD', symbol: 'BD', name: 'Bahraini Dinar', locale: 'ar-BH', decimalDigits: 3 },
  PKR: { code: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee', locale: 'en-PK', decimalDigits: 2 },
  BDT: { code: 'BDT', symbol: '\u09F3', name: 'Bangladeshi Taka', locale: 'bn-BD', decimalDigits: 2 },
  LKR: { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee', locale: 'si-LK', decimalDigits: 2 },
  NPR: { code: 'NPR', symbol: 'Rs', name: 'Nepalese Rupee', locale: 'ne-NP', decimalDigits: 2 },
  MYR: { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', locale: 'ms-MY', decimalDigits: 2 },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG', decimalDigits: 2 },
  THB: { code: 'THB', symbol: '\u0E3F', name: 'Thai Baht', locale: 'th-TH', decimalDigits: 2 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU', decimalDigits: 2 },
}

export const DEFAULT_CURRENCY = 'INR'

/**
 * Approximate exchange rates relative to INR (1 INR = X units of target currency).
 *
 * These are STATIC REFERENCE RATES for display purposes only — they let
 * users see what their inventory would cost in another currency. They are
 * NOT live forex rates. For accurate multi-currency accounting, update
 * these values periodically or integrate a live FX API.
 *
 * Rates sourced from approximate mid-2024 values. To update, set
 * EXCHANGE_RATES in .env or edit here.
 *
 * Format: 1 INR = RATE[currency] units of that currency
 */
export const EXCHANGE_RATES: Record<string, number> = {
  INR: 1,        // base
  USD: 0.012,    // 1 INR ≈ $0.012
  EUR: 0.011,
  GBP: 0.0095,
  AED: 0.044,
  SAR: 0.045,
  JPY: 1.85,
  CNY: 0.087,
  KWD: 0.0037,
  QAR: 0.044,
  OMR: 0.0046,
  BHD: 0.0045,
  PKR: 3.35,
  BDT: 1.30,
  LKR: 3.55,
  NPR: 1.60,
  MYR: 0.056,
  SGD: 0.016,
  THB: 0.42,
  AUD: 0.018,
}

/**
 * Convert an amount from one currency to another using the static
 * exchange rates above. Both currencies must be in EXCHANGE_RATES.
 *
 * Example: convertCurrency(100, 'INR', 'USD') → 1.20 (USD)
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number {
  // Guard against non-numeric input
  if (typeof amount !== 'number' || isNaN(amount)) return 0

  // Same currency → no conversion
  if (fromCurrency === toCurrency) return amount

  const fromRate = EXCHANGE_RATES[fromCurrency]
  const toRate = EXCHANGE_RATES[toCurrency]

  // If either currency is unknown, return the original amount
  if (!fromRate || !toRate) return amount

  const amountInINR = amount / fromRate
  return amountInINR * toRate
}

/**
 * Format an amount with the appropriate currency symbol.
 *
 * If `displayCurrency` is provided and differs from `amountCurrency`,
 * the amount is converted using `convertCurrency()` before formatting.
 * This is what makes the header currency switcher actually change the
 * displayed amounts (not just the symbol).
 *
 * @param amount - The numeric amount
 * @param displayCurrency - The currency to display in (from the header switcher)
 * @param amountCurrency - The currency the amount is originally stored in
 *                         (defaults to displayCurrency for backwards compat)
 */
export function formatCurrency(
  amount: number | undefined | null,
  displayCurrency?: string,
  amountCurrency?: string
): string {
  // Guard against undefined/null/NaN — return "—" instead of "₹NaN"
  if (amount === undefined || amount === null || isNaN(amount)) {
    const info = CURRENCIES[displayCurrency || DEFAULT_CURRENCY] || CURRENCIES[DEFAULT_CURRENCY]
    return `${info.symbol}0`
  }

  const displayCode = displayCurrency || DEFAULT_CURRENCY
  const info = CURRENCIES[displayCode] || CURRENCIES[DEFAULT_CURRENCY]

  // Convert if amountCurrency is specified and differs from display
  const originalCurrency = amountCurrency || displayCode
  const convertedAmount =
    originalCurrency === displayCode
      ? amount
      : convertCurrency(amount, originalCurrency, displayCode)

  try {
    return new Intl.NumberFormat(info.locale, {
      style: 'currency',
      currency: info.code,
      minimumFractionDigits: info.decimalDigits,
      maximumFractionDigits: info.decimalDigits,
    }).format(convertedAmount)
  } catch {
    return `${info.symbol}${convertedAmount.toFixed(info.decimalDigits)}`
  }
}

// Currencies that use the Indian numbering system (lakh / crore).
const INDIAN_SYSTEM_CURRENCIES = new Set(['INR', 'PKR', 'BDT', 'LKR', 'NPR'])

// Short format for charts/axis (e.g., 1.2K, 3.5M, 1.2Cr, 3.5L).
// Uses Indian units (Cr/L) for INR and neighboring currencies that
// follow the Indian numbering convention, and Western units (M/K)
// for everything else. Previously this always used Cr/L, producing
// confusing output like "$3.5L" for USD amounts.
export function formatCurrencyShort(amount: number | undefined | null, currencyCode?: string): string {
  if (typeof amount !== 'number' || isNaN(amount)) return '—'
  const code = currencyCode || DEFAULT_CURRENCY
  const info = CURRENCIES[code] || CURRENCIES[DEFAULT_CURRENCY]
  const useIndian = INDIAN_SYSTEM_CURRENCIES.has(code)

  if (useIndian) {
    if (amount >= 10000000) {
      return `${info.symbol}${(amount / 10000000).toFixed(1)}Cr`
    }
    if (amount >= 100000) {
      return `${info.symbol}${(amount / 100000).toFixed(1)}L`
    }
    if (amount >= 1000) {
      return `${info.symbol}${(amount / 1000).toFixed(1)}K`
    }
  } else {
    if (amount >= 1_000_000) {
      return `${info.symbol}${(amount / 1_000_000).toFixed(1)}M`
    }
    if (amount >= 1_000) {
      return `${info.symbol}${(amount / 1_000).toFixed(1)}K`
    }
  }
  return `${info.symbol}${amount.toFixed(info.decimalDigits)}`
}

/**
 * Short format WITH conversion. Same as formatCurrencyShort but
 * converts from amountCurrency to displayCurrency first.
 */
export function formatCurrencyShortConverted(
  amount: number,
  displayCurrency: string,
  amountCurrency?: string
): string {
  const originalCurrency = amountCurrency || displayCurrency
  const converted =
    originalCurrency === displayCurrency
      ? amount
      : convertCurrency(amount, originalCurrency, displayCurrency)
  return formatCurrencyShort(converted, displayCurrency)
}

// Parse currency string to number
export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/[^\d.-]/g, '')) || 0
}

// Get currency symbol only
export function getCurrencySymbol(code?: string): string {
  const info = CURRENCIES[code || DEFAULT_CURRENCY] || CURRENCIES[DEFAULT_CURRENCY]
  return info.symbol
}

// Get all available currencies as array for select dropdowns
export function getCurrencyList(): { value: string; label: string }[] {
  return Object.values(CURRENCIES).map((c) => ({
    value: c.code,
    label: `${c.code} - ${c.name} (${c.symbol})`,
  }))
}
