import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { guardAdmin, apiBadRequest, apiNotFound, logApiError } from '@/lib/api-utils'
import { validate, backupSchema, scheduledBackupSchema, restoreSchema } from '@/lib/validations'
import { logUserActivity } from '@/lib/activity'
import type { SessionUser } from '@/lib/auth'
import type { Prisma } from '@prisma/client'
import {
  isSupabaseStorageConfigured,
  listRemoteBackups,
  uploadBackupPair,
  getSignedDownloadUrl,
  deleteRemoteBackup,
} from '@/lib/supabase-storage'

// ─── Vercel-aware backup directory ────────────────────────────────────────
// Vercel's filesystem is READ-ONLY except for /tmp (and /tmp is wiped
// between cold starts). On Vercel we therefore write backups to /tmp,
// which means backups are ephemeral — the user must download them
// immediately via the GET /api/backup/<filename> flow (or push them to
// Supabase Storage / Vercel Blob, which is a TODO marked below).
//
// For self-hosted (NODE_ENV=production && !VERCEL), we honor BACKUP_DIR
// so daily auto-backups persist on disk as before.
function getBackupDir(): string {
  const configured = process.env.BACKUP_DIR || './backups'

  // Vercel: always write to /tmp — anywhere else will throw EROFS.
  if (process.env.VERCEL === '1') {
    return path.join(os.tmpdir(), 'liafon-backups')
  }

  if (path.isAbsolute(configured)) return configured
  return path.resolve(process.cwd(), configured)
}

async function ensureBackupDir(): Promise<string> {
  const dir = getBackupDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

// GET: List available backups + check for missed backups
export async function GET(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr) return authErr

    const BACKUP_DIR = await ensureBackupDir()

    const backupHourRaw = parseInt(process.env.DAILY_BACKUP_HOUR || '23', 10)
    // NaN guard — if DAILY_BACKUP_HOUR is misconfigured, default to 23
    const backupHour = Number.isFinite(backupHourRaw) && backupHourRaw >= 0 && backupHourRaw <= 23
      ? backupHourRaw
      : 23
    const now = new Date()
    const todayBackupTime = new Date(now)
    todayBackupTime.setHours(backupHour, 0, 0, 0)

    // ─── Merge local (/tmp) + remote (Supabase Storage) backups ─────────
    // On Vercel, /tmp is wiped on cold starts — the persistent source of
    // truth is Supabase Storage. We list both and dedupe by filename.
    const [localFiles, remoteBackups] = await Promise.all([
      fs.readdir(BACKUP_DIR).catch(() => [] as string[]),
      isSupabaseStorageConfigured() ? listRemoteBackups() : Promise.resolve([]),
    ])

    const todayStr = now.toISOString().slice(0, 10)
    const hasTodayBackup =
      localFiles.some((f) => f.includes(todayStr)) ||
      remoteBackups.some((b) => b.name.includes(todayStr))
    const needsBackup = !hasTodayBackup && now > todayBackupTime

    interface BackupMeta {
      filename: string
      size: number
      created: string
      /** 'local' (in /tmp) or 'remote' (in Supabase Storage). */
      location: 'local' | 'remote'
      /** Path within the Supabase bucket (only for remote backups). */
      remotePath?: string
      /** Pre-signed download URL (only for remote backups, may be null). */
      downloadUrl?: string | null
    }
    const backups: BackupMeta[] = []
    const seen = new Set<string>()

    // Local files first
    for (const file of localFiles) {
      if (file === '.gitkeep') continue
      if (seen.has(file)) continue
      seen.add(file)
      const filePath = path.join(BACKUP_DIR, file)
      try {
        const stat = await fs.stat(filePath)
        backups.push({
          filename: file,
          size: stat.size,
          created: stat.birthtime.toISOString(),
          location: 'local',
        })
      } catch {
        // skip files we can't stat
      }
    }

    // Remote files (Supabase Storage) — persistent on Vercel
    for (const remote of remoteBackups) {
      if (seen.has(remote.name)) continue
      seen.add(remote.name)
      backups.push({
        filename: remote.name,
        size: remote.size,
        created: remote.lastModified,
        location: 'remote',
        remotePath: remote.path,
        // Don't auto-generate signed URLs for ALL backups in the list —
        // that would be N round-trips. The client fetches a signed URL
        // on-demand via the `?download=<filename>` query param.
        downloadUrl: null,
      })
    }

    backups.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())

    // ─── On-demand download: ?download=<filename> ───────────────────────
    // Generates a signed URL for a remote backup and redirects.
    // For local backups (self-hosted), returns the file directly.
    const downloadFilename = request.nextUrl.searchParams.get('download')
    if (downloadFilename) {
      const safe = path.basename(downloadFilename)
      if (safe !== downloadFilename) return apiBadRequest('Invalid filename')

      // Try remote first (persistent on Vercel)
      if (isSupabaseStorageConfigured()) {
        const remotePath = `backups/${safe}`
        const signedUrl = await getSignedDownloadUrl(remotePath)
        if (signedUrl) {
          return NextResponse.redirect(signedUrl, { status: 302 })
        }
      }

      // Fall back to local file (self-hosted, or Vercel /tmp before cold start)
      const localPath = path.join(BACKUP_DIR, safe)
      try {
        await fs.access(localPath)
        const buffer = await fs.readFile(localPath)
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${safe}"`,
          },
        })
      } catch {
        return apiNotFound('Backup file not found')
      }
    }

    return NextResponse.json({
      success: true,
      backups,
      backupDir: BACKUP_DIR,
      missedBackupDetected: needsBackup,
      supabaseStorageEnabled: isSupabaseStorageConfigured(),
      // Warn the operator if they're running without persistent storage on Vercel
      persistenceWarning:
        process.env.VERCEL === '1' && !isSupabaseStorageConfigured()
          ? 'Backups are stored in /tmp only — they will vanish on the next cold start. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_BUCKET_NAME to enable persistent backups.'
          : null,
    })
  } catch (error) {
    logApiError('backup/GET', error)
    return NextResponse.json({ error: 'Failed to list backups' }, { status: 500 })
  }
}

