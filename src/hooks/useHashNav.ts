// ── Hash-based navigation for PWA back-button + deep linking ──────────────
//
// Route format:
//   #home         → tab 0
//   #schedule     → tab 1
//   #clients      → tab 2
//   #finances     → tab 3
//   #safety       → tab 4
//   #client/ID    → clientDetail screen
//   #booking/ID   → bookingDetail screen
//   #analytics    → analytics screen
//
// Pattern:
//   1. App.tsx initializes useState directly from parseNavHash() — no post-mount
//      setState, which would trigger React error #310 in Suspense boundaries.
//   2. useHashNav only wires up the popstate listener and provides pushNav/replaceNav.
//   3. On mount, history.replaceState seeds the initial entry (no setState needed).

import { useEffect, useCallback, startTransition } from 'react'

const TAB_HASHES = ['#home', '#schedule', '#clients', '#finances', '#safety']

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

/** Parse a URL hash string into { tab, screen }. Exported so App can use it
 *  as a useState initializer — avoids any post-mount state update. */
export function parseNavHash(hash: string): NavState {
  if (hash.startsWith('#client/')) {
    const clientId = hash.slice('#client/'.length)
    if (clientId) return { tab: 2, screen: { type: 'clientDetail', clientId } }
  }
  if (hash.startsWith('#booking/')) {
    const bookingId = hash.slice('#booking/'.length)
    if (bookingId) return { tab: 1, screen: { type: 'bookingDetail', bookingId } }
  }
  if (hash === '#analytics') return { tab: 3, screen: { type: 'analytics' } }
  const tab = TAB_HASHES.indexOf(hash)
  return { tab: tab >= 0 ? tab : 0, screen: { type: 'tab' } }
}

export function useHashNav(
  activeTab: number,
  screen: Screen,
  setActiveTab: (tab: number) => void,
  setScreen: (screen: Screen) => void,
) {
  // Seed the initial history entry so back-button has somewhere to go.
  // History-only — no setState, so no Suspense boundary issue.
  useEffect(() => {
    const hash = stateToHash({ tab: activeTab, screen })
    history.replaceState({ tab: activeTab, screen }, '', hash)
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
          const { tab, screen } = parseNavHash(window.location.hash)
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
