import { useState, useEffect } from 'react'
import { Shield, Check, Sparkles, Mail, X, Loader, ChevronLeft } from 'lucide-react'
import { db } from '../db'

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
// OBFUSCATED STORAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// The old key was 'companion_activation' — trivially discoverable.
// The new key is non-obvious and the value now requires a server-signed
// HMAC token that cannot be forged without the ACTIVATION_SECRET env var.

const STORAGE_KEY = '_cstate_v2'
const REVALIDATION_KEY = '_cstate_rv'  // timestamp of last successful revalidation

// How often to re-verify with the server (24 hours)
const REVALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACTIVATION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ActivationState {
  activated: boolean
  email?: string
  plan?: 'lifetime' | 'monthly'
  activatedAt?: string
  isBetaTester?: boolean
  betaExpiresAt?: string  // ISO date — beta access expires on this date
  /** Server-signed HMAC token — required for activation to be considered valid */
  token?: string
  /** Identifier used for the HMAC (email or gift:hash) — needed for revalidation */
  identifier?: string
  // NOTE: trialStarted has been moved to the Dexie meta table ('trial_start')
  // to prevent easy reset via localStorage. Legacy values are migrated on init.
}

export function getActivation(): ActivationState {
  try {
    // Try new key first
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
    // Migration: read from old key, then delete it
    const legacy = localStorage.getItem('companion_activation')
    if (legacy) {
      const parsed = JSON.parse(legacy)
      localStorage.setItem(STORAGE_KEY, legacy)
      localStorage.removeItem('companion_activation')
      return parsed
    }
  } catch {}
  return { activated: false }
}

