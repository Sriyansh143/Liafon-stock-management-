import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { guardAdmin, logApiError } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'

// Maximum upload size: configurable, default 5 MB
const MAX_UPLOAD_BYTES = parseInt(process.env.IMPORT_MAX_MB || '5', 10) * 1024 * 1024
// Cap the number of rows we'll import in a single request. Previously
// a malicious xlsx could produce hundreds of thousands of rows, each
// of which did its own findUnique + create inside one transaction —
// enough to OOM the process or hold the SQLite write lock for minutes.
const MAX_IMPORT_ROWS = 10_000

export async function POST(request: NextRequest) {
  let tmpPath: string | null = null
  try {
    const [user, authErr] = await guardAdmin(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const formData = await request.formData().catch(() => null)
    if (!formData) {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }
    const fileEntry = formData.get('file')
    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }
    const file = fileEntry

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large. Max size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` },
        { status: 413 }
      )
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an xlsx, xls, or csv file.' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Use the OS tmpdir (cross-platform) instead of hardcoding '/tmp'
    tmpPath = path.join(
      os.tmpdir(),
      `liafon_upload_${Date.now()}_${path.basename(file.name).replace(/[^\w.-]/g, '_')}`
    )
    await fs.writeFile(tmpPath, buffer)

    const XLSX = await import('xlsx')
    // Pass the buffer (not the path) to XLSX.read with the correct type.
    // (Previous code passed a path with type:'buffer' — works by accident.)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

    // Refuse row bombs. We also slice (not just reject) so a slightly
    // over-the-limit file still imports the first 10k rows.
    const truncated = rows.length > MAX_IMPORT_ROWS
    const rowsToProcess = rows.slice(0, MAX_IMPORT_ROWS)

    let imported = 0
    let skipped = 0
    const errors: string[] = []
    const importedPartNumbers: string[] = []
    const validNewParts: Array<{
      partNumber: string
      name: string
      category: string
      brand: string
      vehicleModel: string
      description: string
      costPrice: number
      sellingPrice: number
      currentStock: number
      minStockLevel: number
      location: string
    }> = []

    // First pass: validate every row in memory (no DB hits yet)
    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i]
      try {
        const partNumber = String(
          row['PartNumber'] ?? row['partNumber'] ?? row['PART_NUMBER'] ?? ''
        ).trim()
        if (!partNumber) {
          errors.push(`Row ${i + 2}: Missing PartNumber`)
          continue
        }

        const name = String(row['Name'] ?? row['name'] ?? '').trim()
        const category = String(row['Category'] ?? row['category'] ?? '').trim()
        const brand = String(row['Brand'] ?? row['brand'] ?? '').trim()
        const vehicleModel = String(
          row['VehicleModel'] ?? row['vehicleModel'] ?? row['vehicle_model'] ?? ''
        ).trim()
        const costPrice = parseFloat(
          String(row['CostPrice'] ?? row['costPrice'] ?? row['cost_price'] ?? '0')
        )
        const sellingPrice = parseFloat(
          String(row['SellingPrice'] ?? row['sellingPrice'] ?? row['selling_price'] ?? '0')
        )
        const currentStock = parseInt(
          String(row['CurrentStock'] ?? row['currentStock'] ?? row['current_stock'] ?? '0'),
          10
        )
        const minStockLevel = parseInt(
          String(row['MinStockLevel'] ?? row['minStockLevel'] ?? row['min_stock_level'] ?? '5'),
          10
        )
        const location = String(row['Location'] ?? row['location'] ?? '').trim()
        const description = String(row['Description'] ?? row['description'] ?? '').trim()

        if (!name) {
          errors.push(`Row ${i + 2}: Missing Name for part ${partNumber}`)
          continue
        }
        if (Number.isNaN(costPrice) || Number.isNaN(sellingPrice)) {
          errors.push(`Row ${i + 2}: Invalid price for part ${partNumber}`)
          continue
        }

        validNewParts.push({
          partNumber,
          name,
          category: category || 'Uncategorized',
          brand: brand || 'Generic',
          vehicleModel,
          description,
          costPrice,
          sellingPrice,
          currentStock: Number.isNaN(currentStock) ? 0 : currentStock,
          minStockLevel: Number.isNaN(minStockLevel) ? 5 : minStockLevel,
          location,
        })
      } catch (err) {
        errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    // Second pass: batch-query existing part numbers in ONE query
    // (previously N+1 findUnique calls — 10k rows = 10k round-trips).
    if (validNewParts.length > 0) {
      const allPartNumbers = validNewParts.map((p) => p.partNumber)
      const existingParts = await db.sparePart.findMany({
        where: { partNumber: { in: allPartNumbers } },
        select: { partNumber: true },
      })
      const existingSet = new Set(existingParts.map((p) => p.partNumber))

      const toCreate = validNewParts.filter((p) => !existingSet.has(p.partNumber))
      skipped = validNewParts.length - toCreate.length

      // Third pass: Insert in batches of 500 to avoid Vercel serverless
      // 60-second timeout on large imports. Previously used a single
      // createMany which would timeout on 10,000 rows.
      if (toCreate.length > 0) {
        const BATCH_SIZE = 500
        for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
          const batch = toCreate.slice(i, i + BATCH_SIZE)
          await db.sparePart.createMany({
            data: batch.map((p) => ({
              ownerId: user.ownerId,
              partNumber: p.partNumber,
              name: p.name,
              category: p.category,
              brand: p.brand,
              vehicleModel: p.vehicleModel,
              description: p.description,
              costPrice: p.costPrice,
              sellingPrice: p.sellingPrice,
              currentStock: p.currentStock,
              minStockLevel: p.minStockLevel,
              location: p.location,
              currency: 'INR',
            })),
          })
        }
        // createMany doesn't return IDs, but we have the part numbers
        for (const p of toCreate) {
          importedPartNumbers.push(p.partNumber)
        }
        imported = toCreate.length
      }
    }

    await logUserActivity(user, {
      action: 'IMPORT',
      entityType: 'part',
      entityId: '',
      summary: `Imported ${imported} parts (skipped ${skipped}) from ${file.name}`,
      metadata: {
        ownerId: user.ownerId,
        filename: file.name,
        imported,
        skipped,
        errors: errors.length,
        total: rows.length,
        samplePartNumbers: importedPartNumbers.slice(0, 10),
      },
    })

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: errors.slice(0, 50), // cap errors to keep response size sane
      errorCount: errors.length,
      total: rows.length,
      truncated,
      maxRows: MAX_IMPORT_ROWS,
    })
  } catch (error) {
    logApiError('import/POST', error)
    // SECURITY: previously we returned `error.message` to the client,
    // which can contain Prisma internal paths, SQL fragments, or file
    // system paths. Now we log the details server-side and return a
    // generic message.
    return NextResponse.json(
      { error: 'Failed to import file. Check server logs for details.' },
      { status: 500 }
    )
  } finally {
    if (tmpPath) await fs.unlink(tmpPath).catch(() => {})
  }
}
