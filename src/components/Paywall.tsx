import { useState, useEffect } from 'react'
import { Shield, Check, Sparkles, Mail, X, Loader, ChevronLeft } from 'lucide-react'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG — Update these after creating products in Stripe Dashboard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Stripe Payment Link URLs — create in Stripe Dashboard → Payment Links
const STRIPE_MONTHLY_LINK = 'https://buy.stripe.com/eVq9AV8Xf523cU55DD0kE01'
const STRIPE_LIFETIME_LINK = 'https://buy.stripe.com/5kQ7sNddveCD2fr2rr0kE00'

// Netlify function endpoint for purchase verification
const VERIFY_ENDPOINT = '/.netlify/functions/verify-purchase'

const TRIAL_DAYS = 7

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACTIVATION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ActivationState {
  activated: boolean
  email?: string
  plan?: 'lifetime' | 'monthly'
  activatedAt?: string
  trialStarted?: string
}

export function getActivation(): ActivationState {
  try {
    const raw = localStorage.getItem('companion_activation')
    if (raw) return JSON.parse(raw)
  } catch {}
  return { activated: false }
}

export function setActivation(state: ActivationState) {
  localStorage.setItem('companion_activation', JSON.stringify(state))
}

export function getTrialStart(): Date {
  const activation = getActivation()
  if (activation.trialStarted) return new Date(activation.trialStarted)
  const now = new Date()
  setActivation({ ...activation, trialStarted: now.toISOString() })
  return now
}

export function getTrialDaysRemaining(): number {
  const start = getTrialStart()
  const elapsed = (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.ceil(TRIAL_DAYS - elapsed))
}

export function isTrialActive(): boolean {
  return getTrialDaysRemaining() > 0
}

export function isActivated(): boolean {
  return getActivation().activated
}

export function needsPaywall(): boolean {
  return !isActivated() && !isTrialActive()
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STRIPE VERIFICATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function verifyPurchase(
  email: string
): Promise<{ valid: boolean; plan?: 'lifetime' | 'monthly'; error?: string }> {
  try {
    const res = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    return await res.json()
  } catch {
    return { valid: false, error: 'Network error — check your connection' }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROMO / GIFT CODES (provider-independent)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GIFT_CODE_HASHES: string[] = [
  '22b70cf5f3c48d73f301cb49e00b43604b3bff75be01319ce42a7cb2b1574e8a',
  '7ff50e40fc16aaca1dd462c9310b97db4e3455bef6ca8597f6d79d96b80b6f5d',
  'e17feea8d0336808d0626211d4329641363aea251f6cf272826d99b922f73e4b',
  'fc5f03e446befb2b4dff21986943b8e987056056f806a6af7d9354f83a2a476c',
  'ad93e9abe2968f813af1a63ab8f1f811a6771a8fe54f8cdce7db4706fb6cd8ec',
  '064ed653d8255f22b85ef34d3d4d7ba4e0f9a2fcce6146df670d1eeb0d734e8c',
  '01139000e917e30c9833c6008e37a1c5b237a00fc1d928d7bd617d169795442d',
  '47936b5c1a7baef51aef96db4039a30a32ee5b3b29b3992625bf85e04ca91713',
  '7c2d0b10df6053d2748bfc9a8767a062e2024509a9b6f527665bc2309e818767',
  'cd0690feb7fa9c4ee2a287d22e2c5da02557e35cec6cd947af914c9d4ec174ac',
]

async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code.trim().toUpperCase())
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function isValidGiftCode(code: string): Promise<boolean> {
  const hash = await hashCode(code)
  return GIFT_CODE_HASHES.includes(hash)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FEATURES LIST
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const features = [
  'Unlimited clients & bookings',
  'Financial tracking & analytics',
  'Safety check-in system',
  'Encrypted backups',
  'Recurring bookings',
  'Push notification reminders',
  'Import/export to CSV & Excel',
  'All future updates included',
]

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PaywallProps {
  onActivated: () => void
  onClose?: () => void
}

export function Paywall({ onActivated, onClose }: PaywallProps) {
  const [showVerify, setShowVerify] = useState(false)
  const [verifyInput, setVerifyInput] = useState('')
  const [isGiftMode, setIsGiftMode] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')

  // Check URL params for successful checkout redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      setShowVerify(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function handleVerify() {
    const input = verifyInput.trim()
    if (!input) return

    setValidating(true)
    setError('')

    // Gift code path (works offline)
    if (isGiftMode) {
      const isGift = await isValidGiftCode(input)
      if (isGift) {
        setActivation({
          activated: true,
          plan: 'lifetime',
          activatedAt: new Date().toISOString(),
          trialStarted: getActivation().trialStarted,
        })
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
        trialStarted: getActivation().trialStarted,
      })
      onActivated()
    } else {
      setError(result.error ?? 'No purchase found for this email')
    }
    setValidating(false)
  }

  const daysLeft = getTrialDaysRemaining()

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
              className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
            >
              <Shield size={32} color="#fff" />
            </div>
            <h1
              className="text-2xl font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Companion Pro
            </h1>
            {daysLeft > 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Your free trial has{' '}
                <span className="font-semibold text-purple-500">
                  {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                </span>{' '}
                remaining
              </p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Your free trial has ended. Upgrade to continue.
              </p>
            )}
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
                    $14.99
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
                  <p className="text-lg font-bold text-purple-500">$89.99</p>
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

          {/* Continue trial */}
          {daysLeft > 0 && (
            <button
              onClick={onActivated}
              className="w-full text-center text-sm py-4 mt-2 font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              Continue free trial ({daysLeft} day{daysLeft !== 1 ? 's' : ''} left)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRIAL BANNER (shown inside the app during trial)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function TrialBanner({ onUpgrade }: { onUpgrade: () => void }) {
  const days = getTrialDaysRemaining()
  if (days <= 0 || isActivated()) return null

  return (
    <button
      onClick={onUpgrade}
      className="w-full py-2 px-4 text-center text-xs font-semibold flex items-center justify-center gap-1.5"
      style={{
        background:
          days <= 2
            ? 'linear-gradient(90deg, #ef4444, #f97316)'
            : 'linear-gradient(90deg, #a855f7, #ec4899)',
        color: '#fff',
      }}
    >
      <Sparkles size={12} />
      {days <= 2
        ? `Trial ending ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`} — Upgrade now`
        : `Free trial: ${days} days left — Upgrade to Pro`}
    </button>
  )
}
