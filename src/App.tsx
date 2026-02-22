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
import { Paywall, TrialBanner, needsPaywall, revalidateActivation, initTrialState } from './components/Paywall'
import { ToastContainer, showToast } from './components/Toast'
import { seedSampleData, hasSampleDataBeenOffered } from './data/sampleData'
import { db, migrateToPaymentLedger } from './db'
import { initFieldEncryption } from './db/fieldCrypto'
import { useServiceWorker } from './hooks/useServiceWorker'
import { useOnlineStatus } from './hooks/useOnlineStatus'

type Screen =
  | { type: 'tab' }
  | { type: 'clientDetail'; clientId: string }
  | { type: 'bookingDetail'; bookingId: string }
  | { type: 'analytics' }

export default function App() {
  const [activeTab, setActiveTab] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [screen, setScreen] = useState<Screen>({ type: 'tab' })

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
  const [paywallDismissed, setPaywallDismissed] = useState(false)
  const [deepLinkCode, setDeepLinkCode] = useState<string | undefined>()

  // Revalidate activation with server on each app launch
  // initTrialState() must run first so needsPaywall() has accurate trial data
  useEffect(() => {
    initTrialState().then(() => {
      // Capture current state after trial is loaded
      const wasActivated = !needsPaywall()
      revalidateActivation().then(valid => {
        if (wasActivated && !valid) {
          // Subscription was revoked server-side — force paywall
          setShowPaywall(true)
          setPaywallDismissed(false)
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

  function handleTabChange(tab: number) {
    setActiveTab(tab)
    setScreen({ type: 'tab' })
  }

  function openClient(clientId: string) {
    setActiveTab(1)
    setScreen({ type: 'clientDetail', clientId })
  }

  function openBooking(bookingId: string) {
    setActiveTab(2)
    setScreen({ type: 'bookingDetail', bookingId })
  }

  function goBack() {
    setScreen({ type: 'tab' })
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
    setActiveTab(0)
    setScreen({ type: 'tab' })
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

  // Paywall — show when trial expired and not activated
  if ((needsPaywall() && !paywallDismissed) || showPaywall) {
    return (
      <Paywall
        onActivated={() => {
          setShowPaywall(false)
          setPaywallDismissed(true)
          setDeepLinkCode(undefined)
        }}
        onClose={showPaywall && !needsPaywall() ? () => { setShowPaywall(false); setDeepLinkCode(undefined); } : undefined}
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
        />
      )
    }
    if (screen.type === 'bookingDetail') {
      return (
        <BookingDetail
          bookingId={screen.bookingId}
          onBack={goBack}
          onOpenClient={openClient}
        />
      )
    }
    if (screen.type === 'analytics') {
      return <AnalyticsPage onBack={goBack} />
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
        return <ClientsPage onOpenClient={openClient} />
      case 2:
        return <SchedulePage onOpenBooking={openBooking} />
      case 3:
        return <FinancesPage onOpenAnalytics={() => setScreen({ type: 'analytics' })} onOpenBooking={openBooking} />
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
          <SettingsPage isOpen={showSettings} onClose={() => setShowSettings(false)} onRestartTour={restartTour} />
        </Suspense>
      )}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
      {showSplash && <WelcomeSplash onComplete={finishOnboarding} onStartSetup={startSetupGuide} />}
      {showSetup && <SetupGuide onComplete={finishOnboarding} onTabChange={setActiveTab} />}
    </div>
  )
}