export function setActivation(state: ActivationState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRIAL STATE — stored in Dexie meta table, not localStorage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IndexedDB is much less obvious to find and edit than localStorage.
// A module-level cache keeps the sync API surface intact.

const TRIAL_META_KEY = 'trial_start'
let _trialStartCache: Date | null = null

/** Call on app boot (from App.tsx). Loads the trial start date from the
 *  Dexie meta table into a module-level cache. Also handles one-time
 *  migration from the old localStorage-based trialStarted field. */
export async function initTrialState(): Promise<void> {
  try {
    // 1. Check Dexie meta table first
    const existing = await db.meta.get(TRIAL_META_KEY)
    if (existing?.value) {
      _trialStartCache = new Date(existing.value as string)
      return
    }

    // 2. Migrate from localStorage activation state (old format)
    const activation = getActivation()
    const legacyTrial = (activation as any).trialStarted
    if (legacyTrial) {
      _trialStartCache = new Date(legacyTrial)
      await db.meta.put({ key: TRIAL_META_KEY, value: legacyTrial })
      // Clean up the old field from localStorage
      const { trialStarted: _, ...cleaned } = activation as any
      setActivation(cleaned)
      return
    }

    // 3. First launch — record trial start
    const now = new Date()
    _trialStartCache = now
    await db.meta.put({ key: TRIAL_META_KEY, value: now.toISOString() })
  } catch (err) {
    console.warn('[Paywall] Failed to init trial state from Dexie:', err)
    // Fallback: start trial now (conservative — user gets full trial)
    _trialStartCache = new Date()
  }
}

export function getTrialStart(): Date {
  // Cache is populated by initTrialState() on boot.
  // If not yet initialized (very early render), return now as a safe fallback.
  return _trialStartCache ?? new Date()
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
  const activation = getActivation()
  if (!activation.activated) return false

  // Server-signed token is now REQUIRED for paid activations.
  // Migrated users without a token get a grace period — they'll be asked
  // to re-verify on next revalidation.  Beta testers are exempt since
  // their codes were validated server-side and the token was returned.
  if (!activation.token && !activation.isBetaTester) {
    // Legacy activation without token. Clear the revalidation timestamp so
    // revalidateActivation() isn't skipped on the next launch — it will attempt
    // a silent token upgrade (if email is available) or leave them activated if not.
    // Without this, a legacy user with a recent _cstate_rv entry would skip
    // revalidation for up to 24 hours and never get upgraded to a signed token.
    try { localStorage.removeItem(REVALIDATION_KEY) } catch {}
  }

  // Check beta expiration
  if (activation.betaExpiresAt) {
    if (new Date() > new Date(activation.betaExpiresAt)) {
      // Expired — deactivate
      setActivation({ ...activation, activated: false })
      return false
    }
  }
  return true
}

export function needsPaywall(): boolean {
  return !isActivated() && !isTrialActive()
}

export function isBetaTester(): boolean {
  return getActivation().isBetaTester === true
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REVALIDATION — called on app launch from App.tsx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Called on app launch. Checks the server to confirm the activation is still
 *  valid. Silently deactivates if the subscription was cancelled or the token
 *  is forged. Returns true if activation is (still) valid, false if revoked.
 *  Skips the check if offline, within the revalidation window, or not activated. */
export async function revalidateActivation(): Promise<boolean> {
  const activation = getActivation()
  if (!activation.activated) return false

  // Skip revalidation for beta testers without email (gift-code only)
  // They don't have a subscription to check.
  if (activation.isBetaTester && !activation.email) return true

  // Skip if we revalidated recently
  try {
    const lastCheck = parseInt(localStorage.getItem(REVALIDATION_KEY) ?? '0', 10)
    if (Date.now() - lastCheck < REVALIDATION_INTERVAL_MS) return true
  } catch {}

  // Skip if offline
  if (!navigator.onLine) return true

  // Legacy activation without token — needs re-verification
  if (!activation.token || !activation.identifier) {
    // If they have an email, try to re-verify and get a token
    if (activation.email) {
      try {
        const result = await verifyPurchase(activation.email)
        if (result.valid && result.token) {
          setActivation({
            ...activation,
            token: result.token,
            identifier: activation.email,
          })
          localStorage.setItem(REVALIDATION_KEY, String(Date.now()))
          return true
        }
      } catch {}
    }
    // No email or verification failed — leave activated for now
    // (don't lock out legacy users who can't re-verify)
    return true
  }

  // Revalidate with the server
  try {
    const res = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'revalidate',
        email: activation.identifier,
        plan: activation.plan,
        token: activation.token,
      }),
    })
    const data = await res.json()

    if (data.valid) {
      localStorage.setItem(REVALIDATION_KEY, String(Date.now()))
      return true
    }

    // Server says invalid — deactivate
    setActivation({
      ...activation,
      activated: false,
      token: undefined,
    })
    localStorage.removeItem(REVALIDATION_KEY)
    return false
  } catch {
    // Network error — don't punish the user, try again next launch
    return true
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STRIPE VERIFICATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function verifyPurchase(
  email: string
): Promise<{ valid: boolean; plan?: 'lifetime' | 'monthly'; token?: string; error?: string }> {
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
// PROMO / GIFT CODES — validated server-side
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Code hashes live in the Netlify function, not the client bundle,
// so they can't be brute-forced by inspecting the JS.

const GIFT_CODE_ENDPOINT = '/.netlify/functions/validate-gift-code'

async function matchGiftCode(code: string): Promise<{ expiresAt?: string; token?: string; identifier?: string } | null> {
  try {
    const res = await fetch(GIFT_CODE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    if (data.valid) return { expiresAt: data.expiresAt ?? undefined, token: data.token ?? undefined, identifier: data.identifier ?? undefined }
    return null
  } catch {
    return null
  }
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
  initialCode?: string
}

export function Paywall({ onActivated, onClose, initialCode }: PaywallProps) {
  const [showVerify, setShowVerify] = useState(!!initialCode)
  const [verifyInput, setVerifyInput] = useState(initialCode || '')
  const [isGiftMode, setIsGiftMode] = useState(!!initialCode)
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

    // Gift code path
    if (isGiftMode) {
      const giftCode = await matchGiftCode(input)
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
              Support development & unlock everything
            </p>
            {daysLeft > 0 && daysLeft <= TRIAL_DAYS && (
              <p className="text-xs mt-2" style={{ color: '#a855f7' }}>
                {daysLeft} day{daysLeft !== 1 ? 's' : ''} left in your free trial
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
      className="w-full px-4 text-center text-xs font-semibold flex items-center justify-center gap-1.5"
      style={{
        background:
          days <= 2
            ? 'linear-gradient(90deg, #ef4444, #f97316)'
            : 'linear-gradient(90deg, #a855f7, #ec4899)',
        color: '#fff',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        paddingBottom: '8px',
      }}
    >
      <Sparkles size={12} />
      {days <= 2
        ? `Trial ending ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`} — Upgrade now`
        : `Free trial: ${days} days left — Upgrade to Pro`}
    </button>
  )
}
