import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { TabBar } from './components/TabBar'
import { PinLock, hashPin } from './components/PinLock'
import { HomePage } from './pages/home/HomePage'

// Lazy-load tab pages — only fetched when the user switches to that tab
const SchedulePage = lazy(() => import('./pages/schedule/SchedulePage').then(m => ({ default: m.SchedulePage })))
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage').then(m => ({ default: m.ClientsPage })))
const FinancesPage = lazy(() => import('./pages/finances/FinancesPage').then(m => ({ default: m.FinancesPage })))
const SafetyPage = lazy(() => import('./pages/safety/SafetyPage').then(m => ({ default: m.SafetyPage })))
import { useLocalStorage } from './hooks/useSettings'

// Lazy-load secondary screens — only fetched when the user navigates to them
const ClientDetail = lazy(() => import('./pages/clients/ClientDetail').then(m => ({ default: m.ClientDetail })))
const BookingDetail = lazy(() => import('./pages/schedule/BookingDetail').then(m => ({ default: m.BookingDetail })))
const SettingsPage = lazy(() => import('./pages/home/SettingsPage').then(m => ({ default: m.SettingsPage })))
const Calculator = lazy(() => import('./components/Calculator'))
import { useAutoStatusTransitions } from './hooks/useAutoStatusTransitions'
import { useBookingReminders } from './hooks/useBookingReminders'
import { isActivated, revalidateActivation } from './components/paywallState'
import { FreeBanner } from './components/FreeBanner'
const Paywall = lazy(() => import('./components/Paywall').then(m => ({ default: m.Paywall })))
import { ProGate } from './components/ProGate'
import { ToastContainer, showToast } from './components/Toast'

import { migrateToPaymentLedger } from './db'
import { initFieldEncryption } from './db/fieldCrypto'
import { useServiceWorker } from './hooks/useServiceWorker'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useHashNav, parseNavHash } from './hooks/useHashNav'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AlertTriangle } from 'lucide-react'

// Theme is applied in index.html inline script (before any JS modules load) to prevent FOUC.
// Do NOT duplicate that logic here — the inline script is the single source of truth for the
// localStorage prefix ('c_') used for theme keys. See index.html lines 15-38.

type Screen =
  | { type: 'tab' }
  | { type: 'clientDetail'; clientId: string }
  | { type: 'bookingDetail'; bookingId: string }
  | { type: 'analytics' }

function RouteErrorFallback() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: '60vh' }}>
      <AlertTriangle size={32} color="#ef4444" className="mb-3" />
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Something went wrong</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>This section hit an unexpected error.</p>
      <button
        onClick={() => history.back()}
        className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-purple-600 active:scale-[0.97]"
      >
        Go back
      </button>
    </div>
  )
}

