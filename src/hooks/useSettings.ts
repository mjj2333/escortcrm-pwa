import { useState, useEffect, useCallback } from 'react'

// Simple hook that syncs state with localStorage
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setStoredValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue
      localStorage.setItem(key, JSON.stringify(resolved))
      return resolved
    })
  }, [key])

  return [value, setStoredValue]
}

// App settings
export function useSettings() {
  const [defaultDepositPercentage, setDefaultDepositPercentage] = useLocalStorage('defaultDepositPercentage', 25)
  const [darkMode, setDarkMode] = useLocalStorage('darkMode', true)
  const [oledBlack, setOledBlack] = useLocalStorage('oledBlack', true)
  const [pinEnabled, setPinEnabled] = useLocalStorage('pinEnabled', false)
  const [pinCode, setPinCode] = useLocalStorage('pinCode', '')
  const [hasSeenTour, setHasSeenTour] = useLocalStorage('hasCompletedAppTour', false)

  // Apply dark mode class to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  return {
    defaultDepositPercentage, setDefaultDepositPercentage,
    darkMode, setDarkMode,
    oledBlack, setOledBlack,
    pinEnabled, setPinEnabled,
    pinCode, setPinCode,
    hasSeenTour, setHasSeenTour,
  }
}
