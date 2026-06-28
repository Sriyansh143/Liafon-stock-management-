/** TOTP 2FA — RFC 6238, Google Authenticator compatible. */
import { authenticator } from 'otplib'
import crypto from 'crypto'

authenticator.options = { step: 30, window: 1, digits: 6 }

export interface TwoFactorSetup { otpauthUrl: string; secret: string; backupCodes: string[]; backupCodesHashed: string[] }

export function generateTwoFactorSetup(userEmail: string, issuer = 'Liafon Stock Management'): TwoFactorSetup {
  const secret = authenticator.generateSecret()
  const otpauthUrl = authenticator.keyuri(userEmail, issuer, secret)
  const backupCodes = Array.from({ length: 8 }, () => generateBackupCode())
  const backupCodesHashed = backupCodes.map((c) => hashBackupCode(c))
  return { otpauthUrl, secret, backupCodes, backupCodesHashed }
}

export function verifyTwoFactorCode(code: string, secret: string): boolean {
  try { return authenticator.verify({ token: code.trim(), secret }) } catch { return false }
}

export interface TwoFactorVerifyResult { valid: boolean; usedBackupCode: boolean; usedBackupCodeIndex?: number; error?: string }

export function verifyTwoFactor(code: string, secret: string, storedBackupCodesHashed: string[]): TwoFactorVerifyResult {
  const t = code.trim()
  if (t.length === 9 && t.includes('-')) {
    const h = hashBackupCode(t)
    const i = storedBackupCodesHashed.indexOf(h)
    if (i >= 0) return { valid: true, usedBackupCode: true, usedBackupCodeIndex: i }
    return { valid: false, usedBackupCode: false, error: 'Invalid backup code' }
  }
  if (verifyTwoFactorCode(t, secret)) return { valid: true, usedBackupCode: false }
  return { valid: false, usedBackupCode: false, error: 'Invalid 2FA code' }
}

function generateBackupCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = crypto.randomBytes(8)
  const c: string[] = []
  for (let i = 0; i < 8; i++) c.push(chars[bytes[i] % chars.length])
  return `${c.slice(0, 4).join('')}-${c.slice(4, 8).join('')}`
}

function hashBackupCode(code: string): string {
  const pepper = process.env.ACTIVITY_LOG_PEPPER || ''
  return crypto.createHash('sha256').update(code.toUpperCase() + pepper).digest('hex')
}

export function removeUsedBackupCode(stored: string[], usedIndex: number): string[] {
  return stored.filter((_, i) => i !== usedIndex)
}

export function getOtpauthUrl(userEmail: string, secret: string, issuer = 'Liafon Stock Management'): string {
  return authenticator.keyuri(userEmail, issuer, secret)
}
