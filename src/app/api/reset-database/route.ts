import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guardOwner, logApiError } from '@/lib/api-utils'
import { logUserActivity } from '@/lib/activity'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

/**
 * POST /api/reset-database
 * Auth: Owner only.
 *
 * Wipes ALL data from the database EXCEPT the currently-logged-in
 * owner account (so they don't lock themselves out). After the reset,
 * the owner can re-seed demo data or start fresh.
 *
 * This is the "factory reset" — it deletes:
 *   - All users EXCEPT the current owner
 *   - All spare parts, sales, purchases, stock logs
 *   - All departments, customers, suppliers
 *   - All activity logs
 *   - All app settings
 *   - All password reset tokens
 *
 * The owner's account, password, and role are preserved.
 */
export async function POST(request: NextRequest) {
  try {
    const [user, authErr] = await guardOwner(request)
    if (authErr || !user) return authErr ?? NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const confirmText = (body as { confirm?: unknown })?.confirm
    // Require the user to type "DELETE" to confirm — defense in depth
    if (confirmText !== 'DELETE') {
      return NextResponse.json(
        { error: 'Confirmation required. Send { "confirm": "DELETE" } in the request body.' },
        { status: 400 }
      )
    }

    // Backups are preserved by default. The owner must explicitly opt in
    // to deleting them via { deleteBackups: true }. Previously we wiped
    // the entire backups/ directory on every reset, which destroyed the
    // user's safety net right when they needed it most.
    const deleteBackupsFlag = (body as { deleteBackups?: unknown })?.deleteBackups === true

    // Log before we wipe (so the activity log entry survives in the new DB)
    const ownerSummary = `${user.name} (${user.email})`

    // Delete everything except the current owner
    // Order matters for foreign-key constraints
    await db.$transaction([
      db.stockLog.deleteMany(),
      db.sale.deleteMany(),
      db.purchase.deleteMany(),
      db.sparePart.deleteMany(),
      db.department.deleteMany(),
      db.customer.deleteMany(),
      db.supplier.deleteMany(),
      db.passwordReset.deleteMany(),
      db.appSetting.deleteMany(),
      db.activityLog.deleteMany(),
      // Delete all users EXCEPT the current owner
      db.user.deleteMany({ where: { id: { not: user.id } } }),
    ])

    // Re-create the AppSetting defaults so the app doesn't break
    await db.appSetting.createMany({
      data: [
        { key: 'currency', value: 'INR', ownerId: user.ownerId },
        { key: 'backup_hour', value: '23', ownerId: user.ownerId },
        { key: 'last_backup', value: '', ownerId: user.ownerId },
        { key: 'shop_name', value: 'Liafon Stock Management', ownerId: user.ownerId },
      ],
    })

    // Log the reset (in the now-clean activity log)
    await logUserActivity(user, {
      action: 'DELETE',
      entityType: 'system',
      summary: `Database reset by ${ownerSummary}. All data deleted except owner account.`,
      metadata: { resetBy: user.email },
    })

    // Only clear the backups directory if the owner explicitly opted in.
    // Backups are the user's safety net — wiping them on a factory reset
    // (the previous default behavior) was a footgun.
    const backupsDeletedCount = 0
    if (deleteBackupsFlag) {
      try {
        // Vercel: backups live in /tmp (ephemeral). Self-hosted: BACKUP_DIR.
        const backupDir = process.env.VERCEL === '1'
          ? path.join(os.tmpdir(), 'liafon-backups')
          : (process.env.BACKUP_DIR || './backups')
        const absBackupDir = path.isAbsolute(backupDir)
          ? backupDir
          : path.resolve(process.cwd(), backupDir)
        const files = await fs.readdir(absBackupDir)
        for (const file of files) {
          if (file === '.gitkeep') continue
          await fs.unlink(path.join(absBackupDir, file)).catch(() => {})
        }
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json({
      success: true,
      message: deleteBackupsFlag
        ? 'Database reset successfully. All data and backups have been deleted. You are still logged in as the owner.'
        : 'Database reset successfully. All data has been deleted. Your backups were preserved. You are still logged in as the owner.',
      backupsDeleted: deleteBackupsFlag,
      backupsDeletedCount,
    })
  } catch (error) {
    logApiError('reset-database/POST', error)
    return NextResponse.json(
      { error: 'Failed to reset database' },
      { status: 500 }
    )
  }
}
