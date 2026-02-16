import { useState, useEffect } from 'react'
import { TabBar } from './components/TabBar'
import { PinLock } from './components/PinLock'
import { AppTour } from './components/AppTour'
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
import { Paywall, TrialBanner, needsPaywall } from './components/Paywall'
import { seedSampleData, hasSampleDataBeenOffered } from './data/sampleData'

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
  const [pinCode] = useLocalStorage('pinCode', '')
  const [isLocked, setIsLocked] = useState(true)

  // Paywall
  const [showPaywall, setShowPaywall] = useState(false)
  const [paywallDismissed, setPaywallDismissed] = useState(false)
  const [deepLinkCode, setDeepLinkCode] = useState<string | undefined>()

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

  // Tour
  const [hasSeenTour, setHasSeenTour] = useLocalStorage('hasCompletedAppTour', false)
  const [showTour, setShowTour] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('dark')
    // Show tour on first launch (after unlock)
    if (!hasSeenTour && (!pinEnabled || !isLocked)) {
      setTimeout(() => setShowTour(true), 500)
    }
  }, [isLocked])

  // Skip PIN if not enabled
  useEffect(() => {
    if (!pinEnabled) setIsLocked(false)
  }, [pinEnabled])

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

  function finishTour() {
    setShowTour(false)
    setHasSeenTour(true)
    // Seed sample data on first tour completion if never offered before
    if (!hasSampleDataBeenOffered()) {
      seedSampleData()
    }
  }

  function restartTour() {
    setShowSettings(false)
    setActiveTab(0)
    setScreen({ type: 'tab' })
    setTimeout(() => setShowTour(true), 300)
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
      {renderContent()}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
      <SettingsPage isOpen={showSettings} onClose={() => setShowSettings(false)} onRestartTour={restartTour} />
      <AppTour isActive={showTour} onFinish={finishTour} onTabChange={setActiveTab} />
    </div>
  )
}