// POST: Create backup or restore
export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr) return authErr

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    if (body.type === 'restore') {
      const result = validate(restoreSchema, body)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return handleRestore(result.data, user)
    }

    // ── Scheduled / range backup (weekly, monthly, custom dates) ──────────
    if (body.type === 'range') {
      const result = validate(scheduledBackupSchema, body)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      return await handleScheduledBackup(result.data, user)
    }

    // ── Auto-trigger a missed daily backup (admin opt-in) ────────────────
    // The GET endpoint reports `missedBackupDetected`; the client then
    // POSTs `{ type: 'missed' }` to explicitly trigger the backup.
    // This keeps GET idempotent and gives the admin control.
    if (body.type === 'missed') {
      const result = await handleBackupInternal('full', user)
      await logUserActivity(user, {
        action: 'BACKUP',
        entityType: 'backup',
        entityId: result.jsonFilename,
        summary: `Missed daily backup auto-triggered: ${result.jsonFilename}`,
        metadata: { type: 'full', trigger: 'missed', filename: result.jsonFilename, size: result.jsonSize },
      })
      return NextResponse.json({
        success: true,
        filename: result.jsonFilename,
        size: result.jsonSize,
        excelFilename: result.excelFilename || undefined,
        excelSize: result.excelSize || undefined,
        recordCounts: result.recordCounts,
        trigger: 'missed',
      })
    }

    const result = validate(backupSchema, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return await handleBackup(result.data.type, user)
  } catch (error) {
    logApiError('backup/POST', error)
    return NextResponse.json(
      {
        error: 'Backup operation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// Internal: pure side-effectful backup, returns a structured result
async function handleBackupInternal(type: string, user?: SessionUser | null) {
  const BACKUP_DIR = await ensureBackupDir()

  const timestamp = getTimestamp()
  const data: Record<string, unknown[]> = {}

  switch (type) {
    case 'full':
      data.spareParts = await db.sparePart.findMany()
      data.sales = await db.sale.findMany()
      data.purchases = await db.purchase.findMany()
      data.departments = await db.department.findMany()
      data.stockLogs = await db.stockLog.findMany()
      data.activityLogs = await db.activityLog.findMany()
      data.customers = await db.customer.findMany()
      data.suppliers = await db.supplier.findMany()
      data.appSettings = await db.appSetting.findMany()
      break
    case 'inventory':
      data.spareParts = await db.sparePart.findMany()
      break
    case 'sales':
      data.sales = await db.sale.findMany()
      break
    case 'purchases':
      data.purchases = await db.purchase.findMany()
      break
    default:
      throw new Error('Invalid backup type')
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
      },
      data,
    },
    null,
    2
  )
  await fs.writeFile(jsonPath, jsonData, 'utf-8')

  let excelFilename: string | null = null
  let excelSize = 0

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
        Description: part.description,
        Active: part.isActive,
      }))

      const ws = XLSX.utils.json_to_sheet(excelData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory')

      if (type === 'full' && data.sales) {
        const salesData = (data.sales as Array<Record<string, unknown>>).map((sale) => ({
          ID: sale.id,
          PartId: sale.partId,
          Quantity: sale.quantity,
          UnitPrice: sale.unitPrice,
          TotalPrice: sale.totalPrice,
          CustomerName: sale.customerName,
          CustomerPhone: sale.customerPhone,
          Date: sale.date,
          Notes: sale.notes,
        }))
        const salesWs = XLSX.utils.json_to_sheet(salesData)
        XLSX.utils.book_append_sheet(wb, salesWs, 'Sales')
      }

      excelFilename = `export_${type}_${timestamp}.xlsx`
      const excelPath = path.join(BACKUP_DIR, excelFilename)
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      await fs.writeFile(excelPath, excelBuffer)
      const excelStat = await fs.stat(excelPath)
      excelSize = excelStat.size
    } catch (xlsxErr) {
      console.error('Excel export error:', xlsxErr)
    }
  }

  const jsonStat = await fs.stat(jsonPath)

  // ─── Upload to Supabase Storage for persistence on Vercel ────────────────
  // On Vercel, /tmp is wiped on cold starts. We upload the JSON (and Excel,
  // if any) to Supabase Storage so backups persist across invocations.
  // This is a no-op if Supabase Storage isn't configured (falls back to
  // /tmp-only mode with a warning returned in the API response).
  let storageUploadResult: { json?: { path: string; url: string | null }; excel?: { path: string; url: string | null } | null } | null = null
  if (isSupabaseStorageConfigured()) {
    try {
      storageUploadResult = await uploadBackupPair(jsonPath, excelFilename ? path.join(BACKUP_DIR, excelFilename) : null)
    } catch (uploadErr) {
      // Don't fail the whole backup if upload fails — the local /tmp copy
      // still exists (briefly). Log + return the error in the response.
      console.error('[backup] Supabase Storage upload failed:', uploadErr)
    }
  }

  // Update last_backup timestamp in settings
  try {
    const ownerId = user?.ownerId || 'system'
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
    excelFilename,
    excelSize,
    recordCounts: Object.fromEntries(
      Object.entries(data).map(([key, val]) => [key, val.length])
    ),
    storageUploaded: storageUploadResult !== null,
    storageUrls: storageUploadResult
      ? { json: storageUploadResult.json?.url ?? null, excel: storageUploadResult.excel?.url ?? null }
      : null,
  }
}

