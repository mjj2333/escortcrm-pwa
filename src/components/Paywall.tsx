import { useState, useEffect } from 'react'
import { Shield, Check, Sparkles, Key, X, Loader } from 'lucide-react'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VARIANT_LIFETIME = '832622'
const VARIANT_MONTHLY = '832631'
const TRIAL_DAYS = 7

// Checkout URLs use the variant ID
const CHECKOUT_BASE = `https://companion1.lemonsqueezy.com/buy`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACTIVATION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ActivationState {
  activated: boolean
  licenseKey?: string
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
  // First time — start trial now
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
// LEMON SQUEEZY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let lemonLoaded = false

function loadLemonSqueezy(): Promise<void> {
  if (lemonLoaded) return Promise.resolve()
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://app.lemonsqueezy.com/js/lemon.js'
    script.defer = true
    script.onload = () => {
      lemonLoaded = true
      // @ts-ignore
      window.createLemonSqueezy?.()
      resolve()
    }
    document.head.appendChild(script)
  })
}

async function openCheckout(variantId: string) {
  await loadLemonSqueezy()
  // @ts-ignore
  window.LemonSqueezy?.Url?.Open?.(`${CHECKOUT_BASE}/${variantId}?embed=1&media=0&logo=0&dark=1`)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROMO / GIFT CODES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Gift codes are stored as SHA-256 hashes so they aren't visible in source.
// To add new codes: run in browser console:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('YOUR-CODE')).then(b => console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))
// Then add the hex string to this array.
const GIFT_CODE_HASHES: string[] = [
  '22b70cf5f3c48d73f301cb49e00b43604b3bff75be01319ce42a7cb2b1574e8a', // COMPANION-FRIEND-001
  '7ff50e40fc16aaca1dd462c9310b97db4e3455bef6ca8597f6d79d96b80b6f5d', // COMPANION-FRIEND-002
  'e17feea8d0336808d0626211d4329641363aea251f6cf272826d99b922f73e4b', // COMPANION-FRIEND-003
  'fc5f03e446befb2b4dff21986943b8e987056056f806a6af7d9354f83a2a476c', // COMPANION-FRIEND-004
  'ad93e9abe2968f813af1a63ab8f1f811a6771a8fe54f8cdce7db4706fb6cd8ec', // COMPANION-FRIEND-005
  '064ed653d8255f22b85ef34d3d4d7ba4e0f9a2fcce6146df670d1eeb0d734e8c', // COMPANION-FRIEND-006
  '01139000e917e30c9833c6008e37a1c5b237a00fc1d928d7bd617d169795442d', // COMPANION-FRIEND-007
  '47936b5c1a7baef51aef96db4039a30a32ee5b3b29b3992625bf85e04ca91713', // COMPANION-FRIEND-008
  '7c2d0b10df6053d2748bfc9a8767a062e2024509a9b6f527665bc2309e818767', // COMPANION-FRIEND-009
  'cd0690feb7fa9c4ee2a287d22e2c5da02557e35cec6cd947af914c9d4ec174ac', // COMPANION-FRIEND-010
]

async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code.trim().toUpperCase())
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function isValidGiftCode(code: string): Promise<boolean> {
  const hash = await hashCode(code)
  return GIFT_CODE_HASHES.includes(hash)
}

// Validate a license key — checks gift codes first, then LS API
async function validateLicenseKey(key: string): Promise<{ valid: boolean; plan?: 'lifetime' | 'monthly'; error?: string }> {
  // Check gift codes first (instant, no network needed)
  if (await isValidGiftCode(key)) {
    return { valid: true, plan: 'lifetime' }
  }

  try {
    const res = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ license_key: key, instance_name: 'companion-pwa' }),
    })
    const data = await res.json()

    if (data.valid || data.license_key?.status === 'active') {
      const variantId = String(data.meta?.variant_id ?? data.license_key?.variant_id ?? '')
      const plan = variantId === VARIANT_LIFETIME ? 'lifetime' : 'monthly'
      return { valid: true, plan }
    }

    // Try activating if not yet activated
    if (data.error === 'license_key_not_activated' || data.license_key?.status === 'inactive') {
      const activateRes = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ license_key: key, instance_name: 'companion-pwa' }),
      })
      const activateData = await activateRes.json()
      if (activateData.activated || activateData.license_key?.status === 'active') {
        const variantId = String(activateData.meta?.variant_id ?? activateData.license_key?.variant_id ?? '')
        const plan = variantId === VARIANT_LIFETIME ? 'lifetime' : 'monthly'
        return { valid: true, plan }
      }
    }

    return { valid: false, error: data.error ?? 'Invalid license key' }
  } catch (err) {
    return { valid: false, error: 'Network error — check your connection' }
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
}

