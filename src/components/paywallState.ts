// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG — Update these after creating products in Stripe Dashboard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Stripe Payment Link URLs — create in Stripe Dashboard → Payment Links
export const STRIPE_MONTHLY_LINK = 'https://buy.stripe.com/eVq9AV8Xf523cU55DD0kE01'
export const STRIPE_LIFETIME_LINK = 'https://buy.stripe.com/5kQ7sNddveCD2fr2rr0kE00'

// Netlify function endpoint for purchase verification
const VERIFY_ENDPOINT = '/.netlify/functions/verify-purchase'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OBFUSCATED STORAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// The old key was 'companion_activation' — trivially discoverable.
// The new key is non-obvious and the value now requires a server-signed
// HMAC token that cannot be forged without the ACTIVATION_SECRET env var.

const STORAGE_KEY = '_cstate_v2'
export const REVALIDATION_KEY = '_cstate_rv'  // timestamp of last successful revalidation

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
// LEGACY TRIAL STUBS — kept for backward compatibility
// The app now uses a usage-based freemium model, not time-limited trials.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** No-op — trial logic removed. Kept so App.tsx init doesn't break. */
export async function initTrialState(): Promise<void> {}

/** @deprecated Always returns 0. Use usePlanLimits() instead. */
export function getTrialDaysRemaining(): number { return 0 }

/** @deprecated Always returns false. Use isPro() or usePlanLimits() instead. */
export function isTrialActive(): boolean { return false }

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

/** With freemium model, the app never fully locks out. This always returns false.
 *  Individual features are gated by ProGate components and usePlanLimits(). */
export function needsPaywall(): boolean {
  return false
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
    // But if there's no email AND no beta flag, this isn't a real activation
    if (!activation.email && !activation.isBetaTester) {
      setActivation({ ...activation, activated: false })
      return false
    }
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

export async function verifyPurchase(
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

export async function matchGiftCode(code: string): Promise<{ expiresAt?: string; token?: string; identifier?: string } | 'network_error' | null> {
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
    return 'network_error'
  }
}
