import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TourStep {
  /** data-tour attribute value on the target element */
  target: string
  /** Tab index to switch to (0=Home, 1=Schedule, 2=Clients, 3=Finances, 4=Safety) */
  tab: number
  /** Chapter heading (displayed above step title) */
  chapter: string
  /** Bold title for this step */
  title: string
  /** Description text */
  description: string
  /** Preferred tooltip position relative to spotlight */
  position: 'top' | 'bottom'
  /** Optional setup function (e.g. switch a sub-tab) called before spotlighting */
  setup?: () => void
}

interface GuidedTourProps {
  steps: TourStep[]
  onComplete: () => void
  onTabChange: (tab: number) => void
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOUR STEPS DATA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const TOUR_STEPS: TourStep[] = [
  // ── Home ──
  {
    target: 'tour-profile-btn',
    tab: 0,
    chapter: 'Home',
    title: 'Your Profile',
    description: 'Set up your working name, service rates, default deposit, and message templates for clients.',
    position: 'bottom',
  },
  {
    target: 'tour-incallbook-btn',
    tab: 0,
    chapter: 'Home',
    title: 'Incall Book',
    description: 'Manage your incall venues with addresses, access codes, and directions you can send to clients.',
    position: 'bottom',
  },
  {
    target: 'tour-settings-btn',
    tab: 0,
    chapter: 'Home',
    title: 'Settings',
    description: 'PIN lock, biometric unlock, encryption, data backups, and display preferences.',
    position: 'bottom',
  },

  // ── Schedule ──
  {
    target: 'tour-schedule-add',
    tab: 1,
    chapter: 'Schedule',
    title: 'Create Bookings',
    description: 'Add bookings with your service rate, location, deposit, and payment tracking. Rates appear as quick-select buttons.',
    position: 'bottom',
  },
  {
    target: 'tour-schedule-view',
    tab: 1,
    chapter: 'Schedule',
    title: 'Calendar & List Views',
    description: 'Switch between calendar and list views. Tap any date to see bookings and set your availability.',
    position: 'bottom',
  },
  {
    target: 'tour-schedule-content',
    tab: 1,
    chapter: 'Schedule',
    title: 'Swipe Actions',
    description: 'Swipe any booking left for quick actions — complete, cancel, or no-show. Completing auto-prompts for session notes.',
    position: 'top',
  },

  // ── Clients ──
  {
    target: 'tour-clients-add',
    tab: 2,
    chapter: 'Clients',
    title: 'Add Clients',
    description: 'Add clients with screening status, risk level, contact info, preferences, boundaries, and tags.',
    position: 'bottom',
  },
  {
    target: 'tour-clients-sort',
    tab: 2,
    chapter: 'Clients',
    title: 'Sort & Filter',
    description: 'Sort by name, recently seen, or newest. Toggle to view your blacklist. Search to find anyone instantly.',
    position: 'bottom',
  },
  {
    target: 'tour-clients-content',
    tab: 2,
    chapter: 'Clients',
    title: 'Client Cards',
    description: 'Tap to view full details, history, and session journal. Long-press to pin favorites to the top.',
    position: 'top',
  },

  // ── Finances ──
  {
    target: 'tour-finances-add',
    tab: 3,
    chapter: 'Finances',
    title: 'Log Transactions',
    description: 'Record income and expenses. Booking payments are tracked automatically when you record deposits and complete sessions.',
    position: 'bottom',
  },
  {
    target: 'tour-finances-customize',
    tab: 3,
    chapter: 'Finances',
    title: 'Customize Dashboard',
    description: 'Choose which analytics cards to display — income trends, timing heatmaps, client stats, and more.',
    position: 'bottom',
  },

  // ── Safety ──
  {
    target: 'tour-safety-header',
    tab: 4,
    chapter: 'Safety',
    title: 'Safety Tools',
    description: 'Add trusted contacts who get automated alerts during your bookings. The + button adds contacts and logs incidents.',
    position: 'bottom',
  },
  {
    target: 'tour-safety-tabs',
    tab: 4,
    chapter: 'Safety',
    title: 'Check-ins & Blacklist',
    description: 'Track check-ins during sessions, manage contacts, log incidents, and maintain your blacklist — all in one place.',
    position: 'top',
  },
]

// Chapter colors
const CHAPTER_COLORS: Record<string, string> = {
  Home: '#a855f7',
  Schedule: '#3b82f6',
  Clients: '#8b5cf6',
  Finances: '#22c55e',
  Safety: '#f59e0b',
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function GuidedTour({ steps, onComplete, onTabChange }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [visible, setVisible] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resizeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const step = steps[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1
  const chapterColor = CHAPTER_COLORS[step.chapter] ?? '#a855f7'

  // ── Find and measure the target element ──
  const spotlightTarget = useCallback(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null
    if (el) {
      const r = el.getBoundingClientRect()
      // Add padding around the element
      const pad = 6
      // Cap height so the tooltip always has room to render
      const maxH = window.innerHeight * 0.35
      const clippedH = Math.min(r.height, maxH)
      setRect(new DOMRect(r.x - pad, r.y - pad, r.width + pad * 2, clippedH + pad * 2))
      // Scroll element into view if needed
      const inView = r.top >= 0 && r.bottom <= window.innerHeight - 80
      if (!inView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Re-measure after scroll
        setTimeout(() => {
          const r2 = el.getBoundingClientRect()
          const clippedH2 = Math.min(r2.height, maxH)
          setRect(new DOMRect(r2.x - pad, r2.y - pad, r2.width + pad * 2, clippedH2 + pad * 2))
        }, 400)
      }
      return true
    }
    return false
  }, [step.target])

  // ── Navigate to step ──
  const navigateRef = useRef<(idx: number) => void>(() => {})
  const navigateToStep = useCallback((idx: number) => {
    const target = steps[idx]
    setTransitioning(true)
    setVisible(false)
    setRect(null)

    // Switch tab if needed
    onTabChange(target.tab)

    // Run optional setup
    if (target.setup) {
      setTimeout(target.setup, 50)
    }

    // Poll for the target element (may take a tick to render after tab switch)
    if (pollRef.current) clearInterval(pollRef.current)
    let attempts = 0
    pollRef.current = setInterval(() => {
      attempts++
      const el = document.querySelector(`[data-tour="${target.target}"]`) as HTMLElement | null
      if (el) {
        if (pollRef.current) clearInterval(pollRef.current)
        setCurrentStep(idx)
        setTimeout(() => {
          setTransitioning(false)
          setVisible(true)
        }, 100)
      } else if (attempts > 30) {
        // Give up after 3 seconds — skip to next or complete
        if (pollRef.current) clearInterval(pollRef.current)
        setTransitioning(false)
        if (idx < steps.length - 1) {
          navigateRef.current(idx + 1)
        } else {
          onComplete()
        }
      }
    }, 100)
  }, [steps, onTabChange, onComplete])
  navigateRef.current = navigateToStep

  // ── Measure on step change ──
  useEffect(() => {
    if (!transitioning) {
      spotlightTarget()
    }
  }, [currentStep, transitioning, spotlightTarget])

  // ── Recalculate on resize/scroll ──
  useEffect(() => {
    function handleResize() {
      if (resizeRef.current) clearTimeout(resizeRef.current)
      resizeRef.current = setTimeout(spotlightTarget, 100)
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
      if (pollRef.current) clearInterval(pollRef.current)
      if (resizeRef.current) clearTimeout(resizeRef.current)
    }
  }, [spotlightTarget])

  // ── Initial mount ──
  useEffect(() => {
    navigateToStep(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goNext() {
    if (isLast) {
      onComplete()
    } else {
      navigateToStep(currentStep + 1)
    }
  }

  function goBack() {
    if (!isFirst) {
      navigateToStep(currentStep - 1)
    }
  }

  // ── Compute tooltip position ──
  const tooltipStyle = (): React.CSSProperties => {
    if (!rect) return { opacity: 0 }

    const margin = 12
    const tooltipHeight = 180 // estimated
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top

    // Decide position based on preference and available space
    let placeBelow = step.position === 'bottom'
    if (placeBelow && spaceBelow < tooltipHeight + margin) placeBelow = false
    if (!placeBelow && spaceAbove < tooltipHeight + margin) placeBelow = true

    // Horizontal centering (clamped to screen edges)
    const centerX = rect.left + rect.width / 2
    const tooltipWidth = Math.min(320, window.innerWidth - 32)
    let left = centerX - tooltipWidth / 2
    if (left < 16) left = 16
    if (left + tooltipWidth > window.innerWidth - 16) left = window.innerWidth - 16 - tooltipWidth

    return {
      position: 'fixed',
      left,
      width: tooltipWidth,
      ...(placeBelow
        ? { top: rect.bottom + margin }
        : { bottom: window.innerHeight - rect.top + margin }),
      opacity: visible && !transitioning ? 1 : 0,
      transition: 'opacity 0.25s ease, top 0.3s ease, bottom 0.3s ease, left 0.3s ease',
      zIndex: 10002,
    }
  }

  // ── Progress markers ──
  const chapters = [...new Set(steps.map(s => s.chapter))]
  const chapterSteps = chapters.map(ch => ({
    chapter: ch,
    steps: steps.map((s, i) => ({ ...s, index: i })).filter(s => s.chapter === ch),
  }))

  return (
    <div className="fixed inset-0" style={{ zIndex: 10000 }}>
      {/* Overlay + Spotlight cutout */}
      {rect && (
        <div
          className="fixed rounded-xl"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.8)',
            zIndex: 10001,
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Click-through overlay for areas outside spotlight */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 10000, pointerEvents: rect ? 'auto' : 'none' }}
        onClick={goNext}
      />

      {/* Tooltip */}
      <div style={tooltipStyle()}>
        <div
          className="rounded-2xl p-4 shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: `0 0 0 1px var(--border), 0 20px 60px rgba(0,0,0,0.5), 0 0 30px ${chapterColor}20`,
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div className="flex gap-0.5 mb-3">
            {chapterSteps.map(ch => (
              <div key={ch.chapter} className="flex gap-0.5 flex-1">
                {ch.steps.map(s => (
                  <div
                    key={s.index}
                    className="flex-1 h-1 rounded-full transition-colors"
                    style={{
                      backgroundColor: s.index <= currentStep
                        ? CHAPTER_COLORS[ch.chapter] ?? '#a855f7'
                        : 'var(--border)',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Chapter + Title */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color: chapterColor,
                backgroundColor: `${chapterColor}15`,
              }}
            >
              {step.chapter}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              {currentStep + 1} of {steps.length}
            </span>
          </div>

          <h3
            className="text-base font-bold mb-1.5"
            style={{ color: 'var(--text-primary)' }}
          >
            {step.title}
          </h3>

          <p
            className="text-sm leading-relaxed mb-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            {step.description}
          </p>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={goBack}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium active:opacity-70"
                style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}

            <div className="flex-1" />

            <button
              onClick={onComplete}
              className="px-3 py-2 rounded-lg text-xs font-medium active:opacity-70"
              style={{ color: 'var(--text-secondary)' }}
            >
              Skip tour
            </button>

            <button
              onClick={goNext}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold text-white active:opacity-80"
              style={{ backgroundColor: chapterColor }}
            >
              {isLast ? 'Done' : 'Next'} {!isLast && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
