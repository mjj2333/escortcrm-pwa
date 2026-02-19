import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

interface WelcomeSplashProps {
  onComplete: () => void
  onStartSetup: () => void
}

const pages = [
  {
    icon: '💜',
    title: 'Welcome to Companion',
    subtitle: 'Your private booking & client manager',
    features: [
      { icon: '🔒', text: 'Completely offline — your data never leaves your device' },
      { icon: '📱', text: 'Install as an app from your browser for the best experience' },
      { icon: '🌙', text: 'Built for discretion with OLED dark mode' },
    ],
  },
  {
    icon: '👥',
    title: 'Client Management',
    subtitle: 'Everything about your clients in one place',
    features: [
      { icon: '📋', text: 'Track screening status, risk level, and verification' },
      { icon: '📌', text: 'Pin regulars, add tags, record preferences & boundaries' },
      { icon: '📞', text: 'Quick contact — call, text, or email with one tap' },
    ],
  },
  {
    icon: '📅',
    title: 'Scheduling & Bookings',
    subtitle: 'Calendar views, availability, and booking management',
    features: [
      { icon: '🟢', text: 'Set daily availability with granular working hours' },
      { icon: '💰', text: 'Track rates, deposits, extras, tips, and payments' },
      { icon: '⚠️', text: 'Double-booking detection and availability conflict warnings' },
    ],
  },
  {
    icon: '🛡️',
    title: 'Safety & Finances',
    subtitle: 'Stay safe and keep your finances organized',
    features: [
      { icon: '✅', text: 'Safety check-ins with trusted contacts' },
      { icon: '📊', text: 'Income & expense tracking with tax estimates' },
      { icon: '🎯', text: 'Set income goals and track your progress' },
    ],
  },
]

export function WelcomeSplash({ onComplete, onStartSetup }: WelcomeSplashProps) {
  const [page, setPage] = useState(0)
  const isLast = page === pages.length - 1
  const current = pages[page]

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: 'var(--bg-primary)', zIndex: 100 }}
    >
      <div className="w-full max-w-sm flex flex-col items-center flex-1 justify-center">
        {/* Icon */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
          style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
        >
          <span className="text-4xl">{current.icon}</span>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--text-primary)' }}>
          {current.title}
        </h1>
        <p className="text-sm text-center mb-8" style={{ color: 'var(--text-secondary)' }}>
          {current.subtitle}
        </p>

        {/* Feature list */}
        <div className="w-full space-y-3 mb-8">
          {current.features.map((f, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <span className="text-lg shrink-0">{f.icon}</span>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{f.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom section */}
      <div className="w-full max-w-sm pb-4">
        {/* Dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className="rounded-full transition-all"
              style={{
                width: i === page ? '24px' : '8px',
                height: '8px',
                backgroundColor: i === page ? '#a855f7' : 'var(--border)',
              }}
            />
          ))}
        </div>

        {isLast ? (
          <div className="space-y-2">
            <button
              onClick={onStartSetup}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80 flex items-center justify-center gap-2"
              style={{ backgroundColor: '#a855f7' }}
            >
              Set Up My Account <ChevronRight size={16} />
            </button>
            <button
              onClick={onComplete}
              className="w-full py-3 text-sm font-medium active:opacity-70"
              style={{ color: 'var(--text-secondary)' }}
            >
              Skip — I'll explore on my own
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={onComplete}
              className="flex-1 py-3 rounded-xl text-sm font-medium active:opacity-70"
              style={{ color: 'var(--text-secondary)' }}
            >
              Skip
            </button>
            <button
              onClick={() => setPage(page + 1)}
              className="flex-[2] py-3 rounded-xl font-bold text-sm text-white active:opacity-80 flex items-center justify-center gap-1"
              style={{ backgroundColor: '#a855f7' }}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
