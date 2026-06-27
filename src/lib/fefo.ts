/**
 * FEFO (First-Expiry-First-Out) pick suggestion.
 *
 * When a part has multiple batches (with expiry dates), the API suggests
 * which batch(es) to deduct from on a sale — earliest-expiry first.
 *
 * This is critical for auto-parts shops that stock consumables like:
 *   - Engine oil (12-24 month shelf life)
 *   - Brake fluid (2 year shelf life)
 *   - Coolant (1-2 year shelf life)
 *   - Battery electrolyte (sealed 3 years)
 *
 * Without FEFO, fresh stock gets sold first → old stock expires → write-off.
 */

import { db } from '@/lib/db'

export interface BatchPickSuggestion {
  batchId: string
  batchNumber: string
  expiryDate: Date | null
  availableQty: number
  /** How many units to take from this batch (0 if batch is empty). */
  pickQty: number
  /** Days until expiry (null if no expiry set). Negative = already expired. */
  daysToExpiry: number | null
  /** Whether this batch is already expired (don't pick from it). */
  isExpired: boolean
}

export interface FefoResult {
  /** Ordered list of batches to pick from (earliest-expiry first). */
  suggestions: BatchPickSuggestion[]
  /** Total quantity that can be fulfilled (sum of pickQty). */
  totalFulfillable: number
  /** Whether the requested quantity can be fully fulfilled. */
  canFulfill: boolean
  /** Warnings (e.g. "X units will be picked from an expired batch"). */
  warnings: string[]
}

/**
 * Compute FEFO pick suggestions for fulfilling `requestedQty` of `partId`.
 *
 * Algorithm:
 *   1. Fetch all batches for the part with quantity > 0
 *   2. Sort by expiryDate ASC (nulls last), then by createdAt ASC
 *   3. Walk the sorted list, allocating the requested qty:
 *      - Skip expired batches (warn the caller)
 *      - Allocate from each batch until qty is satisfied or batches run out
 *   4. If qty can't be fully fulfilled, return canFulfill: false
 *
 * @param partId        The part to suggest batches for
 * @param requestedQty  The quantity to fulfill
 * @param allowExpired  If true, expired batches will be used as last resort
 */
export async function suggestBatches(
  partId: string,
  requestedQty: number,
  allowExpired: boolean = false
): Promise<FefoResult> {
  const batches = await db.batch.findMany({
    where: { partId, quantity: { gt: 0 } },
    orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
  })

  const now = new Date()
  const suggestions: BatchPickSuggestion[] = []
  const warnings: string[] = []
  let remaining = requestedQty

  // Separate expired from non-expired
  const nonExpired = batches.filter((b) => !b.expiryDate || b.expiryDate > now)
  const expired = batches.filter((b) => b.expiryDate && b.expiryDate <= now)

  // First pass: allocate from non-expired batches
  for (const batch of nonExpired) {
    if (remaining <= 0) break
    const pickQty = Math.min(batch.quantity, remaining)
    const daysToExpiry = batch.expiryDate
      ? Math.floor((batch.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : null
    suggestions.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber || '—',
      expiryDate: batch.expiryDate,
      availableQty: batch.quantity,
      pickQty,
      daysToExpiry,
      isExpired: false,
    })
    remaining -= pickQty

    // Warn if batch is "near expiry" (within EXPIRY_ALERT_DAYS, default 30)
    if (daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 30) {
      warnings.push(`Batch "${batch.batchNumber}" expires in ${daysToExpiry} days.`)
    }
  }

  // Second pass (only if allowed): allocate from expired batches as last resort
  if (remaining > 0 && allowExpired) {
    for (const batch of expired) {
      if (remaining <= 0) break
      const pickQty = Math.min(batch.quantity, remaining)
      const daysToExpiry = batch.expiryDate
        ? Math.floor((batch.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null
      suggestions.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber || '—',
        expiryDate: batch.expiryDate,
        availableQty: batch.quantity,
        pickQty,
        daysToExpiry,
        isExpired: true,
      })
      remaining -= pickQty
      warnings.push(`⚠️ Batch "${batch.batchNumber}" is expired (${daysToExpiry} days ago). Pick at your own risk.`)
    }
  } else if (remaining > 0 && !allowExpired && expired.length > 0) {
    warnings.push(
      `${remaining} unit(s) couldn't be fulfilled from non-expired batches. ` +
      `${expired.length} expired batch(es) available but allowExpired=false.`
    )
  }

  const totalFulfillable = suggestions.reduce((sum, s) => sum + s.pickQty, 0)
  return {
    suggestions,
    totalFulfillable,
    canFulfill: totalFulfillable >= requestedQty,
    warnings,
  }
}

/**
 * Apply a FEFO pick — deduct quantities from the suggested batches.
 * Called by /api/sales POST when the part has batches with expiry tracking.
 *
 * IMPORTANT: This should be called WITHIN a Prisma transaction so the
 * batch deductions + sale creation are atomic.
 */
export async function applyFefoPick(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  suggestions: BatchPickSuggestion[],
  ownerId: string,
  shopId?: string | null,
  partId?: string,
  referenceId?: string,
  notes?: string
): Promise<void> {
  for (const s of suggestions) {
    if (s.pickQty <= 0) continue
    // Decrement the batch
    await tx.batch.update({
      where: { id: s.batchId },
      data: { quantity: { decrement: s.pickQty } },
    })
    // Create a stock log entry per batch (for full audit trail)
    if (partId) {
      await tx.stockLog.create({
        data: {
          ownerId,
          shopId: shopId || null,
          partId,
          type: 'SALE_BATCH',
          quantity: s.pickQty,
          previousStock: s.availableQty,
          newStock: s.availableQty - s.pickQty,
          referenceId: referenceId || s.batchId,
          notes: `Sale from batch ${s.batchNumber}${notes ? ' — ' + notes : ''}`,
        },
      })
    }
  }
}