export function Paywall({ onActivated }: PaywallProps) {
  const [showLicenseInput, setShowLicenseInput] = useState(false)
  const [licenseKey, setLicenseKey] = useState('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')

  // Listen for checkout success via postMessage from LS overlay
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // LemonSqueezy sends events when checkout completes
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data)
          if (data.event === 'Checkout.Success') {
            const key = data.data?.order?.first_order_item?.license_key
            const variantId = String(data.data?.order?.first_order_item?.variant_id ?? '')
            const plan = variantId === VARIANT_LIFETIME ? 'lifetime' : 'monthly'
            setActivation({
              activated: true,
              licenseKey: key,
              plan,
              activatedAt: new Date().toISOString(),
              trialStarted: getActivation().trialStarted,
            })
            onActivated()
          }
        } catch {}
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onActivated])

  async function handleValidate() {
    if (!licenseKey.trim()) return
    setValidating(true)
    setError('')

    const result = await validateLicenseKey(licenseKey.trim())
    if (result.valid) {
      setActivation({
        activated: true,
        licenseKey: licenseKey.trim(),
        plan: result.plan,
        activatedAt: new Date().toISOString(),
        trialStarted: getActivation().trialStarted,
      })
      onActivated()
    } else {
      setError(result.error ?? 'Invalid license key')
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

          {/* Header */}
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
            >
              <Shield size={32} color="#fff" />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Companion Pro
            </h1>
            {daysLeft > 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Your free trial has <span className="font-semibold text-purple-500">{daysLeft} day{daysLeft !== 1 ? 's' : ''}</span> remaining
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
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
                    <Check size={11} style={{ color: '#a855f7' }} strokeWidth={3} />
                  </div>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing cards */}
          <div className="space-y-3 mb-6">
            {/* Monthly */}
            <button
              onClick={() => openCheckout(VARIANT_MONTHLY)}
              className="w-full p-4 rounded-xl border-2 text-left transition-all active:scale-[0.98]"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Monthly</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Cancel anytime</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    $9.99<span className="text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>/mo</span>
                  </p>
                </div>
              </div>
            </button>

            {/* Lifetime */}
            <button
              onClick={() => openCheckout(VARIANT_LIFETIME)}
              className="w-full p-4 rounded-xl border-2 text-left transition-all active:scale-[0.98] relative overflow-hidden"
              style={{ borderColor: '#a855f7', backgroundColor: 'var(--bg-card)' }}
            >
              <div className="absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold text-white rounded-bl-lg"
                style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
                <Sparkles size={10} className="inline mr-0.5 -mt-0.5" /> BEST VALUE
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Lifetime</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>One-time payment, forever access</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-purple-500">$49.99</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>pay once</p>
                </div>
              </div>
            </button>
          </div>

          {/* Restore purchase */}
          {!showLicenseInput ? (
            <button
              onClick={() => setShowLicenseInput(true)}
              className="w-full text-center text-sm py-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Key size={14} className="inline mr-1 -mt-0.5" />
              Have a license key or promo code?
            </button>
          ) : (
            <div
              className="rounded-xl p-3 space-y-3"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>License Key or Promo Code</span>
                <button onClick={() => { setShowLicenseInput(false); setError('') }} style={{ color: 'var(--text-secondary)' }}>
                  <X size={16} />
                </button>
              </div>
              <input
                type="text"
                value={licenseKey}
                onChange={e => setLicenseKey(e.target.value)}
                placeholder="License key or promo code..."
                className="w-full text-sm p-2.5 rounded-lg bg-transparent outline-none font-mono"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
              />
              {error && (
                <p className="text-xs text-red-500">{error}</p>
              )}
              <button
                onClick={handleValidate}
                disabled={validating || !licenseKey.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-purple-600 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {validating ? <><Loader size={14} className="animate-spin" /> Validating...</> : 'Activate'}
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
        background: days <= 2
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
