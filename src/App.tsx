import { useState, useEffect } from 'react'
import { TabBar } from './components/TabBar'
import { PinLock, hashPin } from './components/PinLock'
import { WelcomeSplash } from './components/WelcomeSplash'
import { SetupGuide } from './components/SetupGuide'
import { HomePage } from './pages/home/HomePage'
import { ClientsPage } from './pages/clients/ClientsPage'
import { ClientDetail } from './pages/clients/ClientDetail'
import { SchedulePage } from './pages/schedule/SchedulePage'
import { BookingDetail } from './pages/schedule/BookingDetail'
import { FinancesPage } from './pages/finances/FinancesPage'
import { AnalyticsPage } from './pages/finances/AnalyticsPage'
import { SafetyPage } from './pages/safety/SafetyPage'
import { SettingsPage } from './pages/home/SettingsPage'
import { useLocalStorage } from './hooks/useSettings'
import { useAutoStatusTransitions } from './hooks/useAutoStatusTransitions'
import { useBookingReminders } from './hooks/useBookingReminders'
import { Paywall, TrialBanner, needsPaywall, revalidateActivation } from './components/Paywall'
import { ToastContainer } from './components/Toast'
import { seedSampleData, hasSampleDataBeenOffered } from './data/sampleData'
import { db, migrateToPaymentLedger } from './db'

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
  useEffect(() => {
    // Capture current state before async check
    const wasActivated = !needsPaywall()
    revalidateActivation().then(valid => {
      if (wasActivated && !valid) {
        // Subscription was revoked server-side — force paywall
        setShowPaywall(true)
        setPaywallDismissed(false)
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
        <PinLock correctPin={pinCode} onUnlock={() => setIsLocked(false)} />
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
        return <FinancesPage onOpenAnalytics={() => setScreen({ type: 'analytics' })} />
      case 4:
        return <SafetyPage />
      default:
        return null
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <TrialBanner onUpgrade={() => setShowPaywall(true)} />
      <ToastContainer />
      {renderContent()}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
      <SettingsPage isOpen={showSettings} onClose={() => setShowSettings(false)} onRestartTour={restartTour} />
      {showSplash && <WelcomeSplash onComplete={finishOnboarding} onStartSetup={startSetupGuide} />}
      {showSetup && <SetupGuide onComplete={finishOnboarding} onTabChange={setActiveTab} />}
    </div>
  )
}
