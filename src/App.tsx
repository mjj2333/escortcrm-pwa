import { useState, useEffect, lazy, Suspense } from 'react'
import { TabBar } from './components/TabBar'
import { PinLock, hashPin } from './components/PinLock'
import { WelcomeSplash } from './components/WelcomeSplash'
import { SetupGuide } from './components/SetupGuide'
import { HomePage } from './pages/home/HomePage'
import { ClientsPage } from './pages/clients/ClientsPage'
import { SchedulePage } from './pages/schedule/SchedulePage'
import { FinancesPage } from './pages/finances/FinancesPage'
import { SafetyPage } from './pages/safety/SafetyPage'
import { useLocalStorage } from './hooks/useSettings'

// Lazy-load secondary screens — only fetched when the user navigates to them
const ClientDetail = lazy(() => import('./pages/clients/ClientDetail').then(m => ({ default: m.ClientDetail })))
const BookingDetail = lazy(() => import('./pages/schedule/BookingDetail').then(m => ({ default: m.BookingDetail })))
const AnalyticsPage = lazy(() => import('./pages/finances/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })))
const SettingsPage = lazy(() => import('./pages/home/SettingsPage').then(m => ({ default: m.SettingsPage })))
import { useAutoStatusTransitions } from './hooks/useAutoStatusTransitions'
import { useBookingReminders } from './hooks/useBookingReminders'
import { Paywall, TrialBanner, isActivated, revalidateActivation, initTrialState } from './components/Paywall'
import { ProGate } from './components/ProGate'
import { ToastContainer, showToast } from './components/Toast'
import { seedSampleData, hasSampleDataBeenOffered } from './data/sampleData'
import { db, migrateToPaymentLedger } from './db'
import { initFieldEncryption } from './db/fieldCrypto'
import { useServiceWorker } from './hooks/useServiceWorker'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useHashNav, parseNavHash } from './hooks/useHashNav'

type Screen =
  | { type: 'tab' }
  | { type: 'clientDetail'; clientId: string }
  | { type: 'bookingDetail'; bookingId: string }
  | { type: 'analytics' }

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
  const { updateAvailable, applyUpdate } = useServiceWorker()

  // Online/offline detection
  const isOnline = useOnlineStatus()
  const [wasOffline, setWasOffline] = useState(false)
  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true)
    } else if (wasOffline) {
      setWasOffline(false)
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
  // initTrialState() must run first so needsPaywall() has accurate trial data
  useEffect(() => {
    initTrialState().then(() => {
      // Only check revalidation if user has an actual paid activation —
      // trial-only users have no subscription to revoke
      const hadPaidActivation = isActivated()
      revalidateActivation().then(valid => {
        if (hadPaidActivation && !valid) {
          // Subscription was revoked server-side — force paywall
          setShowPaywall(true)
        }
      })
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

  // Seed sample data if DB is empty and never offered
  useEffect(() => {
    if (!hasSampleDataBeenOffered()) {
      db.clients.count().then(count => {
        if (count === 0) seedSampleData()
      })
    }
  }, [])

  // Migrate existing bookings to payment ledger (one-time)
  useEffect(() => {
    migrateToPaymentLedger()
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

  function finishOnboarding() {
    setShowSplash(false)
    setShowSetup(false)
    setHasSeenTour(true)
    // Seed sample data on first completion if never offered before
    if (!hasSampleDataBeenOffered()) {
      seedSampleData()
    }
  }

  function startSetupGuide() {
    setShowSplash(false)
    setShowSetup(true)
  }

  function restartTour() {
    setShowSettings(false)
    replaceNav(0, { type: 'tab' })
    setTimeout(() => setShowSplash(true), 300)
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
        <ClientDetail
          clientId={screen.clientId}
          onBack={goBack}
          onOpenBooking={openBooking}
          onShowPaywall={() => setShowPaywall(true)}
        />
      )
    }
    if (screen.type === 'bookingDetail') {
      return (
        <BookingDetail
          bookingId={screen.bookingId}
          onBack={goBack}
          onOpenClient={openClient}
          onShowPaywall={() => setShowPaywall(true)}
        />
      )
    }
    if (screen.type === 'analytics') {
      return (
        <ProGate feature="Analytics" onUpgrade={() => setShowPaywall(true)}>
          <AnalyticsPage onBack={goBack} />
        </ProGate>
      )
    }

    switch (activeTab) {
      case 0:
        return (
          <HomePage
            onNavigateTab={handleTabChange}
            onOpenSettings={() => setShowSettings(true)}
            onOpenBooking={openBooking}
            onOpenClient={openClient}
          />
        )
      case 1:
        return <SchedulePage onOpenBooking={openBooking} />
      case 2:
        return <ClientsPage onOpenClient={openClient} />
      case 3:
        return (
          <ProGate feature="Finances & Analytics" onUpgrade={() => setShowPaywall(true)}>
            <FinancesPage onOpenAnalytics={() => pushNav(3, { type: 'analytics' })} onOpenBooking={openBooking} />
          </ProGate>
        )
      case 4:
        return <SafetyPage />
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
            style={{ background: 'none', border: 'none', color: '#fff', textDecoration: 'underline', fontWeight: 700, fontSize: '13px', cursor: 'pointer', padding: 0 }}
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
          You're offline — payment verification and gift codes unavailable
        </div>
      )}
      <TrialBanner onUpgrade={() => setShowPaywall(true)} />
      <ToastContainer />
      <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }} />}>
        {renderContent()}
      </Suspense>
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsPage onClose={() => setShowSettings(false)} onRestartTour={restartTour} onShowPaywall={() => setShowPaywall(true)} />
        </Suspense>
      )}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
      {showSplash && <WelcomeSplash onComplete={finishOnboarding} onStartSetup={startSetupGuide} />}
      {showSetup && <SetupGuide onComplete={finishOnboarding} onTabChange={setActiveTab} />}
    </div>
  )
}