async function handleBackup(type: string, user: SessionUser | null) {
  try {
    const result = await handleBackupInternal(type, user)
    await logUserActivity(user, {
      action: 'BACKUP',
      entityType: 'backup',
      entityId: result.jsonFilename,
      summary: `Backup created: ${result.jsonFilename} (${type})`,
      metadata: { type, filename: result.jsonFilename, size: result.jsonSize },
    })
    return NextResponse.json({
      success: true,
      filename: result.jsonFilename,
      size: result.jsonSize,
      excelFilename: result.excelFilename || undefined,
      excelSize: result.excelSize || undefined,
      recordCounts: result.recordCounts,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid backup type') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}

/**
 * Scheduled / range backup — backs up sales + purchases within a
 * date range. Used by the weekly / monthly / custom-date backup UI.
 *
 * Presets:
 *   - 'weekly'  → last 7 days
 *   - 'monthly' → last 30 days
 *   - 'custom'  → use startDate + endDate (ISO strings)
 */
async function handleScheduledBackup(
  body: { preset?: string; startDate?: string; endDate?: string },
  user: SessionUser | null
) {
  const BACKUP_DIR = await ensureBackupDir()
  const timestamp = getTimestamp()

  // Resolve date range from preset or explicit dates
  let startDate: Date
  let endDate: Date = new Date()
  let rangeLabel: string

  if (body.preset === 'weekly') {
    startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    rangeLabel = 'weekly'
  } else if (body.preset === 'monthly') {
    startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)
    rangeLabel = 'monthly'
  } else if (body.preset === 'custom' || (!body.preset && (body.startDate || body.endDate))) {
    if (!body.startDate || !body.endDate) {
      return NextResponse.json(
        { error: 'Custom range backup requires both startDate and endDate' },
        { status: 400 }
      )
    }
    startDate = new Date(body.startDate)
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(body.endDate)
    endDate.setHours(23, 59, 59, 999)
    if (startDate > endDate) {
      return NextResponse.json(
        { error: 'Start date must be before end date' },
        { status: 400 }
      )
    }
    rangeLabel = 'custom'
  } else {
    return NextResponse.json(
      { error: 'Invalid backup preset. Use weekly, monthly, or custom.' },
      { status: 400 }
    )
  }

  // Fetch sales + purchases in range
  const [sales, purchases] = await Promise.all([
    db.sale.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    }),
    db.purchase.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    }),
  ])

  const data: Record<string, unknown[]> = {
    sales,
    purchases,
  }

  const dateRangeStr = `${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}`
  const jsonFilename = `backup_${rangeLabel}_${dateRangeStr}_${timestamp}.json`
  const jsonPath = path.join(BACKUP_DIR, jsonFilename)

  const jsonData = JSON.stringify(
    {
      _meta: {
        type: 'range',
        preset: rangeLabel,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        timestamp: new Date().toISOString(),
        version: '2.0',
        app: 'Liafon Stock Management',
      },
      data,
    },
    null,
    2
  )
  await fs.writeFile(jsonPath, jsonData, 'utf-8')

  // Also produce an Excel file with the sales sheet
  let excelFilename: string | null = null
  try {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    if (sales.length > 0) {
      const salesData = sales.map((s) => ({
        Invoice: s.invoiceNumber,
        Date: s.date,
        PartId: s.partId,
        Quantity: s.quantity,
        UnitPrice: s.unitPrice,
        TotalPrice: s.totalPrice,
        CustomerName: s.customerName,
        CustomerPhone: s.customerPhone,
        Currency: s.currency,
        Notes: s.notes,
      }))
      const salesWs = XLSX.utils.json_to_sheet(salesData)
      XLSX.utils.book_append_sheet(wb, salesWs, 'Sales')
    }

    if (purchases.length > 0) {
      const purchasesData = purchases.map((p) => ({
        Invoice: p.invoiceNumber,
        Date: p.date,
        PartId: p.partId,
        Quantity: p.quantity,
        UnitCost: p.unitCost,
        TotalCost: p.totalCost,
        SupplierName: p.supplierName,
        SupplierPhone: p.supplierPhone,
        Currency: p.currency,
        Notes: p.notes,
      }))
      const purchasesWs = XLSX.utils.json_to_sheet(purchasesData)
      XLSX.utils.book_append_sheet(wb, purchasesWs, 'Purchases')
    }

    excelFilename = `export_${rangeLabel}_${dateRangeStr}_${timestamp}.xlsx`
    const excelPath = path.join(BACKUP_DIR, excelFilename)
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    await fs.writeFile(excelPath, excelBuffer)
  } catch (xlsxErr) {
    console.error('Excel export error:', xlsxErr)
  }

  const jsonStat = await fs.stat(jsonPath)

  await logUserActivity(user, {
    action: 'BACKUP',
    entityType: 'backup',
    entityId: jsonFilename,
    summary: `${rangeLabel} backup created: ${jsonFilename} (${sales.length} sales, ${purchases.length} purchases)`,
    metadata: {
      type: 'range',
      preset: rangeLabel,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      filename: jsonFilename,
      salesCount: sales.length,
      purchasesCount: purchases.length,
    },
  })

  return NextResponse.json({
    success: true,
    filename: jsonFilename,
    size: jsonStat.size,
    excelFilename: excelFilename || undefined,
    recordCounts: {
      sales: sales.length,
      purchases: purchases.length,
    },
    range: {
      preset: rangeLabel,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
  })
}

