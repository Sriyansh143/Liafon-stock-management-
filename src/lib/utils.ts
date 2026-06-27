import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merge Tailwind class names (dedupes conflicts like `p-4 p-2` → `p-2`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ─── Qwen-suggested utilities (Phase 4) ─────────────────────────────────────

/**
 * Safe JSON parse — returns `fallback` on error instead of throwing.
 * Avoids the try/catch boilerplate around every `JSON.parse`.
 *
 * @example
 *   const cfg = safeJsonParse<Config>(rawString, defaultConfig)
 */
export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * Debounce a function — the returned function only fires `fn` after `wait`
 * milliseconds of silence. Useful for search inputs, autosave, window resize.
 *
 * The returned function has a `.cancel()` method to clear any pending call.
 *
 * @example
 *   const debouncedSearch = debounce((q) => fetch(`/api/search?q=${q}`), 300)
 *   input.addEventListener('input', (e) => debouncedSearch(e.target.value))
 */
export function debounce<T extends (...args: never[]) => unknown>(
  fn: T,
  wait: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = (...args: Parameters<T>): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  return debounced
}

/**
 * Check whether a value is "empty" — null, undefined, empty string,
 * empty array, or empty plain object ({}). Returns false for 0, false,
 * and any other falsy primitive.
 *
 * @example
 *   isEmpty('')          // true
 *   isEmpty([])          // true
 *   isEmpty({})          // true
 *   isEmpty(null)        // true
 *   isEmpty(0)           // false (0 is a valid value)
 *   isEmpty('hello')     // false
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    // Only treat plain objects as potentially empty — class instances
    // (Date, Map, Set, etc.) are never "empty" by this check.
    const proto = Object.getPrototypeOf(value)
    if (proto === null || proto === Object.prototype) {
      return Object.keys(value as Record<string, unknown>).length === 0
    }
    return false
  }
  return false
}

/**
 * Format a number as Indian-style currency (₹1,23,456.78 — lakh notation).
 * Falls back to the currency code if not INR.
 */
export function formatCurrency(amount: number, currency: string = 'INR'): string {
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }
  return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Format an ISO date string as a human-readable date (e.g. "12 Jan 2024").
 */
export function formatDate(iso: string | Date | null): string {
  if (!iso) return '—'
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return String(iso)
  }
}

/**
 * Format a number of days as a relative time string ("3 days ago", "today").
 */
export function formatDaysAgo(days: number | null): string {
  if (days === null) return 'never'
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}
