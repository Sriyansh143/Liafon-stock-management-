'use client'

import { useEffect, useState } from 'react'

/**
 * useLicenseCheck
 *
 * Checks /api/license on mount. If the license is inactive (trial
 * expired or developer-deactivated), shows a lock screen that blocks
 * all access to the app.
 *
 * The check runs every 5 minutes so a deactivation takes effect
 * quickly without requiring the user to refresh. The interval is
 * paused when the tab is hidden (no point polling in the background).
 *
 * Defensive parsing: if the API returns an error object (e.g.
 * `{ error: '...' }`) instead of a license status, we default to
 * `{ active: true }` so a misbehaving API doesn't lock users out.
 */

interface LicenseStatus {
  active: boolean
  message: string
  trial?: boolean
  expired?: boolean
  daysRemaining?: number
  expiresAt?: string
  licensed?: boolean
  customer?: string
}

const FALLBACK_OK: LicenseStatus = {
  active: true,
  message: 'License check failed — access granted',
}

function isLicenseStatus(value: unknown): value is LicenseStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { active?: unknown }).active === 'boolean' &&
    typeof (value as { message?: unknown }).message === 'string'
  )
}

export function useLicenseCheck() {
  const [status, setStatus] = useState<LicenseStatus | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false

    const checkLicense = async () => {
      try {
        const res = await fetch('/api/license')
        if (cancelled) return
        const data: unknown = await res.json()
        if (cancelled) return
        // Validate the response shape. Previously, an error response
        // like { error: '...' } would set status to an object without
        // `active`, and the home-page check `!licenseStatus.active`
        // would treat that as inactive → lock screen shown.
        setStatus(isLicenseStatus(data) ? data : FALLBACK_OK)
      } catch {
        // On network error, don't lock the user out
        if (!cancelled) setStatus(FALLBACK_OK)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    checkLicense()

    // Re-check every 5 minutes. Pause when the tab is hidden.
    let interval: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (interval !== null) return
      interval = setInterval(checkLicense, 5 * 60 * 1000)
    }
    const stop = () => {
      if (interval === null) return
      clearInterval(interval)
      interval = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkLicense()
        start()
      } else {
        stop()
      }
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return { status, checking }
}
