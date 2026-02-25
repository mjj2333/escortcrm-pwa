import { useState, useEffect } from 'react'
import { Shield, Check, Sparkles, Mail, X, Loader, ChevronLeft } from 'lucide-react'
import {
  STRIPE_MONTHLY_LINK,
  STRIPE_LIFETIME_LINK,
  REVALIDATION_KEY,
  setActivation,
  isActivated,
  verifyPurchase,
  matchGiftCode,
} from './paywallState'

// Re-export everything from paywallState so existing imports from './Paywall' still work
export {
  getActivation,
  setActivation,
  isActivated,
  needsPaywall,
  isBetaTester,
  initTrialState,
  getTrialDaysRemaining,
  isTrialActive,
  revalidateActivation,
} from './paywallState'
export type { ActivationState } from './paywallState'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURES LIST
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const features = [
  'Unlimited clients & bookings',
  'Financial tracking & analytics',
  'Session journal & notes',
  'Screening document uploads',
  'Export & encrypted backups',
  'All future Pro features',
]

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PaywallProps {
  onActivated: () => void
  onClose?: () => void
  initialCode?: string
}

export function Paywall({ onActivated, onClose, initialCode }: PaywallProps) {
  const [showVerify, setShowVerify] = useState(!!initialCode)
  const [verifyInput, setVerifyInput] = useState(initialCode || '')
  const [isGiftMode, setIsGiftMode] = useState(!!initialCode)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')
  const [tappedCheckout, setTappedCheckout] = useState(false)

  // Check URL params for successful checkout redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      setShowVerify(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // When user taps a payment link, it opens in Safari (separate from PWA).
  // When they return to the app, auto-show the email verify section.
  useEffect(() => {
    if (!tappedCheckout) return
    function handleReturn() {
      if (document.visibilityState === 'visible') {
        setShowVerify(true)
        setIsGiftMode(false)
        setTappedCheckout(false)
      }
    }
    document.addEventListener('visibilitychange', handleReturn)
    return () => document.removeEventListener('visibilitychange', handleReturn)
  }, [tappedCheckout])

  async function handleVerify() {
    const input = verifyInput.trim()
    if (!input) return

    setValidating(true)
    setError('')

    // Gift code path
    if (isGiftMode) {
      const giftCode = await matchGiftCode(input)
      if (giftCode === 'network_error') {
        setError('Network error — check your connection and try again')
        setValidating(false)
        return
      }
      if (giftCode) {
        setActivation({
          activated: true,
          plan: 'lifetime',
          isBetaTester: true,
          betaExpiresAt: giftCode.expiresAt,
          activatedAt: new Date().toISOString(),
          token: giftCode.token,
          identifier: giftCode.identifier ?? `gift:${input.trim().toUpperCase()}`,
        })
        localStorage.setItem(REVALIDATION_KEY, String(Date.now()))
        setValidating(false)
        onActivated()
        return
      }
      setError('Invalid promo code')
      setValidating(false)
      return
    }

    // Email verification via Stripe
    const result = await verifyPurchase(input)
    if (result.valid) {
      setActivation({
        activated: true,
        email: input.toLowerCase(),
        plan: result.plan,
        activatedAt: new Date().toISOString(),
        token: result.token,
        identifier: input.trim().toLowerCase(),
      })
      localStorage.setItem(REVALIDATION_KEY, String(Date.now()))
      onActivated()
    } else {
      setError(result.error ?? 'No purchase found for this email')
    }
    setValidating(false)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-8">
          {/* Close button — only shown when opened voluntarily */}
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-1 text-sm mb-4 -ml-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ChevronLeft size={18} />
              Back
            </button>
          )}
          {/* Header */}
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(236,72,153,0.2))',
              }}
            >
              <Shield size={28} className="text-purple-500" />
            </div>
            <h1
              className="text-2xl font-bold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              Upgrade to Pro
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Unlock unlimited clients, bookings & more
            </p>
          </div>

          {/* Features */}
          <div className="mb-8">
            <div className="space-y-2.5">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
                  >
                    <Check size={11} style={{ color: '#a855f7' }} strokeWidth={3} />
                  </div>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {f}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing — Stripe Payment Links */}
          <div className="space-y-3 mb-6">
            {/* Monthly */}
            <a
              href={STRIPE_MONTHLY_LINK}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setTappedCheckout(true)}
              className="w-full p-4 rounded-xl border-2 text-left transition-all active:scale-[0.98] block"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Monthly
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Cancel anytime
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    $4.99
                    <span className="text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>
                      /mo
                    </span>
                  </p>
                </div>
              </div>
            </a>

            {/* Lifetime */}
            <a
              href={STRIPE_LIFETIME_LINK}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setTappedCheckout(true)}
              className="w-full p-4 rounded-xl border-2 text-left transition-all active:scale-[0.98] relative overflow-hidden block"
              style={{ borderColor: '#a855f7', backgroundColor: 'var(--bg-card)' }}
            >
              <div
                className="absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold text-white rounded-bl-lg"
                style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
              >
                <Sparkles size={10} className="inline mr-0.5 -mt-0.5" /> BEST VALUE
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    Lifetime
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    One-time payment, forever access
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-purple-500">$49.99</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    pay once
                  </p>
                </div>
              </div>
            </a>
          </div>

          {/* Verify / Restore purchase */}
          {!showVerify ? (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  setShowVerify(true)
                  setIsGiftMode(false)
                  setError('')
                }}
                className="text-center text-sm py-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Mail size={14} className="inline mr-1 -mt-0.5" />
                Already purchased?
              </button>
              <span style={{ color: 'var(--text-secondary)' }}>·</span>
              <button
                onClick={() => {
                  setShowVerify(true)
                  setIsGiftMode(true)
                  setError('')
                }}
                className="text-center text-sm py-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Promo code?
              </button>
            </div>
          ) : (
            <div
              className="rounded-xl p-3 space-y-3"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-semibold uppercase"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {isGiftMode ? 'Promo Code' : 'Verify Purchase'}
                </span>
                <button
                  onClick={() => {
                    setShowVerify(false)
                    setError('')
                    setVerifyInput('')
                  }}
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <X size={16} />
                </button>
              </div>

              {!isGiftMode && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Enter the email you used at checkout to activate your license.
                </p>
              )}

              <input
                type={isGiftMode ? 'text' : 'email'}
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                placeholder={isGiftMode ? 'Enter promo code...' : 'you@email.com'}
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full text-sm p-2.5 rounded-lg bg-transparent outline-none"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  fontFamily: isGiftMode ? 'monospace' : 'inherit',
                }}
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleVerify}
                disabled={validating || !verifyInput.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-purple-600 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {validating ? (
                  <>
                    <Loader size={14} className="animate-spin" /> Verifying...
                  </>
                ) : isGiftMode ? (
                  'Activate'
                ) : (
                  'Verify Purchase'
                )}
              </button>

              <button
                onClick={() => {
                  setIsGiftMode(!isGiftMode)
                  setError('')
                  setVerifyInput('')
                }}
                className="w-full text-center text-xs py-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                {isGiftMode ? 'Verify with email instead' : 'Have a promo code?'}
              </button>
            </div>
          )}

          {/* Dismiss — always available since app is never fully locked */}
          {onClose && (
            <button
              onClick={onClose}
              className="w-full text-center text-sm py-4 mt-2 font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Maybe later
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FREE TIER BANNER (shown inside the app for free users)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** @deprecated Renamed to FreeBanner. Kept for backward compatibility. */
export function TrialBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return <FreeBanner onUpgrade={onUpgrade} />
}

export function FreeBanner({ onUpgrade }: { onUpgrade: () => void }) {
  if (isActivated()) return null

  return (
    <button
      onClick={onUpgrade}
      className="w-full px-4 text-center text-xs font-semibold flex items-center justify-center gap-1.5"
      style={{
        background: 'linear-gradient(90deg, #a855f7, #ec4899)',
        color: '#fff',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        paddingBottom: '8px',
      }}
    >
      <Sparkles size={12} />
      Free plan — Upgrade to Pro for unlimited access
    </button>
  )
}
