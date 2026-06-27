#!/usr/bin/env node
/**
 * License Management Script for Liafon Stock Management
 *
 * Usage:
 *   node scripts/manage-license.js status          — Check current license
 *   node scripts/manage-license.js activate        — Activate a license
 *   node scripts/manage-license.js deactivate      — Deactivate (lock access)
 *   node scripts/manage-license.js expiry 30       — Set expiry to 30 days from now
 *
 * This script directly accesses the SQLite database to set license
 * settings. It's for the DEVELOPER only — the app owner cannot
 * change these from the UI.
 *
 * Requirements:
 *   - The app must be installed (node_modules present)
 *   - The database must exist (run `npx prisma db push` first)
 */

const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const command = process.argv[2]

  if (!command || command === 'status') {
    const [active, expires, key, customer, firstInstall] = await Promise.all([
      db.appSetting.findUnique({ where: { key: 'license_active' } }),
      db.appSetting.findUnique({ where: { key: 'license_expires' } }),
      db.appSetting.findUnique({ where: { key: 'license_key' } }),
      db.appSetting.findUnique({ where: { key: 'license_customer' } }),
      db.appSetting.findUnique({ where: { key: 'first_install' } }),
    ])

    console.log('\n=== License Status ===\n')
    console.log(`  Active: ${active?.value || '(not set — trial mode)'}`)
    console.log(`  Key: ${key?.value || '(none)'}`)
    console.log(`  Customer: ${customer?.value || '(none)'}`)
    console.log(`  Expires: ${expires?.value || '(no expiry)'}`)
    console.log(`  First Install: ${firstInstall?.value || '(not recorded)'}`)

    if (!active) {
      if (firstInstall) {
        const installDate = new Date(firstInstall.value)
        const trialEnd = new Date(installDate)
        trialEnd.setDate(trialEnd.getDate() + 30)
        const daysLeft = Math.ceil((trialEnd - Date.now()) / (1000 * 60 * 60 * 24))
        console.log(`  Trial: ${daysLeft > 0 ? daysLeft + ' days remaining' : 'EXPIRED'}`)
      } else {
        console.log('  Trial: 30 days (not started yet)')
      }
    }
    console.log('')
    return
  }

  if (command === 'activate') {
    const licenseKey = process.argv[3] || `LIAFON-${Date.now().toString(36).toUpperCase()}`
    const customer = process.argv[4] || 'Unknown'
    // Cap at 10 years (3650 days) to match the API-side cap in
    // /api/license (prevents integer overflow on Date arithmetic).
    const MAX_DAYS = 3650
    const rawDays = parseInt(process.argv[5] || '365', 10)
    const expiresInDays =
      Number.isFinite(rawDays) && rawDays > 0 && rawDays <= MAX_DAYS
        ? rawDays
        : 365

    const expiry = new Date()
    expiry.setDate(expiry.getDate() + expiresInDays)

    await db.appSetting.upsert({ where: { key: 'license_active' }, update: { value: 'true' }, create: { key: 'license_active', value: 'true' } })
    await db.appSetting.upsert({ where: { key: 'license_key' }, update: { value: licenseKey }, create: { key: 'license_key', value: licenseKey } })
    await db.appSetting.upsert({ where: { key: 'license_customer' }, update: { value: customer }, create: { key: 'license_customer', value: customer } })
    await db.appSetting.upsert({ where: { key: 'license_expires' }, update: { value: expiry.toISOString() }, create: { key: 'license_expires', value: expiry.toISOString() } })

    console.log(`\n✓ License activated`)
    console.log(`  Key: ${licenseKey}`)
    console.log(`  Customer: ${customer}`)
    console.log(`  Expires: ${expiry.toISOString()}`)
    console.log(`  Days: ${expiresInDays}\n`)
    return
  }

  if (command === 'deactivate') {
    const reason = process.argv[3] || 'Maintenance payment not received'
    await db.appSetting.upsert({ where: { key: 'license_active' }, update: { value: 'false' }, create: { key: 'license_active', value: 'false' } })
    await db.appSetting.upsert({ where: { key: 'license_deactivate_reason' }, update: { value: reason }, create: { key: 'license_deactivate_reason', value: reason } })
    console.log(`\n✗ License deactivated`)
    console.log(`  Reason: ${reason}`)
    console.log(`  The user will see a lock screen on next check (within 5 minutes).\n`)
    return
  }

  if (command === 'expiry') {
    const MAX_DAYS = 3650
    const rawDays = parseInt(process.argv[3] || '30', 10)
    if (!Number.isFinite(rawDays) || rawDays <= 0) {
      console.error('Days must be a positive number')
      process.exit(1)
    }
    if (rawDays > MAX_DAYS) {
      console.error(`Days exceeds maximum allowed (${MAX_DAYS})`)
      process.exit(1)
    }
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + rawDays)
    await db.appSetting.upsert({ where: { key: 'license_expires' }, update: { value: expiry.toISOString() }, create: { key: 'license_expires', value: expiry.toISOString() } })
    await db.appSetting.upsert({ where: { key: 'license_active' }, update: { value: 'true' }, create: { key: 'license_active', value: 'true' } })
    console.log(`\n✓ Expiry set to ${expiry.toISOString()} (${rawDays} days from now)\n`)
    return
  }

  console.log('Usage: node scripts/manage-license.js [status|activate|deactivate|expiry]')
  console.log('  status                                    — Check current license')
  console.log('  activate [key] [customer] [days]          — Activate a license')
  console.log('  deactivate [reason]                       — Deactivate (lock access)')
  console.log('  expiry [days]                             — Set expiry to N days from now')
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
