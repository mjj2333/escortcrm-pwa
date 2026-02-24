import { useState, useCallback, useEffect } from 'react'

// Simple hook that syncs state with localStorage
// Dispatches a custom event so other components using the same key re-render
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  // Listen for changes from other components using the same key
  useEffect(() => {
    function onSync(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.key === key) {
        setValue(detail.value)
      }
    }
    window.addEventListener('ls-sync', onSync)
    return () => window.removeEventListener('ls-sync', onSync)
  }, [key])

  const setStoredValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue
      localStorage.setItem(key, JSON.stringify(resolved))
      // Notify other hooks using the same key
      window.dispatchEvent(new CustomEvent('ls-sync', { detail: { key, value: resolved } }))
      return resolved
    })
  }, [key])

  return [value, setStoredValue]
}
