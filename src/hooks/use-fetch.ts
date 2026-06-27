'use client'

import { useEffect, useState } from 'react'

/**
 * useDebounce
 *
 * Delays updating a value until `delayMs` has passed without changes.
 * Useful for search inputs that trigger network requests.
 *
 * This is the only hook exported from this file. The previous version
 * shipped a `useFetch` / `useMutation` / cache / dedup machinery that
 * was almost never used (every page hand-rolls fetch with `useCallback`)
 * — it added bundle weight and a real cache-poisoning bug. Removed in
 * v3.6.1 to keep the surface area minimal.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
