import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface TourStep {
  tab: number
  section: string
  icon: string
  title: string
  description: string
  tip?: string
}

const tourSteps: TourStep[] = [
  // Welcome (tab 0)
  { tab: 0, section: 'Welcome', icon: '✨', title: 'Welcome to EscortCRM', description: 'Your private, offline booking and client management app. All data stays on your device — nothing is sent to any server.', tip: 'Install this as an app from your browser menu for the best experience.' },

  // Home (tab 0)
  { tab: 0, section: 'Home', icon: '🏠', title: 'Your Dashboard', description: 'See today\'s bookings, upcoming appointments, weekly and monthly income at a glance.', },
  { tab: 0, section: 'Home', icon: '🟢', title: 'Availability Status', description: 'Your current availability shows at the top. Tap it to go to the Schedule tab where you can set your status for any day.', },
  { tab: 0, section: 'Home', icon: '🚨', title: 'Safety Alerts', description: 'When you have pending safety check-ins, a red banner appears at the top of your dashboard. Tap it to go directly to Safety.', },
  { tab: 0, section: 'Home', icon: '⚙️', title: 'Settings', description: 'Tap the gear icon to set your service rates, default deposit percentage, appearance, and PIN lock.', tip: 'Set up your service rates first — they auto-fill pricing when creating bookings.' },

  // Clients (tab 1)
  { tab: 1, section: 'Clients', icon: '👥', title: 'Client Management', description: 'All your clients in one place. Search, filter, and manage client profiles with full screening history.', },
  { tab: 1, section: 'Clients', icon: '📌', title: 'Pinned Clients & Tags', description: 'Pin your regulars to keep them at the top. Add tags to categorize clients however you like.', },
  { tab: 1, section: 'Clients', icon: '🔍', title: 'Screening & Risk', description: 'Track screening status (Pending → Verified) and risk levels. Risk auto-adjusts when clients no-show.', tip: '2+ no-shows automatically sets a client to High Risk.' },
  { tab: 1, section: 'Clients', icon: '📞', title: 'Quick Contact', description: 'On any client profile, tap Call, Text, Email, or Copy to reach out instantly.', },
  { tab: 1, section: 'Clients', icon: '💜', title: 'Preferences & Boundaries', description: 'Record each client\'s preferences and hard boundaries. These show as a preview on booking details so you never forget.', },

  // Schedule (tab 2)
  { tab: 2, section: 'Schedule', icon: '📅', title: 'Your Schedule', description: 'Calendar and list views for all your bookings. Dots on calendar days show how many bookings you have.', },
  { tab: 2, section: 'Schedule', icon: '🟢', title: 'Availability Colors', description: 'Set your availability for any day — Available (green), Limited (orange), Busy (red), or Off (gray). Colored dots appear on the calendar.', tip: 'Tap the availability button below any selected date to set your status.' },
  { tab: 2, section: 'Schedule', icon: '📊', title: 'Calendar & List Views', description: 'Toggle between calendar view (tap a day to see bookings) and list view (all bookings chronologically).', },
  { tab: 2, section: 'Schedule', icon: '🔄', title: 'Booking Status Flow', description: 'Bookings progress: Inquiry → Screening → Pending Deposit → Confirmed → In Progress → Completed. Advance with one tap.', },

  // Bookings (tab 2)
  { tab: 2, section: 'Bookings', icon: '➕', title: 'Creating Bookings', description: 'Tap + to create a booking. Select a client, pick a service rate (auto-fills duration and price), and set the date.', tip: 'Deposit auto-calculates from your default percentage in Settings.' },
  { tab: 2, section: 'Bookings', icon: '💰', title: 'Pricing & Payments', description: 'Each booking tracks base rate, extras, travel fee, deposit, and full payment. Tap to toggle deposit/payment received.', },
  { tab: 2, section: 'Bookings', icon: '🔁', title: 'Book Again', description: 'On any completed or cancelled booking, tap "Book Again" to create a new booking with the same client, rate, and location pre-filled.', },
  { tab: 2, section: 'Bookings', icon: '👻', title: 'No-Show Tracking', description: 'Mark a booking as No-Show and the client\'s risk level automatically adjusts. Their no-show count shows on their profile.', },

  // Finances (tab 3)
  { tab: 3, section: 'Finances', icon: '📊', title: 'Financial Overview', description: 'See your weekly and monthly income, expenses, and net profit at a glance.', },
  { tab: 3, section: 'Finances', icon: '💵', title: 'Income Tracking', description: 'Log income from bookings, tips, and gifts. Track which payment method was used for each.', },
  { tab: 3, section: 'Finances', icon: '🧾', title: 'Expense Tracking', description: 'Track business expenses by category — supplies, travel, advertising, clothing, health, rent, and more.', },

  // Safety (tab 4)
  { tab: 4, section: 'Safety', icon: '🛡️', title: 'Safety System', description: 'Your safety toolkit — check-ins, trusted contacts, and incident logging all in one place.', },
  { tab: 4, section: 'Safety', icon: '👤', title: 'Safety Contacts', description: 'Add trusted people who should be alerted if you don\'t check in. Mark one as your primary contact.', tip: 'Set up at least one safety contact before your first booking.' },
  { tab: 4, section: 'Safety', icon: '✅', title: 'Check-In System', description: 'When a booking has safety check-in enabled, you\'ll get reminders to confirm you\'re okay.', },
  { tab: 4, section: 'Safety', icon: '📝', title: 'Incident Logging', description: 'Record any incidents with severity level, description, and action taken. Link them to specific clients for reference.', },

  // More Features
  { tab: 0, section: 'More', icon: '🔒', title: 'PIN Lock', description: 'Enable a 4-digit PIN in Settings to protect your app. Required every time you open it.', },
  { tab: 0, section: 'More', icon: '🌙', title: 'Dark Mode & OLED', description: 'True black dark mode optimized for OLED screens. Easy on the eyes and saves battery.', },
  { tab: 0, section: 'More', icon: '📱', title: 'Install as App', description: 'Add this to your home screen for a native app experience — no app store needed, completely private.', tip: 'On iPhone: Share → Add to Home Screen. On Android: Menu → Install App.' },
  { tab: 0, section: 'More', icon: '🔐', title: 'Your Data is Yours', description: 'Everything is stored locally on your device. No accounts, no cloud, no tracking. Delete the app and all data is gone.', },
  { tab: 0, section: 'More', icon: '🎉', title: 'You\'re All Set!', description: 'Start by adding your service rates in Settings, then create your first client and booking. Stay safe out there! 💜', },
]

