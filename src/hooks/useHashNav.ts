// ── Hash-based navigation for PWA back-button + deep linking ──────────────
//
// Route format:
//   #home         → tab 0
//   #clients      → tab 1
//   #schedule     → tab 2
//   #finances     → tab 3
//   #safety       → tab 4
//   #client/ID    → clientDetail screen
//   #booking/ID   → bookingDetail screen
//   #analytics    → analytics screen
//
// Usage in App.tsx:
//   const { pushNav, replaceNav } = useHashNav(setActiveTab, setScreen)
//   Replace setActiveTab / setScreen calls with pushNav / replaceNav.
//   The hook also listens to popstate to drive state from the back button.

import { useEffect, useCallback, startTransition } from 'react'

const TAB_HASHES = ['#home', '#clients', '#schedule', '#finances', '#safety']

type Screen =
  | { type: 'tab' }
  | { type: 'clientDetail'; clientId: string }
  | { type: 'bookingDetail'; bookingId: string }
  | { type: 'analytics' }

interface NavState {
  tab: number
  screen: Screen
}

function stateToHash({ tab, screen }: NavState): string {
  if (screen.type === 'clientDetail')  return `#client/${screen.clientId}`
  if (screen.type === 'bookingDetail') return `#booking/${screen.bookingId}`
  if (screen.type === 'analytics')     return '#analytics'
  return TAB_HASHES[tab] ?? '#home'
}

function hashToState(hash: string): NavState {
  if (hash.startsWith('#client/')) {
    const clientId = hash.slice('#client/'.length)
    if (clientId) return { tab: 1, screen: { type: 'clientDetail', clientId } }
  }
  if (hash.startsWith('#booking/')) {
    const bookingId = hash.slice('#booking/'.length)
    if (bookingId) return { tab: 2, screen: { type: 'bookingDetail', bookingId } }
  }
  if (hash === '#analytics') return { tab: 3, screen: { type: 'analytics' } }
  const tab = TAB_HASHES.indexOf(hash)
  return { tab: tab >= 0 ? tab : 0, screen: { type: 'tab' } }
}

export function useHashNav(
  setActiveTab: (tab: number) => void,
  setScreen: (screen: Screen) => void,
) {
  // On mount: restore state from current hash (deep link / refresh)
  useEffect(() => {
    const hash = window.location.hash || '#home'
    const { tab, screen } = hashToState(hash)
    // Replace so the initial state is in history
    const initialHash = stateToHash({ tab, screen })
    history.replaceState({ tab, screen }, '', initialHash)
    // startTransition prevents React error #310 (Suspense boundary reactivation)
    // when this state update fires while a lazy component is mid-load
    startTransition(() => {
      setActiveTab(tab)
      setScreen(screen)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Back/forward button handler
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const state = e.state as NavState | null
      startTransition(() => {
        if (state) {
          setActiveTab(state.tab)
          setScreen(state.screen)
        } else {
          // No state on the entry — parse from hash as fallback
          const { tab, screen } = hashToState(window.location.hash)
          setActiveTab(tab)
          setScreen(screen)
        }
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [setActiveTab, setScreen])

  /** Push a new navigation entry (adds to browser history). */
  const pushNav = useCallback((tab: number, screen: Screen) => {
    const hash = stateToHash({ tab, screen })
    history.pushState({ tab, screen }, '', hash)
    startTransition(() => {
      setActiveTab(tab)
      setScreen(screen)
    })
  }, [setActiveTab, setScreen])

  /** Replace the current history entry (tab switches — don't pollute back stack). */
  const replaceNav = useCallback((tab: number, screen: Screen) => {
    const hash = stateToHash({ tab, screen })
    history.replaceState({ tab, screen }, '', hash)
    startTransition(() => {
      setActiveTab(tab)
      setScreen(screen)
    })
  }, [setActiveTab, setScreen])

  return { pushNav, replaceNav }
}