async function handleRestore(
  body: { type: string; filename: string },
  user: SessionUser | null
) {
  const { filename } = body

  if (!filename) {
    return NextResponse.json({ error: 'Filename is required for restore' }, { status: 400 })
  }

  // Validate filename to prevent path traversal
  const safeFilename = path.basename(filename)
  if (safeFilename !== filename) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }
  // Reject anything that doesn't look like a backup file.
  // Accepts two formats:
  //   backup_<type>_<timestamp>.json            (full/inventory/sales/purchases)
  //   backup_<preset>_<daterange>_<timestamp>.json  (weekly/monthly/custom range)
  const isSimpleBackup = /^backup_[a-z]+_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(safeFilename)
  const isRangeBackup = /^backup_[a-z]+_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(safeFilename)
  if (!isSimpleBackup && !isRangeBackup) {
    return NextResponse.json({ error: 'Invalid backup filename' }, { status: 400 })
  }

  const BACKUP_DIR = await ensureBackupDir()
  const filePath = path.join(BACKUP_DIR, safeFilename)

  try {
    await fs.access(filePath)
  } catch {
    return NextResponse.json({ error: 'Backup file not found' }, { status: 404 })
  }

  const fileContent = await fs.readFile(filePath, 'utf-8')
  const parsed = JSON.parse(fileContent) as {
    _meta?: { version?: string }
    data?: Record<string, unknown[]>
  }

  // Support both new (with _meta) and legacy (raw data) backup formats
  const data = parsed.data ?? (parsed as unknown as Record<string, unknown[]>)

  // Use a transaction so a restore either fully succeeds or fully rolls back.
  // Previously each row was inserted via `tx.X.create()` inside a loop,
  // which for a 50k-part backup meant 50k sequential INSERTs in one
  // transaction (SQLite holds the write lock for minutes). We now use
  // `createMany` for batch inserts — orders of magnitude faster.
  // Note: `createMany` doesn't return IDs, but we don't need them —
  // the backup data already includes the original IDs.
  //
  // Type cast: Prisma has two separate input types (CreateInput vs
  // CreateManyInput). CreateInput uses nested `part: { connect: ... }`
  // while CreateManyInput uses a flat `partId: string`. Backed-up rows
  // are stored with flat `partId` (and other FK columns), so they're
  // shape-compatible with CreateManyInput — but TypeScript can't infer
  // this through the JSON.parse boundary, so we cast.
  await db.$transaction(async (tx) => {
    if (data.spareParts && Array.isArray(data.spareParts)) {
      // Delete child tables first to honor FK constraints
      await tx.sale.deleteMany()
      await tx.purchase.deleteMany()
      await tx.stockLog.deleteMany()
      await tx.sparePart.deleteMany()
      if (data.spareParts.length > 0) {
        await tx.sparePart.createMany({
          data: data.spareParts as unknown as Prisma.SparePartCreateManyInput[],
        })
      }
    }

    if (data.departments && Array.isArray(data.departments)) {
      await tx.department.deleteMany()
      if (data.departments.length > 0) {
        await tx.department.createMany({
          data: data.departments as unknown as Prisma.DepartmentCreateManyInput[],
        })
      }
    }

    if (data.customers && Array.isArray(data.customers)) {
      await tx.customer.deleteMany()
      if (data.customers.length > 0) {
        await tx.customer.createMany({
          data: data.customers as unknown as Prisma.CustomerCreateManyInput[],
        })
      }
    }

    if (data.suppliers && Array.isArray(data.suppliers)) {
      await tx.supplier.deleteMany()
      if (data.suppliers.length > 0) {
        await tx.supplier.createMany({
          data: data.suppliers as unknown as Prisma.SupplierCreateManyInput[],
        })
      }
    }

    if (data.sales && Array.isArray(data.sales)) {
      await tx.sale.deleteMany()
      if (data.sales.length > 0) {
        await tx.sale.createMany({
          data: data.sales as unknown as Prisma.SaleCreateManyInput[],
        })
      }
    }

    if (data.purchases && Array.isArray(data.purchases)) {
      await tx.purchase.deleteMany()
      if (data.purchases.length > 0) {
        await tx.purchase.createMany({
          data: data.purchases as unknown as Prisma.PurchaseCreateManyInput[],
        })
      }
    }

    if (data.stockLogs && Array.isArray(data.stockLogs)) {
      await tx.stockLog.deleteMany()
      if (data.stockLogs.length > 0) {
        await tx.stockLog.createMany({
          data: data.stockLogs as unknown as Prisma.StockLogCreateManyInput[],
        })
      }
    }
  })

  await logUserActivity(user, {
    action: 'RESTORE',
    entityType: 'backup',
    entityId: safeFilename,
    summary: `Database restored from ${safeFilename}`,
    metadata: { filename: safeFilename },
  })

  return NextResponse.json({
    success: true,
    message: `Restored from ${safeFilename}`,
    recordCounts: Object.fromEntries(
      Object.entries(data).map(([key, val]) => [key, Array.isArray(val) ? val.length : 0])
    ),
  })
}

