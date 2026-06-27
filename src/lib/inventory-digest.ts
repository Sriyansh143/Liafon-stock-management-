/**
 * Low-stock + near-expiry WhatsApp/email digest.
 *
 * Called from the daily Vercel Cron. For each owner:
 *   1. Finds parts where current_stock <= min_stock_level
 *   2. Finds batches expiring within EXPIRY_ALERT_DAYS (default 30)
 *   3. Sends a single WhatsApp digest to the owner's phone (if WhatsApp
 *      is connected) OR an email digest (if SMTP is configured)
 *
 * The owner's phone is read from the Shop model. If the owner has multiple
 * shops, ONE digest is sent per owner.
 */

import { db } from '@/lib/db'
import { sendWhatsApp, getWhatsAppStatus } from '@/lib/baileys-whatsapp'
import { sendLowStockAlertEmail, isEmailConfigured } from '@/lib/email'

export interface DigestResult {
  ownerId: string
  ownerName: string
  lowStockCount: number
  expiringBatchCount: number
  alertSent: boolean
  alertChannel: 'whatsapp' | 'email' | 'none'
  error?: string
}

/**
 * Send the daily low-stock + near-expiry digest for ALL owners.
 * Returns per-owner results so the caller can log failures.
 */
export async function sendDailyDigests(): Promise<DigestResult[]> {
  const owners = await db.user.findMany({
    where: { role: 'owner', isActive: true },
    select: { id: true, ownerId: true, name: true, email: true },
  })

  const results: DigestResult[] = []

  for (const owner of owners) {
    const ownerId = owner.ownerId || owner.id
    try {
      const result = await sendDigestForOwner(ownerId, owner.id, owner.name, owner.email)
      results.push(result)
    } catch (err) {
      results.push({
        ownerId,
        ownerName: owner.name,
        lowStockCount: 0,
        expiringBatchCount: 0,
        alertSent: false,
        alertChannel: 'none',
        error: err instanceof Error ? err.message : 'Unknown',
      })
    }
  }

  return results
}

async function sendDigestForOwner(
  ownerId: string,
  userId: string,
  ownerName: string,
  ownerEmail: string
): Promise<DigestResult> {
  const expiryDays = parseInt(process.env.EXPIRY_ALERT_DAYS || '30', 10)
  const expiryCutoff = new Date()
  expiryCutoff.setDate(expiryCutoff.getDate() + expiryDays)

  // ─── 1. Find low-stock parts ────────────────────────────────────────
  const lowStockParts = await db.sparePart.findMany({
    where: {
      ownerId,
      isActive: true,
      currentStock: { lte: db.sparePart.fields.minStockLevel },
    },
    select: {
      id: true, name: true, partNumber: true, currentStock: true,
      minStockLevel: true, shopId: true,
      shop: { select: { name: true } },
    },
    take: 50,   // cap digest size
  })

  // ─── 2. Find near-expiry batches ────────────────────────────────────
  const expiringBatches = await db.batch.findMany({
    where: {
      ownerId,
      expiryDate: { gte: new Date(), lte: expiryCutoff },
      quantity: { gt: 0 },
    },
    include: {
      part: { select: { name: true, partNumber: true } },
    },
    take: 30,
  })

  // ─── 3. If nothing to report, skip ──────────────────────────────────
  if (lowStockParts.length === 0 && expiringBatches.length === 0) {
    return {
      ownerId, ownerName,
      lowStockCount: 0, expiringBatchCount: 0,
      alertSent: false, alertChannel: 'none',
    }
  }

  // ─── 4. Build the digest message ────────────────────────────────────
  const message = buildDigestMessage(ownerName, lowStockParts, expiringBatches, expiryDays)

  // ─── 5. Try WhatsApp first ──────────────────────────────────────────
  const waStatus = await getWhatsAppStatus(ownerId)
  if (waStatus.connected) {
    // Find owner's phone — try the User's Shop first, fall back to AppSetting
    const shop = await db.shop.findFirst({
      where: { ownerId, phone: { not: '' } },
      select: { phone: true },
    })
    if (shop?.phone) {
      const result = await sendWhatsApp(ownerId, shop.phone, message)
      if (result.success) {
        return {
          ownerId, ownerName,
          lowStockCount: lowStockParts.length,
          expiringBatchCount: expiringBatches.length,
          alertSent: true, alertChannel: 'whatsapp',
        }
      }
    }
  }

  // ─── 6. Fall back to email ──────────────────────────────────────────
  if (isEmailConfigured() && ownerEmail) {
    const emailResult = await sendLowStockAlertEmail({
      to: ownerEmail,
      shopName: ownerName,
      parts: lowStockParts.map((p) => ({
        name: p.name,
        partNumber: p.partNumber,
        currentStock: p.currentStock,
        minStockLevel: p.minStockLevel,
      })),
    })
    if (emailResult.success) {
      return {
        ownerId, ownerName,
        lowStockCount: lowStockParts.length,
        expiringBatchCount: expiringBatches.length,
        alertSent: true, alertChannel: 'email',
      }
    }
  }

  return {
    ownerId, ownerName,
    lowStockCount: lowStockParts.length,
    expiringBatchCount: expiringBatches.length,
    alertSent: false, alertChannel: 'none',
    error: 'No alert channel available (WhatsApp not connected + email not configured)',
  }
}

function buildDigestMessage(
  ownerName: string,
  lowStockParts: Array<{
    name: string; partNumber: string; currentStock: number; minStockLevel: number
    shop?: { name: string } | null
  }>,
  expiringBatches: Array<{
    partNumber?: string; batchNumber: string; expiryDate: Date | null; quantity: number
    part: { name: string; partNumber: string }
  }>,
  expiryDays: number
): string {
  const lines: string[] = []
  lines.push(`📊 *Daily Inventory Digest — ${ownerName}*`)
  lines.push('')
  lines.push(`🔴 *Low Stock: ${lowStockParts.length} parts*`)
  if (lowStockParts.length > 0) {
    lines.push('')
    for (const p of lowStockParts.slice(0, 15)) {
      const shop = p.shop?.name ? ` [${p.shop.name}]` : ''
      lines.push(`• ${p.name} (${p.partNumber})${shop}`)
      lines.push(`  Stock: ${p.currentStock} / Min: ${p.minStockLevel}`)
    }
    if (lowStockParts.length > 15) {
      lines.push(`• ... and ${lowStockParts.length - 15} more`)
    }
  }

  if (expiringBatches.length > 0) {
    lines.push('')
    lines.push(`⚠️ *Expiring within ${expiryDays} days: ${expiringBatches.length} batches*`)
    lines.push('')
    for (const b of expiringBatches.slice(0, 10)) {
      const expiry = b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-IN') : '?'
      lines.push(`• ${b.part.name} (${b.part.partNumber})`)
      lines.push(`  Batch: ${b.batchNumber || '?'} · Qty: ${b.quantity} · Expires: ${expiry}`)
    }
    if (expiringBatches.length > 10) {
      lines.push(`• ... and ${expiringBatches.length - 10} more`)
    }
  }

  lines.push('')
  lines.push('_Automated by Liafon Stock Management_')
  return lines.join('\n')
}
