import type { ReactNode } from 'react'
import { Lock, Sparkles } from 'lucide-react'
import { isPro } from './planLimits'

interface ProGateProps {
  children?: ReactNode
  /** Feature name shown in the CTA, e.g. "Session Journal" */
  feature?: string
  /** Optional callback to open the upgrade screen */
  onUpgrade?: () => void
  /** If true, render an inline card instead of an overlay over children */
  inline?: boolean
}

/**
 * Wraps content that requires a Pro subscription.
 * Free users see a blurred preview with an upgrade CTA overlay.
 * Pro users see the content normally.
 */
export function ProGate({ children, feature, onUpgrade, inline }: ProGateProps) {
  if (isPro()) return <>{children}</>

  if (inline) {
    return (
      <button
        onClick={onUpgrade}
        className="w-full rounded-xl p-4 text-center active:opacity-80"
        style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(236,72,153,0.08))',
          border: '1px solid rgba(168,85,247,0.2)',
        }}
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          <Lock size={14} className="text-purple-500" />
          <span className="text-sm font-semibold text-purple-500">Pro Feature</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {feature ? `Upgrade to unlock ${feature}` : 'Upgrade to Pro to unlock'}
        </p>
      </button>
    )
  }

  return (
    <div className="relative">
      {/* Blurred content preview */}
      <div
        className="pointer-events-none select-none"
        style={{ filter: 'blur(6px)', opacity: 0.5 }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Upgrade overlay */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <button
          onClick={onUpgrade}
          className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl active:scale-[0.97] transition-transform"
          style={{
            background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(236,72,153,0.12))',
            border: '1px solid rgba(168,85,247,0.25)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
          >
            <Sparkles size={20} className="text-white" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {feature ? `Unlock ${feature}` : 'Upgrade to Pro'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Tap to see plans
            </p>
          </div>
        </button>
      </div>
    </div>
  )
}

/**
 * Small "PRO" badge to show next to feature labels
 */
export function ProBadge() {
  if (isPro()) return null
  return (
    <span
      className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ml-1.5"
      style={{
        background: 'linear-gradient(135deg, #a855f7, #ec4899)',
        color: '#fff',
        letterSpacing: '0.05em',
      }}
    >
      Pro
    </span>
  )
}
