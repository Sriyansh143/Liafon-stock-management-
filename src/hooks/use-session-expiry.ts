'use client'

import { useEffect, useRef } from 'react'

/**
 * useSessionExpiry
 *
 * Watches for 401 responses from `/api/*` fetch calls and redirects
 * the user to the login page with a `?expired=1` flag.
 *
 * Implementation notes:
 *   - We wrap `window.fetch` (not replace it). The original fetch is
 *     `.call(window, ...)`-ed so it keeps its required `this` context.
 *     Losing `this` is what causes "Failed to execute 'fetch' on
 *     'Window': Illegal invocation" — a real bug we shipped in v3.6.0.
 *   - The wrapper is only installed once (HMR-safe via a flag on
 *     `window.__liafonFetchWrapped`).
 *   - Only `/api/*` requests are inspected. Third-party fetches are
 *     passed through untouched.
 *   - We DO NOT read the response body — we only inspect status. This
 *     avoids the "always await the body" behavior that interferes with
 *     streaming readers on third-party fetches.
 *   - The redirect is debounced (3 s) and skipped if the user is
 *     already on the login page (checked via URLSearchParams, not
 *     substring, so query params like `?page=sales` don't trigger
 *     false positives).
 */
declare global {
  interface Window {
    __liafonFetchWrapped?: boolean
  }
}

export function useSessionExpiry() {
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (typeof window === 'undefined') return
    // HMR / StrictMode guard — don't double-wrap fetch
    if (window.__liafonFetchWrapped) return

    const originalFetch = window.fetch.bind(window)
    let lastExpiryAt = 0

    window.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const response = await originalFetch(input, init)

      // Only inspect /api/* responses
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      if (response.status === 401 && url && url.includes('/api/')) {
        const now = Date.now()
        // Debounce: if 10 calls all 401 at once, only fire one redirect
        if (now - lastExpiryAt > 3000) {
          lastExpiryAt = now
          try {
            localStorage.removeItem('liafon_user')
            localStorage.removeItem('liafon_currency')
            localStorage.removeItem('liafon_customization')
          } catch {
            // ignore
          }
          window.dispatchEvent(
            new CustomEvent('liafon:session-expired', { detail: { url } })
          )
          // Don't redirect if we're already on the login page. Use
          // URLSearchParams (not substring) so a URL like
          // `/?page=sales&login=0` doesn't match `login=1`.
          const params = new URLSearchParams(window.location.search)
          if (params.get('login') !== '1' && mountedRef.current) {
            setTimeout(() => {
              if (!mountedRef.current) return
              window.location.href = '/?login=1&expired=1'
            }, 500)
          }
        }
      }

      return response
    }

    window.__liafonFetchWrapped = true

    return () => {
      mountedRef.current = false
      // NOTE: we intentionally do NOT unwrap window.fetch here. The
      // original implementation also left the wrapper installed for
      // the page lifetime, and unwrapping it on every mount/unmount
      // cycle (e.g. under StrictMode) caused "Illegal invocation"
      // because the captured `originalFetch` reference went stale
      // after HMR. The wrapper is idempotent (re-installs are guarded
      // by __liafonFetchWrapped) and pass-through for non-API URLs,
      // so leaving it installed is safe.
    }
  }, [])
}
