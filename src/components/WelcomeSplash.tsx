import { useState } from 'react'
import {
  Users, Calendar, DollarSign, Shield, Lock, MapPin,
  Bell, BookOpen
} from 'lucide-react'

interface WelcomeSplashProps {
  onComplete: (dontShowAgain: boolean) => void
  onStartSetup: (dontShowAgain: boolean) => void
}

const features = [
  {
    icon: Users,
    color: '#a855f7',
    bg: 'rgba(168,85,247,0.12)',
    title: 'Clients',
    desc: 'Screening, risk levels, tags, preferences & contact management',
  },
  {
    icon: Calendar,
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
    title: 'Bookings',
    desc: 'Scheduling, deposits, extras, payments & double-booking detection',
  },
  {
    icon: DollarSign,
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    title: 'Finances',
    desc: 'Income & expense tracking, analytics, goals & tax estimates',
  },
  {
    icon: Shield,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    title: 'Safety',
    desc: 'Check-ins with trusted contacts, incident log & blacklist',
  },
  {
    icon: MapPin,
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.12)',
    title: 'Incall Book',
    desc: 'Venue management with directions you can send to clients',
  },
  {
    icon: BookOpen,
    color: '#06b6d4',
    bg: 'rgba(6,182,212,0.12)',
    title: 'Session Journal',
    desc: 'Private post-session notes, tags & timing records',
  },
]

export function WelcomeSplash({ onComplete, onStartSetup }: WelcomeSplashProps) {
  const [dontShow, setDontShow] = useState(false)

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ backgroundColor: 'var(--bg-primary)', zIndex: 100 }}
    >
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-md mx-auto px-5 py-8">

          {/* Logo + branding */}
          <div className="flex flex-col items-center mb-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                boxShadow: '0 8px 32px rgba(168,85,247,0.3)',
              }}
            >
              <span className="text-3xl">💜</span>
            </div>
            <h1
              className="text-2xl font-bold tracking-tight text-center"
              style={{ color: 'var(--text-primary)' }}
            >
              Companion
            </h1>
            <p className="text-sm text-center mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              Private booking & client management
            </p>
          </div>

          {/* Privacy banner */}
          <div
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl mb-5"
            style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}
          >
            <Lock size={15} className="text-green-500 shrink-0" />
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-semibold text-green-500">100% offline & encrypted.</span>{' '}
              Your data never leaves your device.
            </p>
          </div>

          {/* Feature grid */}
          <div className="space-y-2">
            {features.map(f => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  className="flex items-start gap-3 px-3.5 py-3 rounded-xl"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: f.bg }}
                  >
                    <Icon size={17} style={{ color: f.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: f.color }}>
                      {f.title}
                    </p>
                    <p className="text-xs leading-relaxed mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {f.desc}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Install hint */}
          <div className="flex items-center gap-2 mt-5 px-1">
            <Bell size={13} style={{ color: 'var(--text-secondary)' }} />
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Tip: Install as an app from your browser menu for the best experience
            </p>
          </div>
        </div>
      </div>

      {/* Bottom section — fixed */}
      <div
        className="shrink-0 px-5 pt-3 pb-6 safe-bottom"
        style={{ backgroundColor: 'var(--bg-primary)', borderTop: '1px solid var(--border)' }}
      >
        <div className="w-full max-w-md mx-auto">

          {/* Don't show again */}
          <button
            type="button"
            className="flex items-center gap-2.5 mb-4 select-none"
            onClick={() => setDontShow(!dontShow)}
          >
            <div
              className="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors"
              style={{
                backgroundColor: dontShow ? '#a855f7' : 'transparent',
                border: dontShow ? '2px solid #a855f7' : '2px solid var(--border)',
              }}
            >
              {dontShow && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Don't show this again
            </span>
          </button>

          {/* Buttons */}
          <button
            onClick={() => onStartSetup(dontShow)}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80 mb-2"
            style={{
              background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
              boxShadow: '0 4px 16px rgba(168,85,247,0.3)',
            }}
          >
            Get Started
          </button>
          <button
            onClick={() => onComplete(dontShow)}
            className="w-full py-2.5 text-xs font-medium active:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
          >
            Skip — I'll explore on my own
          </button>
        </div>
      </div>
    </div>
  )
}
