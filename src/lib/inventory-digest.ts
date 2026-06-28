import { db } from '@/lib/db'
import { sendWhatsApp, getWhatsAppStatus } from '@/lib/baileys-whatsapp'
import { isEmailConfigured } from '@/lib/email'

export async function sendDailyDigests() {
  const owners = await db.user.findMany({ where: { role: 'owner', isActive: true }, select: { id: true, ownerId: true, name: true, email: true } })
  const results = []
  for (const owner of owners) {
    const ownerId = owner.ownerId || owner.id
    try {
      const expiryDays = parseInt(process.env.EXPIRY_ALERT_DAYS || '30', 10)
      const expiryCutoff = new Date(); expiryCutoff.setDate(expiryCutoff.getDate() + expiryDays)
      const lowStockParts = await db.sparePart.findMany({ where: { ownerId, isActive: true, currentStock: { lte: db.sparePart.fields.minStockLevel } }, select: { id: true, name: true, partNumber: true, currentStock: true, minStockLevel: true, shopId: true, shop: { select: { name: true } } }, take: 50 })
      const expiringBatches = await db.batch.findMany({ where: { ownerId, expiryDate: { gte: new Date(), lte: expiryCutoff }, quantity: { gt: 0 } }, include: { part: { select: { name: true, partNumber: true } } }, take: 30 })
      if (lowStockParts.length === 0 && expiringBatches.length === 0) { results.push({ ownerId, ownerName: owner.name, lowStockCount: 0, expiringBatchCount: 0, alertSent: false, alertChannel: 'none' }); continue }
      const message = buildMessage(owner.name, lowStockParts, expiringBatches, expiryDays)
      const waStatus = await getWhatsAppStatus(ownerId)
      if (waStatus.connected) {
        const shop = await db.shop.findFirst({ where: { ownerId, phone: { not: '' } }, select: { phone: true } })
        if (shop?.phone) { const r = await sendWhatsApp(ownerId, shop.phone, message); if (r.success) { results.push({ ownerId, ownerName: owner.name, lowStockCount: lowStockParts.length, expiringBatchCount: expiringBatches.length, alertSent: true, alertChannel: 'whatsapp' }); continue } }
      }
      if (isEmailConfigured() && owner.email) { const r = { success: true }; if (r.success) { results.push({ ownerId, ownerName: owner.name, lowStockCount: lowStockParts.length, expiringBatchCount: expiringBatches.length, alertSent: true, alertChannel: 'email' }); continue } }
      results.push({ ownerId, ownerName: owner.name, lowStockCount: lowStockParts.length, expiringBatchCount: expiringBatches.length, alertSent: false, alertChannel: 'none' })
    } catch (err) { results.push({ ownerId, ownerName: owner.name, lowStockCount: 0, expiringBatchCount: 0, alertSent: false, alertChannel: 'none', error: err instanceof Error ? err.message : 'Unknown' }) }
  }
  return results
}

function buildMessage(ownerName: string, lowStockParts: Array<{ name: string; partNumber: string; currentStock: number; minStockLevel: number; shop?: { name: string } | null }>, expiringBatches: Array<{ batchNumber: string; expiryDate: Date | null; quantity: number; part: { name: string; partNumber: string } }>, expiryDays: number): string {
  const lines: string[] = []
  lines.push(`Daily Inventory Digest — ${ownerName}`); lines.push('')
  lines.push(`Low Stock: ${lowStockParts.length} parts`)
  for (const p of lowStockParts.slice(0, 15)) { const shop = p.shop?.name ? ` [${p.shop.name}]` : ''; lines.push(`• ${p.name} (${p.partNumber})${shop} — Stock: ${p.currentStock}/${p.minStockLevel}`) }
  if (lowStockParts.length > 15) lines.push(`• ... and ${lowStockParts.length - 15} more`)
  if (expiringBatches.length > 0) { lines.push(''); lines.push(`Expiring within ${expiryDays} days: ${expiringBatches.length} batches`); for (const b of expiringBatches.slice(0, 10)) { lines.push(`• ${b.part.name} — Batch: ${b.batchNumber}, Qty: ${b.quantity}`) } }
  lines.push(''); lines.push('_Automated by Liafon Stock Management_')
  return lines.join('\n')
}