const sectionColors: Record<string, string> = {
  'Welcome': '#a855f7',
  'Home': '#3b82f6',
  'Clients': '#8b5cf6',
  'Schedule': '#14b8a6',
  'Bookings': '#22c55e',
  'Finances': '#f59e0b',
  'Safety': '#ef4444',
  'More': '#f97316',
}

interface AppTourProps {
  isActive: boolean
  onFinish: () => void
  onTabChange: (tab: number) => void
}

export function AppTour({ isActive, onFinish, onTabChange }: AppTourProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [showSections, setShowSections] = useState(false)

  if (!isActive) return null

  const step = tourSteps[stepIndex]
  const color = sectionColors[step.section] ?? '#a855f7'
  const progress = (stepIndex + 1) / tourSteps.length
  const isFirst = stepIndex === 0
  const isLast = stepIndex === tourSteps.length - 1

  // Get unique sections
  const sections = [...new Set(tourSteps.map(s => s.section))]

  function next() {
    if (isLast) {
      onFinish()
    } else {
      const nextStep = tourSteps[stepIndex + 1]
      if (nextStep.tab !== step.tab) onTabChange(nextStep.tab)
      setStepIndex(stepIndex + 1)
    }
  }

  function prev() {
    if (!isFirst) {
      const prevStep = tourSteps[stepIndex - 1]
      if (prevStep.tab !== step.tab) onTabChange(prevStep.tab)
      setStepIndex(stepIndex - 1)
    }
  }

  function jumpToSection(section: string) {
    const idx = tourSteps.findIndex(s => s.section === section)
    if (idx >= 0) {
      onTabChange(tourSteps[idx].tab)
      setStepIndex(idx)
      setShowSections(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[90] bg-black/65 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowSections(true)}
              className="text-xs font-medium px-3 py-1.5 rounded-full"
              style={{ backgroundColor: `${color}25`, color }}
            >
              {step.section} ▾
            </button>
            <button
              onClick={onFinish}
              className="text-xs px-3 py-1.5 rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
            >
              Skip Tour
            </button>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: `${color}20` }}
            >
              <span className="text-3xl">{step.icon}</span>
            </div>

            {/* Content */}
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
              {step.description}
            </p>

            {/* Tip */}
            {step.tip && (
              <div
                className="rounded-lg p-3 text-left"
                style={{ backgroundColor: `${color}10` }}
              >
                <p className="text-xs font-medium" style={{ color }}>
                  💡 Pro Tip: {step.tip}
                </p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={prev}
              disabled={isFirst}
              className={`flex items-center gap-1 text-sm font-medium px-4 py-2 rounded-lg ${isFirst ? 'opacity-30' : ''}`}
              style={{ color: 'rgba(255,255,255,0.8)' }}
            >
              <ChevronLeft size={16} /> Back
            </button>

            {/* Progress */}
            <div className="flex flex-col items-center gap-1">
              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress * 100}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {stepIndex + 1} of {tourSteps.length}
              </span>
            </div>

            <button
              onClick={next}
              className="flex items-center gap-1 text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ backgroundColor: color, color: '#fff' }}
            >
              {isLast ? 'Done' : 'Next'} {!isLast && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Section Picker */}
      {showSections && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSections(false)} />
          <div
            className="relative w-full max-w-lg rounded-t-2xl p-4 pb-8"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: 'var(--border)' }} />
            <h3 className="font-semibold text-sm mb-3 text-center" style={{ color: 'var(--text-primary)' }}>
              Jump to Section
            </h3>
            <div className="space-y-1">
              {sections.map(section => {
                const sectionSteps = tourSteps.filter(s => s.section === section)
                const isCurrent = step.section === section
                const sc = sectionColors[section] ?? '#a855f7'
                return (
                  <button
                    key={section}
                    onClick={() => jumpToSection(section)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left`}
                    style={{
                      backgroundColor: isCurrent ? `${sc}15` : 'var(--bg-secondary)',
                      outline: isCurrent ? `2px solid ${sc}` : 'none',
                    }}
                  >
                    <span className="text-lg">{sectionSteps[0].icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{section}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{sectionSteps.length} steps</p>
                    </div>
                    {isCurrent && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${sc}25`, color: sc }}>
                        Current
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
