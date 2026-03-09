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

import { useEffect, useCallback, useRef, startTransition } from 'react'

const TAB_HASHES = ['#home', '#schedule', '#clients', '#finances', '#safety']

type Screen =
  | { type: 'tab' }
  | { type: 'clientDetail'; clientId: string }
  | { type: 'bookingDetail'; bookingId: string }
  | { type: 'tourDetail'; tourId: string }
  | { type: 'analytics' }

interface NavState {
  tab: number
  screen: Screen
}

function stateToHash({ tab, screen }: NavState): string {
  if (screen.type === 'clientDetail')  return `#client/${screen.clientId}`
  if (screen.type === 'bookingDetail') return `#booking/${screen.bookingId}`
  if (screen.type === 'tourDetail')    return `#tour/${screen.tourId}`
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
  if (hash.startsWith('#tour/')) {
    const tourId = hash.slice('#tour/'.length)
    if (tourId) return { tab: 3, screen: { type: 'tourDetail', tourId } }
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
  // Track how many entries we've pushed so goBack knows if history.back() is safe
  const navDepth = useRef(0)

  // Seed the initial history entry so back-button has somewhere to go.
  // History-only — no setState, so no Suspense boundary issue.
  useEffect(() => {
    const hash = stateToHash({ tab: activeTab, screen })
    history.replaceState({ tab: activeTab, screen, _depth: 0 }, '', hash)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Back/forward button handler
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      // Derive navDepth from the popped state's _depth tag so forward
      // navigation doesn't underflow the counter.
      const poppedDepth = e.state && typeof (e.state as Record<string, unknown>)._depth === 'number'
        ? (e.state as Record<string, unknown>)._depth as number : 0
      navDepth.current = poppedDepth
      const state = e.state as NavState | null
      // Only trust state if it has a valid screen shape; other pushState
      // callers (e.g. settings overlay) use different state shapes.
      const isNavState = state && typeof state.tab === 'number' && state.screen && typeof state.screen.type === 'string'
      startTransition(() => {
        if (isNavState) {
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
    navDepth.current++
    history.pushState({ tab, screen, _depth: navDepth.current }, '', hash)
    startTransition(() => {
      setActiveTab(tab)
      setScreen(screen)
    })
  }, [setActiveTab, setScreen])

  /** Replace the current history entry (tab switches — don't pollute back stack). */
  const replaceNav = useCallback((tab: number, screen: Screen) => {
    const hash = stateToHash({ tab, screen })
    history.replaceState({ tab, screen, _depth: navDepth.current }, '', hash)
    startTransition(() => {
      setActiveTab(tab)
      setScreen(screen)
    })
  }, [setActiveTab, setScreen])

  return { pushNav, replaceNav, navDepth }
}
