// src/hooks/useServiceWorker.ts
// Registers the service worker and detects when a new version is waiting.
// Returns { updateAvailable, applyUpdate } so the UI can prompt the user.

import { useState, useEffect, useCallback } from 'react'

export function useServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    function trackWaiting(sw: ServiceWorker) {
      setWaitingWorker(sw)
      setUpdateAvailable(true)
    }

    navigator.serviceWorker.register('/sw.js').then((registration) => {

      // If a worker is already waiting (e.g. user ignored the prompt last time)
      if (registration.waiting) {
        trackWaiting(registration.waiting)
        return
      }

      // A new worker just finished installing → it's now waiting
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            // New version installed but waiting — existing tab is controlled by old SW
            trackWaiting(installing)
          }
        })
      })
    }).catch(() => {})

    // When the new SW activates (after skipWaiting), reload to pick up new assets
    let refreshing = false
    function onControllerChange() {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    // The controllerchange listener above will reload the page
  }, [waitingWorker])

  return { updateAvailable, applyUpdate }
}