// Cast helper used nowhere else but keeps the import graph consistent.
// (Helps TypeScript infer that Prisma types are actually used.)
export type _PrismaTypes = Prisma.SparePartWhereInput

/**
 * DELETE /api/backup?filename=<filename>
 * Deletes a single backup file (JSON, and its companion .xlsx if present).
 * Used by the Settings page to keep the backup directory tidy.
 */
export async function DELETE(request: NextRequest) {
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr) return authErr

    const { searchParams } = new URL(request.url)
    const filename = searchParams.get('filename')
    if (!filename) return apiBadRequest('Filename is required')

    // Validate filename against the same strict regex as restore —
    // prevents path traversal and arbitrary file deletion.
    const safeFilename = path.basename(filename)
    if (safeFilename !== filename) return apiBadRequest('Invalid filename')

    // Accept both simple backups (backup_<type>_<timestamp>.json)
    // and range backups (backup_<preset>_<daterange>_<timestamp>.json)
    const isSimpleJsonBackup = /^backup_[a-z]+_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(safeFilename)
    const isRangeJsonBackup = /^backup_[a-z]+_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(safeFilename)
    const isSimpleExcelExport = /^export_[a-z]+_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.xlsx$/.test(safeFilename)
    const isRangeExcelExport = /^export_[a-z]+_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.xlsx$/.test(safeFilename)
    const isJsonBackup = isSimpleJsonBackup || isRangeJsonBackup
    const isExcelExport = isSimpleExcelExport || isRangeExcelExport
    if (!isJsonBackup && !isExcelExport) return apiBadRequest('Invalid backup filename')

    const BACKUP_DIR = await ensureBackupDir()
    const filePath = path.join(BACKUP_DIR, safeFilename)

    // Track whether we successfully deleted from any location.
    // On Vercel, the local /tmp file may already be gone (cold start),
    // but the remote (Supabase Storage) copy persists — delete from there.
    let deletedFromLocal = false
    let deletedFromRemote = false

    // Try local first (self-hosted, or Vercel /tmp before cold start)
    try {
      await fs.access(filePath)
      await fs.unlink(filePath)
      deletedFromLocal = true

      // Also delete the companion Excel file if it exists (full + inventory
      // backups produce both a .json and a .xlsx with the same timestamp).
      if (isJsonBackup) {
        const excelName = safeFilename.replace(/^backup_/, 'export_').replace(/\.json$/, '.xlsx')
        const excelPath = path.join(BACKUP_DIR, excelName)
        await fs.unlink(excelPath).catch(() => {})
      }
    } catch {
      // Local file doesn't exist — that's fine on Vercel cold starts
    }

    // Try remote (Supabase Storage) — persistent on Vercel
    if (isSupabaseStorageConfigured()) {
      const remotePath = `backups/${safeFilename}`
      deletedFromRemote = await deleteRemoteBackup(remotePath)
      // Also delete companion Excel from remote
      if (isJsonBackup) {
        const excelRemoteName = safeFilename.replace(/^backup_/, 'export_').replace(/\.json$/, '.xlsx')
        await deleteRemoteBackup(`backups/${excelRemoteName}`)
      }
    }

    if (!deletedFromLocal && !deletedFromRemote) {
      return apiNotFound('Backup file not found')
    }

    await logUserActivity(user, {
      action: 'DELETE',
      entityType: 'backup',
      entityId: safeFilename,
      summary: `Backup deleted: ${safeFilename}`,
      metadata: { filename: safeFilename, deletedFromLocal, deletedFromRemote },
    })

    return NextResponse.json({
      success: true,
      filename: safeFilename,
      deletedFromLocal,
      deletedFromRemote,
    })
  } catch (error) {
    logApiError('backup/DELETE', error)
    return NextResponse.json({ error: 'Failed to delete backup' }, { status: 500 })
  }
}
