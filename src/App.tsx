import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { TabBar } from './components/TabBar'
import { PinLock, hashPin } from './components/PinLock'
import { WelcomeSplash } from './components/WelcomeSplash'
import { GuidedTour, TOUR_STEPS } from './components/GuidedTour'
import { HomePage } from './pages/home/HomePage'
import { ClientsPage } from './pages/clients/ClientsPage'
import { SchedulePage } from './pages/schedule/SchedulePage'
import { FinancesPage } from './pages/finances/FinancesPage'
import { SafetyPage } from './pages/safety/SafetyPage'
import { useLocalStorage } from './hooks/useSettings'

// Lazy-load secondary screens — only fetched when the user navigates to them
const ClientDetail = lazy(() => import('./pages/clients/ClientDetail').then(m => ({ default: m.ClientDetail })))
const BookingDetail = lazy(() => import('./pages/schedule/BookingDetail').then(m => ({ default: m.BookingDetail })))
const SettingsPage = lazy(() => import('./pages/home/SettingsPage').then(m => ({ default: m.SettingsPage })))
import { useAutoStatusTransitions } from './hooks/useAutoStatusTransitions'
import { useBookingReminders } from './hooks/useBookingReminders'
import { Paywall, FreeBanner, isActivated, revalidateActivation } from './components/Paywall'
import { ProGate } from './components/ProGate'
import { ToastContainer, showToast } from './components/Toast'

import { migrateToPaymentLedger } from './db'
import { initFieldEncryption } from './db/fieldCrypto'
import { useServiceWorker } from './hooks/useServiceWorker'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useHashNav, parseNavHash } from './hooks/useHashNav'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AlertTriangle } from 'lucide-react'

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

  // Service worker update detection
  const { updateAvailable, applyUpdate, canInstall, promptInstall } = useServiceWorker()

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
      hashPin(pinCode).then(hash => setPinCode(hash))
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
    })
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

  // Onboarding
  const [hasSeenTour, setHasSeenTour] = useLocalStorage('hasCompletedAppTour', false)
  const [showSplash, setShowSplash] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

  useEffect(() => {
    // Apply dark mode + OLED setting from localStorage
    const dm = localStorage.getItem('darkMode')
    const oled = localStorage.getItem('oledBlack')
    const isDark = dm === null ? true : JSON.parse(dm)
    const isOled = oled === null ? true : JSON.parse(oled)
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.classList.toggle('oled-black', isDark && isOled)
    // Show splash on first launch (after unlock)
    if (!hasSeenTour && (!pinEnabled || !isLocked)) {
      setTimeout(() => setShowSplash(true), 500)
    }
  }, [isLocked])

  // Skip PIN if not enabled
  useEffect(() => {
    if (!pinEnabled) setIsLocked(false)
  }, [pinEnabled])

  // Migrate existing bookings to payment ledger (one-time)
  useEffect(() => {
    migrateToPaymentLedger().catch(() => {})
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

  function finishOnboarding(dontShowAgain = true) {
    setShowSplash(false)
    setShowSetup(false)
    if (dontShowAgain) setHasSeenTour(true)
  }

  function startSetupGuide(dontShowAgain = true) {
    setShowSplash(false)
    setShowSetup(true)
    if (dontShowAgain) setHasSeenTour(true)
  }

  function finishTour() {
    setShowSetup(false)
    setHasSeenTour(true)
    // Return to Home tab
    replaceNav(0, { type: 'tab' })
  }

  /** Tab change for guided tour — updates tab without polluting history */
  function tourTabChange(tab: number) {
    setActiveTab(tab)
    setScreen({ type: 'tab' })
  }

  function restartTour() {
    setShowSettings(false)
    replaceNav(0, { type: 'tab' })
    setTimeout(() => setShowSetup(true), 300)
  }

  // PIN Lock Screen
  if (pinEnabled && isLocked) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
        <PinLock correctPin={pinCode} onUnlock={async (plaintextPin) => {
          await initFieldEncryption(plaintextPin)
          setIsLocked(false)
        }} />
      </div>
    )
  }

  // Paywall — shown when user requests upgrade (never blocks app)
  if (showPaywall) {
    return (
      <Paywall
        onActivated={() => {
          setShowPaywall(false)
          setDeepLinkCode(undefined)
        }}
        onClose={() => { setShowPaywall(false); setDeepLinkCode(undefined); }}
        initialCode={deepLinkCode}
      />
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
            <ProGate feature="Finances & Analytics" onUpgrade={() => setShowPaywall(true)} bypass={showSetup}>
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
      {canInstall && (
        <div
          style={{ backgroundColor: '#7c3aed', color: '#fff', paddingTop: updateAvailable ? '10px' : 'calc(env(safe-area-inset-top, 0px) + 10px)', paddingBottom: '10px', paddingLeft: '16px', paddingRight: '16px', textAlign: 'center', fontSize: '13px', fontWeight: 500 }}
        >
          Install Companion for the best experience.{' '}
          <button
            onClick={promptInstall}
            style={{ background: 'none', border: 'none', color: '#fff', textDecoration: 'underline', fontWeight: 700, fontSize: '13px', cursor: 'pointer', padding: '8px 12px', margin: '-8px -12px' }}
          >
            Install now
          </button>
        </div>
      )}
      {!isOnline && (
        <div
          style={{
            backgroundColor: 'rgba(30,30,30,0.97)',
            color: '#facc15',
            paddingTop: (updateAvailable || canInstall) ? '10px' : 'calc(env(safe-area-inset-top, 0px) + 10px)',
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
          You're offline — payment verification and gift codes unavailable
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
            <SettingsPage onClose={() => setShowSettings(false)} onRestartTour={restartTour} onShowPaywall={() => setShowPaywall(true)} />
          </ErrorBoundary>
        </Suspense>
      )}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
      {showSplash && <WelcomeSplash onComplete={finishOnboarding} onStartSetup={startSetupGuide} />}
      {showSetup && <GuidedTour steps={TOUR_STEPS} onComplete={finishTour} onTabChange={tourTabChange} />}
    </div>
  )
}
