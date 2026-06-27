/**
 * HSN code lookup + search.
 *
 * Pulls from the `HsnCode` table (preloaded via seed-hsn-codes.sql).
 * Provides type-ahead search for the HSN dropdown on the part form.
 */

import { db } from '@/lib/db'

export interface HsnCode {
  id: string
  code: string
  description: string
  rate: number   // Default GST %
  category: string
}

/**
 * Search HSN codes by code OR description.
 * Returns max 50 results. Used by the /api/hsn-codes endpoint.
 */
export async function searchHsnCodes(query: string, limit: number = 50): Promise<HsnCode[]> {
  const trimmed = query.trim()
  if (!trimmed) {
    // No query — return most common codes (capped)
    const codes = await db.hsnCode.findMany({
      take: limit,
      orderBy: { code: 'asc' },
    })
    return codes
  }

  // Try matching by code prefix first (most precise), then by description
  const codes = await db.hsnCode.findMany({
    where: {
      OR: [
        { code: { startsWith: trimmed.toUpperCase() } },
        { description: { contains: trimmed, mode: 'insensitive' } },
        { category: { contains: trimmed, mode: 'insensitive' } },
      ],
    },
    take: limit,
    orderBy: { code: 'asc' },
  })

  return codes
}

/**
 * Look up a single HSN code by its exact code string.
 */
export async function lookupHsn(code: string): Promise<HsnCode | null> {
  const hsn = await db.hsnCode.findUnique({
    where: { code: code.trim().toUpperCase() },
  })
  return hsn
}

/**
 * Get all distinct categories (for filtering in the UI).
 */
export async function getHsnCategories(): Promise<string[]> {
  const result = await db.hsnCode.findMany({
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  })
  return result.map((r) => r.category).filter(Boolean)
}
