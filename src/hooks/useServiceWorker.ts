// src/hooks/useServiceWorker.ts
// Registers the service worker, detects updates, and handles PWA install prompt.

import { useState, useEffect, useCallback } from 'react'
import { lsKey } from './useSettings'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function useServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  // Already running as installed PWA — never show install prompt
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true // iOS Safari

  useEffect(() => {
    // Capture the beforeinstallprompt event for custom install button (skip in standalone)
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    if (!isStandalone) {
      const dismissed = localStorage.getItem(lsKey('installDismissed'))
      if (dismissed !== 'true') {
        window.addEventListener('beforeinstallprompt', onBeforeInstall)
      }
    }

    if (!('serviceWorker' in navigator)) return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    }

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
    }).catch(err => console.warn('Service worker registration failed:', err))

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
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    // The controllerchange listener above will reload the page
  }, [waitingWorker])

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setInstallPrompt(null)
    }
  }, [installPrompt])

  const dismissInstall = useCallback((neverAskAgain: boolean) => {
    setInstallPrompt(null)
    if (neverAskAgain) {
      localStorage.setItem(lsKey('installDismissed'), 'true')
    }
  }, [])

  return {
    updateAvailable,
    applyUpdate,
    canInstall: !!installPrompt,
    promptInstall,
    dismissInstall,
  }
}
