import { useState, useCallback, useEffect } from 'react'

/** Prefix for all app localStorage keys to avoid collisions with other scripts on the same origin */
export const LS_PREFIX = 'c_'

/** Prefix a key for direct localStorage access. Use this when reading/writing outside of useLocalStorage. */
export function lsKey(key: string): string { return LS_PREFIX + key }

// Simple hook that syncs state with localStorage
// Dispatches a custom event so other components using the same key re-render
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = LS_PREFIX + key
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return stored ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  // Listen for changes from other components using the same key
  useEffect(() => {
    function onSync(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.key === storageKey) {
        setValue(detail.value)
      }
    }
    window.addEventListener('ls-sync', onSync)
    return () => window.removeEventListener('ls-sync', onSync)
  }, [storageKey])

  const setStoredValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue
      localStorage.setItem(storageKey, JSON.stringify(resolved))
      // Notify other hooks using the same key
      window.dispatchEvent(new CustomEvent('ls-sync', { detail: { key: storageKey, value: resolved } }))
      return resolved
    })
  }, [storageKey])

  return [value, setStoredValue]
}
