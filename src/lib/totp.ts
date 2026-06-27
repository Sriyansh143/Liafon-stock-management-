/**
 * TOTP (Time-based One-Time Password) for 2FA.
 *
 * Uses the standard RFC 6238 algorithm — compatible with Google Authenticator,
 * Authy, 1Password, Microsoft Authenticator, etc.
 *
 * ─── Flow ───────────────────────────────────────────────────────────────────
 * 1. User requests 2FA enablement → API generates a random secret, returns
 *    it as an `otpauth://` URL (encodable into a QR code for easy setup).
 *    Secret is stored in User.twoFactorSecret (NOT yet enabled).
 *
 * 2. User scans QR in their authenticator app, gets a 6-digit code.
 *
 * 3. User submits the code → API verifies it against the secret.
 *    If valid → User.twoFactorEnabled = true. Login now requires 2FA.
 *
 * 4. To disable: user submits current code + password → 2FA disabled.
 *
 * ─── Backup codes ──────────────────────────────────────────────────────────
 * On enablement, we generate 8 one-time backup codes. User saves these
 * (offline). If they lose their phone, any backup code grants access.
 * Used codes are marked as used (we store them hashed).
 *
 * ─── No paid services ──────────────────────────────────────────────────────
 * otplib is MIT-licensed. No SMS, no Authy, no paid 2FA services.
 */

import { authenticator } from 'otplib'
import crypto from 'crypto'

// ─── Configuration ─────────────────────────────────────────────────────────

authenticator.options = {
  step: 30,        // 30-second window (standard)
  window: 1,       // Allow 1 step before/after (±30s clock drift tolerance)
  digits: 6,       // 6-digit code (standard)
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TwoFactorSetup {
  /** The otpauth:// URL — encode this as a QR code for the user to scan. */
  otpauthUrl: string
  /** The Base32 secret (for manual entry if QR can't be scanned). */
  secret: string
  /** 8 one-time backup codes. Show ONCE to the user — store only their hashes. */
  backupCodes: string[]
  /** Hashed backup codes (store in DB). */
  backupCodesHashed: string[]
}

export interface TwoFactorVerifyResult {
  valid: boolean
  /** True if a backup code was used (not a TOTP code). */
  usedBackupCode: boolean
  /** The backup code that was used (so caller can remove it from stored list). */
  usedBackupCodeIndex?: number
  error?: string
}

// ─── Setup ──────────────────────────────────────────────────────────────────

/**
 * Generate a new TOTP secret + otpauth URL for a user.
 * The caller stores the secret in User.twoFactorSecret (NOT enabled yet).
 */
export function generateTwoFactorSetup(
  userEmail: string,
  issuer: string = 'Liafon Stock Management'
): TwoFactorSetup {
  const secret = authenticator.generateSecret()
  const otpauthUrl = authenticator.keyuri(userEmail, issuer, secret)

  // Generate 8 backup codes (8 chars each, alphanumeric)
  const backupCodes = Array.from({ length: 8 }, () => generateBackupCode())
  const backupCodesHashed = backupCodes.map((c) => hashBackupCode(c))

  return {
    otpauthUrl,
    secret,
    backupCodes,
    backupCodesHashed,
  }
}

// ─── Verification ───────────────────────────────────────────────────────────

/**
 * Verify a 6-digit TOTP code against the user's secret.
 */
export function verifyTwoFactorCode(code: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: code.trim(), secret })
  } catch {
    return false
  }
}

/**
 * Verify a TOTP code OR a backup code.
 *
 * Backup codes are checked first (they're 8 chars, TOTP codes are 6 digits —
 * easy to distinguish). If a backup code matches, returns `usedBackupCode: true`
 * with the index so the caller can remove it from the stored list.
 *
 * @param code           The code submitted by the user (6-digit TOTP or 8-char backup)
 * @param secret         The user's TOTP secret
 * @param storedBackupCodesHashed  Hashed backup codes from DB
 */
export function verifyTwoFactor(
  code: string,
  secret: string,
  storedBackupCodesHashed: string[]
): TwoFactorVerifyResult {
  const trimmed = code.trim()

  // ─── Try backup code first (8 chars, alphanumeric with dash) ─────────
  if (trimmed.length === 9 && trimmed.includes('-')) {
    const hashed = hashBackupCode(trimmed)
    const index = storedBackupCodesHashed.indexOf(hashed)
    if (index >= 0) {
      return { valid: true, usedBackupCode: true, usedBackupCodeIndex: index }
    }
    return { valid: false, usedBackupCode: false, error: 'Invalid backup code' }
  }

  // ─── Try TOTP (6 digits) ─────────────────────────────────────────────
  if (verifyTwoFactorCode(trimmed, secret)) {
    return { valid: true, usedBackupCode: false }
  }

  return { valid: false, usedBackupCode: false, error: 'Invalid 2FA code' }
}

// ─── Backup code helpers ────────────────────────────────────────────────────

/**
 * Generate a backup code in the format "XXXX-XXXX" (8 chars + dash).
 * Uses crypto.randomBytes for cryptographic randomness.
 */
function generateBackupCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = crypto.randomBytes(8)
  const code: string[] = []
  for (let i = 0; i < 8; i++) {
    code.push(chars[bytes[i] % chars.length])
  }
  return `${code.slice(0, 4).join('')}-${code.slice(4, 8).join('')}`
}

/**
 * Hash a backup code with SHA-256 (with app pepper if configured).
 * Backup codes are stored hashed so a DB leak doesn't expose them.
 */
function hashBackupCode(code: string): string {
  const pepper = process.env.ACTIVITY_LOG_PEPPER || ''
  return crypto.createHash('sha256').update(code.toUpperCase() + pepper).digest('hex')
}

/**
 * Remove a used backup code from the stored list.
 * Returns the new array (without the used code).
 */
export function removeUsedBackupCode(
  storedBackupCodesHashed: string[],
  usedIndex: number
): string[] {
  return storedBackupCodesHashed.filter((_, i) => i !== usedIndex)
}

// ─── QR code URL ────────────────────────────────────────────────────────────

/**
 * Get the otpauth URL for a user (used to render a QR code in the UI).
 * The user scans it with Google Authenticator / Authy / etc.
 */
export function getOtpauthUrl(
  userEmail: string,
  secret: string,
  issuer: string = 'Liafon Stock Management'
): string {
  return authenticator.keyuri(userEmail, issuer, secret)
}