export default function App() {
  // Initialize nav state directly from hash — avoids a post-mount setState
  // which would trigger React error #310 (Suspense boundary reactivation)
  const [activeTab, setActiveTab] = useState<number>(() => {
    const { tab } = parseNavHash(window.location.hash || '#home')
    return tab
  })
  const [showSettings, setShowSettings] = useState(false)
  const [screen, setScreen] = useState<Screen>(() => {
    const { screen } = parseNavHash(window.location.hash || '#home')
    return screen
  })

  // PIN lock
  const [pinEnabled] = useLocalStorage('pinEnabled', false)
  const [pinCode, setPinCode] = useLocalStorage('pinCode', '')
  const [isLocked, setIsLocked] = useState(true)

  // Stealth mode
  const [stealthEnabled] = useLocalStorage('stealthEnabled', false)
  const [isStealthMode, setIsStealthMode] = useState(false)

  // Service worker update detection
  const { updateAvailable, applyUpdate, canInstall, promptInstall, dismissInstall } = useServiceWorker()
  const [installNeverAsk, setInstallNeverAsk] = useState(false)

  // Online/offline detection
  const isOnline = useOnlineStatus()
  const wasOfflineRef = useRef(false)
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false
      showToast('Back online', 'success')
    }
  }, [isOnline])

  // One-time migration: hash any existing plaintext PIN (4-digit numeric string)
  useEffect(() => {
    if (pinEnabled && pinCode && pinCode.length <= 6 && /^\d+$/.test(pinCode)) {
      hashPin(pinCode).then(hash => setPinCode(hash)).catch(() => {})
    }
  }, [])

  // Paywall
  const [showPaywall, setShowPaywall] = useState(false)
  const [deepLinkCode, setDeepLinkCode] = useState<string | undefined>()

  // Revalidate activation with server on each app launch
  useEffect(() => {
    const hadPaidActivation = isActivated()
    revalidateActivation().then(valid => {
      if (hadPaidActivation && !valid) {
        // Subscription was revoked server-side — force paywall
        setShowPaywall(true)
      }
    }).catch(() => {})
  }, [])
  // Check for ?code= URL param (deep link from share)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      setDeepLinkCode(code)
      setShowPaywall(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Auto-advance booking statuses based on time
  useAutoStatusTransitions()

  // Booking & birthday reminders via Notification API
  const [remindersEnabled] = useLocalStorage('remindersEnabled', false)
  useBookingReminders(remindersEnabled)

  // Theme is applied synchronously at module level (above) to prevent FOUC

  // Skip PIN if not enabled
  useEffect(() => {
    if (!pinEnabled) setIsLocked(false)
  }, [pinEnabled])

  // Re-lock when app is backgrounded (tab hidden / screen off) with grace period
  const LOCK_GRACE_PERIOD_MS = 30_000 // 30 seconds
  const hiddenAtRef = useRef<number>(0)
  useEffect(() => {
    if (!pinEnabled) return
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
      } else if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - hiddenAtRef.current
        if (hiddenAtRef.current > 0 && elapsed >= LOCK_GRACE_PERIOD_MS) {
          setIsLocked(true)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [pinEnabled])

  // Migrate existing bookings to payment ledger (one-time)
  useEffect(() => {
    migrateToPaymentLedger().catch(err => console.error('Payment ledger migration failed:', err))
  }, [])

  const { pushNav, replaceNav } = useHashNav(activeTab, screen, setActiveTab, setScreen)

  function handleTabChange(tab: number) {
    // Tab switches replace history — tapping tabs shouldn't pollute the back stack
    replaceNav(tab, { type: 'tab' })
  }

  function openClient(clientId: string) {
    pushNav(2, { type: 'clientDetail', clientId })
  }

  function openBooking(bookingId: string) {
    pushNav(1, { type: 'bookingDetail', bookingId })
  }

  function goBack() {
    // Prefer browser back so the history stack stays consistent
    if (history.length > 1) {
      history.back()
    } else {
      replaceNav(activeTab, { type: 'tab' })
    }
  }

  // PIN Lock Screen
  if (pinEnabled && isLocked) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
        <PinLock correctPin={pinCode} onUnlock={async (plaintextPin) => {
          try {
            await initFieldEncryption(plaintextPin)
            setIsLocked(false)
          } catch (err) {
            console.error('Encryption init failed:', err)
            setIsLocked(false) // unlock anyway so user isn't stuck
          }
        }} />
      </div>
    )
  }

  // Paywall — shown when user requests upgrade (never blocks app)
  if (showPaywall) {
    return (
      <Suspense fallback={null}>
        <Paywall
          onActivated={() => {
            setShowPaywall(false)
            setDeepLinkCode(undefined)
          }}
          onClose={() => { setShowPaywall(false); setDeepLinkCode(undefined); }}
          initialCode={deepLinkCode}
        />
      </Suspense>
    )
  }

  // Stealth mode — full-screen calculator disguise
  if (isStealthMode) {
    return (
      <Suspense fallback={<div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', zIndex: 200 }} />}>
        <Calculator onExit={() => setIsStealthMode(false)} pinHash={pinCode} />
      </Suspense>
    )
  }

  function renderContent() {
    if (screen.type === 'clientDetail') {
      return (
        <ErrorBoundary fallback={<RouteErrorFallback />}>
          <ClientDetail
            clientId={screen.clientId}
            onBack={goBack}
            onOpenBooking={openBooking}
            onShowPaywall={() => setShowPaywall(true)}
          />
        </ErrorBoundary>
      )
    }
    if (screen.type === 'bookingDetail') {
      return (
        <ErrorBoundary fallback={<RouteErrorFallback />}>
          <BookingDetail
            bookingId={screen.bookingId}
            onBack={goBack}
            onOpenClient={openClient}
            onShowPaywall={() => setShowPaywall(true)}
          />
        </ErrorBoundary>
      )
    }

    switch (activeTab) {
      case 0:
        return (
          <ErrorBoundary fallback={<RouteErrorFallback />}>
            <HomePage
              onNavigateTab={handleTabChange}
              onOpenSettings={() => setShowSettings(true)}
              onOpenBooking={openBooking}
              onOpenClient={openClient}
            />
          </ErrorBoundary>
        )
      case 1:
        return <ErrorBoundary fallback={<RouteErrorFallback />}><SchedulePage onOpenBooking={openBooking} /></ErrorBoundary>
      case 2:
        return <ErrorBoundary fallback={<RouteErrorFallback />}><ClientsPage onOpenClient={openClient} /></ErrorBoundary>
      case 3:
        return (
          <ErrorBoundary fallback={<RouteErrorFallback />}>
            <ProGate feature="Finances & Analytics" onUpgrade={() => setShowPaywall(true)}>
              <FinancesPage onOpenBooking={openBooking} />
            </ProGate>
          </ErrorBoundary>
        )
      case 4:
        return <ErrorBoundary fallback={<RouteErrorFallback />}><SafetyPage /></ErrorBoundary>
      default:
        return null
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      {updateAvailable && (
        <div
          style={{ backgroundColor: '#7c3aed', color: '#fff', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)', paddingBottom: '10px', paddingLeft: '16px', paddingRight: '16px', textAlign: 'center', fontSize: '13px', fontWeight: 500 }}
        >
          A new version is available.{' '}
          <button
            onClick={applyUpdate}
            style={{ background: 'none', border: 'none', color: '#fff', textDecoration: 'underline', fontWeight: 700, fontSize: '13px', cursor: 'pointer', padding: '8px 12px', margin: '-8px -12px' }}
          >
            Refresh to update
          </button>
        </div>
      )}
      {!isOnline && (
        <div
          style={{
            backgroundColor: 'rgba(30,30,30,0.97)',
            color: '#facc15',
            paddingTop: updateAvailable ? '10px' : 'calc(env(safe-area-inset-top, 0px) + 10px)',
            paddingBottom: '10px',
            paddingLeft: '16px',
            paddingRight: '16px',
            textAlign: 'center',
            fontSize: '12px',
            fontWeight: 500,
            borderBottom: '1px solid rgba(250,204,21,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <span style={{ fontSize: '14px' }}>⚡</span>
          You're offline — some features require a connection
        </div>
      )}
      <FreeBanner onUpgrade={() => setShowPaywall(true)} />
      <ToastContainer />
      <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }} />}>
        {renderContent()}
      </Suspense>
      {showSettings && (
        <Suspense fallback={null}>
          <ErrorBoundary fallback={<RouteErrorFallback />}>
            <SettingsPage onClose={() => setShowSettings(false)} onShowPaywall={() => setShowPaywall(true)} />
          </ErrorBoundary>
        </Suspense>
      )}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} onStealthTrigger={stealthEnabled && pinEnabled ? () => setIsStealthMode(true) : undefined} />
      {canInstall && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-labelledby="install-prompt-title" style={{ pointerEvents: 'none' }}>
          <div className="absolute inset-0 bg-black/40" style={{ pointerEvents: 'auto' }} onClick={() => dismissInstall(installNeverAsk)} />
          <div
            className="relative w-full max-w-md rounded-t-2xl p-5 pb-8 animate-slide-up"
            style={{ backgroundColor: 'var(--bg-card)', pointerEvents: 'auto', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}
          >
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-600 flex items-center justify-center text-2xl shadow-lg">
                <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-lg" />
              </div>
              <h2 id="install-prompt-title" className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Install Companion</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Add to your home screen for quick access, offline support, and the full app experience.
              </p>
              <button
                onClick={promptInstall}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-purple-600 active:scale-[0.97] transition-transform"
              >
                Install
              </button>
              <button
                onClick={() => dismissInstall(installNeverAsk)}
                className="text-sm font-medium py-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Not now
              </button>
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>
                <input
                  type="checkbox"
                  checked={installNeverAsk}
                  onChange={e => setInstallNeverAsk(e.target.checked)}
                  className="rounded"
                />
                Don't ask again
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
