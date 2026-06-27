/**
 * Internal backup helper for the Vercel Cron job.
 *
 * Extracted into a separate file to avoid circular imports with the
 * /api/backup route (which is admin-gated and runs per-user, while
 * the cron runs unattended for ALL owners).
 *
 * This mirrors `handleBackupInternal` from /api/backup/route.ts but:
 *   - Takes ownerId + ownerName as params (no SessionUser)
 *   - Writes to /tmp (Vercel) or BACKUP_DIR (self-hosted)
 *   - Uploads to Supabase Storage if configured
 */

import { db } from '@/lib/db'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { uploadBackupPair, isSupabaseStorageConfigured } from '@/lib/supabase-storage'

function getBackupDir(): string {
  if (process.env.VERCEL === '1') {
    return path.join(os.tmpdir(), 'liafon-backups')
  }
  const configured = process.env.BACKUP_DIR || './backups'
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured)
}

async function ensureBackupDir(): Promise<string> {
  const dir = getBackupDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

export async function handleBackupCronInternal(
  type: string,
  ownerId: string,
  ownerName: string
): Promise<{ jsonFilename: string; jsonSize: number; uploaded: boolean }> {
  const BACKUP_DIR = await ensureBackupDir()
  const timestamp = getTimestamp()
  const data: Record<string, unknown[]> = {}

  // Only fetch this owner's data (multi-tenant safe)
  const ownerWhere = { ownerId }

  switch (type) {
    case 'full':
      data.spareParts = await db.sparePart.findMany({ where: ownerWhere })
      data.sales = await db.sale.findMany({ where: ownerWhere })
      data.purchases = await db.purchase.findMany({ where: ownerWhere })
      data.departments = await db.department.findMany({ where: ownerWhere })
      data.stockLogs = await db.stockLog.findMany({ where: ownerWhere })
      data.activityLogs = await db.activityLog.findMany({ where: ownerWhere })
      data.customers = await db.customer.findMany({ where: ownerWhere })
      data.suppliers = await db.supplier.findMany({ where: ownerWhere })
      data.appSettings = await db.appSetting.findMany({ where: ownerWhere })
      break
    case 'inventory':
      data.spareParts = await db.sparePart.findMany({ where: ownerWhere })
      break
    default:
      throw new Error(`Cron backup: unsupported type ${type}`)
  }

  const jsonFilename = `backup_${type}_${timestamp}.json`
  const jsonPath = path.join(BACKUP_DIR, jsonFilename)

  const jsonData = JSON.stringify(
    {
      _meta: {
        type,
        timestamp: new Date().toISOString(),
        version: '2.0',
        app: 'Liafon Stock Management',
        ownerId,
        ownerName,
        trigger: 'cron',
      },
      data,
    },
    null,
    2
  )
  await fs.writeFile(jsonPath, jsonData, 'utf-8')

  // Optional Excel (inventory + full only)
  let excelFilename: string | null = null
  if (type === 'full' || type === 'inventory') {
    try {
      const XLSX = await import('xlsx')
      const parts = data.spareParts as Array<Record<string, unknown>>
      const excelData = parts.map((part) => ({
        PartNumber: part.partNumber,
        Name: part.name,
        Category: part.category,
        Brand: part.brand,
        VehicleModel: part.vehicleModel,
        CostPrice: part.costPrice,
        SellingPrice: part.sellingPrice,
        CurrentStock: part.currentStock,
        MinStockLevel: part.minStockLevel,
        Location: part.location,
      }))
      const ws = XLSX.utils.json_to_sheet(excelData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
      excelFilename = `export_${type}_${timestamp}.xlsx`
      const excelPath = path.join(BACKUP_DIR, excelFilename)
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      await fs.writeFile(excelPath, excelBuffer)
    } catch (xlsxErr) {
      console.error('[cron] Excel export error:', xlsxErr)
    }
  }

  const jsonStat = await fs.stat(jsonPath)

  // Upload to Supabase Storage for persistence
  let uploaded = false
  if (isSupabaseStorageConfigured()) {
    try {
      await uploadBackupPair(jsonPath, excelFilename ? path.join(BACKUP_DIR, excelFilename) : null)
      uploaded = true
    } catch (uploadErr) {
      console.error(`[cron] Supabase upload failed for owner ${ownerName}:`, uploadErr)
    }
  }

  // Update last_backup setting
  try {
    const existing = await db.appSetting.findFirst({
      where: { ownerId, key: 'last_backup' },
    })
    if (existing) {
      await db.appSetting.update({
        where: { id: existing.id },
        data: { value: new Date().toISOString() },
      })
    } else {
      await db.appSetting.create({
        data: { ownerId, key: 'last_backup', value: new Date().toISOString() },
      })
    }
  } catch {
    // not critical
  }

  return {
    jsonFilename,
    jsonSize: jsonStat.size,
    uploaded,
  }
}
