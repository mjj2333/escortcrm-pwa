import { useState, useEffect } from 'react'
import { Shield, Delete, Fingerprint } from 'lucide-react'
import { isBiometricEnabled, assertBiometric } from '../hooks/useBiometric'

/** SHA-256 hash a PIN string → hex. Used for storage and comparison so
 *  the plaintext PIN never lives in localStorage. */
export async function hashPin(pin: string): Promise<string> {
  const encoded = new TextEncoder().encode(pin)
  const buf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RATE LIMITING — exponential backoff on failed attempts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ATTEMPTS_KEY = 'pin_attempts'
const LOCKOUT_KEY = 'pin_lockout_until'
const MAX_ATTEMPTS_BEFORE_WIPE = 10

/** Returns the lockout duration in ms for a given attempt count, or 0 if none. */
function getLockoutMs(attempts: number): number {
  if (attempts >= MAX_ATTEMPTS_BEFORE_WIPE) return 0 // wipe path, no lockout
  if (attempts >= 5) return 5 * 60 * 1000   // 5 minutes
  if (attempts >= 3) return 30 * 1000        // 30 seconds
  return 0
}

function getAttempts(): number {
  return parseInt(localStorage.getItem(ATTEMPTS_KEY) ?? '0', 10) || 0
}

function getLockoutUntil(): number {
  return parseInt(localStorage.getItem(LOCKOUT_KEY) ?? '0', 10) || 0
}

function recordFailedAttempt(): number {
  const attempts = getAttempts() + 1
  localStorage.setItem(ATTEMPTS_KEY, String(attempts))
  const lockoutMs = getLockoutMs(attempts)
  if (lockoutMs > 0) {
    localStorage.setItem(LOCKOUT_KEY, String(Date.now() + lockoutMs))
  }
  return attempts
}

function clearAttempts() {
  localStorage.removeItem(ATTEMPTS_KEY)
  localStorage.removeItem(LOCKOUT_KEY)
}

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min > 0) return `${min}:${sec.toString().padStart(2, '0')}`
  return `${sec}s`
}

interface PinLockProps {
  onUnlock: (plaintextPin: string) => void
  correctPin: string
  isSetup?: boolean
  onSetPin?: (pinHash: string, plaintextPin: string) => void
  onCancel?: () => void
}

export function PinLock({ onUnlock, correctPin, isSetup, onSetPin, onCancel }: PinLockProps) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [phase, setPhase] = useState<'enter' | 'confirm'>(isSetup ? 'enter' : 'enter')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [biometricFailed, setBiometricFailed] = useState(false)
  const [biometricPending, setBiometricPending] = useState(false)

  // Rate limiting state
  const [lockedOut, setLockedOut] = useState(false)
  const [countdown, setCountdown] = useState('')
  const [wiping, setWiping] = useState(false)

  const showBiometric = !isSetup && isBiometricEnabled() && !biometricFailed

  // Auto-trigger biometric on mount when it's available and not in setup mode
  useEffect(() => {
    if (!showBiometric) return
    setBiometricPending(true)
    attemptBiometric()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function attemptBiometric() {
    setBiometricPending(true)
    const pin = await assertBiometric()
    if (pin !== null) {
      clearAttempts()
      onUnlock(pin)
    } else {
      setBiometricFailed(true) // fall back to PIN UI
      setBiometricPending(false)
    }
  }

  const maxLength = 4
  const currentPin = phase === 'confirm' ? confirmPin : pin

  // Check lockout on mount + tick countdown every second
  useEffect(() => {
    if (isSetup) return // no lockout during PIN setup

    function checkLockout() {
      const until = getLockoutUntil()
      const remaining = until - Date.now()
      if (remaining > 0) {
        setLockedOut(true)
        setCountdown(formatCountdown(remaining))
        const attempts = getAttempts()
        setError(`Too many attempts (${attempts}). Try again in ${formatCountdown(remaining)}`)
      } else {
        setLockedOut(false)
        setCountdown('')
        // Keep the attempt-count error visible but clear the lockout text
        const attempts = getAttempts()
        if (attempts >= 3) {
          setError(`${attempts} failed attempt${attempts !== 1 ? 's' : ''}`)
        }
      }
    }

    checkLockout()
    const interval = setInterval(checkLockout, 1000)
    return () => clearInterval(interval)
  }, [isSetup])

  useEffect(() => {
    let cancelled = false
    if (!isSetup && pin.length === maxLength) {
      // Block verification during lockout
      if (lockedOut) {
        setPin('')
        return
      }
      hashPin(pin).then(hash => {
        if (cancelled) return
        if (hash === correctPin) {
          clearAttempts()
          onUnlock(pin)
        } else {
          const attempts = recordFailedAttempt()

          // Wipe all data at 10 failed attempts
          if (attempts >= MAX_ATTEMPTS_BEFORE_WIPE) {
            setWiping(true)
            setError('Too many failed attempts — erasing all data for safety')
            // Dynamic import to avoid circular dependency
            import('../db').then(({ db }) => {
              db.delete().catch(() => {}).then(() => {
                localStorage.clear()
                window.location.reload()
              })
            })
            return
          }

          const lockoutMs = getLockoutMs(attempts)
          if (lockoutMs > 0) {
            setError(`Too many attempts (${attempts}). Locked for ${formatCountdown(lockoutMs)}`)
            setLockedOut(true)
          } else {
            setError('Incorrect PIN')
          }

          setShake(true)
          setTimeout(() => { if (!cancelled) { setShake(false); setPin('') } }, 600)
        }
      })
    }
    if (isSetup && phase === 'enter' && pin.length === maxLength) {
      setPhase('confirm')
    }
    if (isSetup && phase === 'confirm' && confirmPin.length === maxLength) {
      if (confirmPin === pin) {
        // Store the hash, never the plaintext
        hashPin(pin).then(hash => {
          if (cancelled) return
          clearAttempts() // reset any prior failed attempts
          onSetPin?.(hash, pin)
          onUnlock(pin)
        })
      } else {
        setError('PINs don\'t match')
        setShake(true)
        setTimeout(() => { if (!cancelled) { setShake(false); setConfirmPin(''); setError(''); setPhase('enter'); setPin('') } }, 600)
      }
    }
    return () => { cancelled = true }
  }, [pin, confirmPin, phase, isSetup, correctPin, onUnlock, onSetPin, lockedOut])

  const isDisabled = lockedOut || wiping

  function handleKey(digit: string) {
    if (isDisabled) return
    if (phase === 'confirm') {
      if (confirmPin.length < maxLength) setConfirmPin(prev => prev + digit)
    } else {
      if (pin.length < maxLength) setPin(prev => prev + digit)
    }
  }

  function handleDelete() {
    if (isDisabled) return
    if (phase === 'confirm') {
      setConfirmPin(prev => prev.slice(0, -1))
    } else {
      setPin(prev => prev.slice(0, -1))
    }
  }

  const title = isSetup
    ? phase === 'confirm' ? 'Confirm PIN' : 'Create PIN'
    : 'Enter PIN'

  const subtitle = wiping
    ? 'Erasing data...'
    : isSetup
    ? phase === 'confirm' ? 'Enter your PIN again' : 'Choose a 4-digit PIN'
    : lockedOut
    ? `Locked — try again in ${countdown}`
    : 'Enter your PIN to unlock'

  // While biometric prompt is active, show minimal lock screen (no PIN pad flash)
  if (biometricPending) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="flex flex-col items-center gap-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
          >
            <Fingerprint size={28} className="text-purple-500" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Unlock</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Verifying identity…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Cancel button for setup mode */}
      {isSetup && onCancel && (
        <button
          onClick={onCancel}
          className="absolute top-0 left-0 px-4 text-sm font-medium"
          style={{ color: 'var(--text-secondary)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
        >
          ← Cancel
        </button>
      )}
      <div className="flex flex-col items-center gap-6 w-full max-w-xs px-8">
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDisabled ? 'rgba(239,68,68,0.15)' : 'rgba(168,85,247,0.15)' }}
        >
          <Shield size={28} className={isDisabled ? 'text-red-500' : 'text-purple-500'} />
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
        </div>

        {/* PIN Dots */}
        <div className={`flex gap-4 ${shake ? 'animate-shake' : ''}`}>
          {Array.from({ length: maxLength }).map((_, i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-full transition-all duration-150"
              style={{
                backgroundColor: i < currentPin.length ? '#a855f7' : 'transparent',
                border: `2px solid ${i < currentPin.length ? '#a855f7' : 'var(--border)'}`,
                transform: i < currentPin.length ? 'scale(1.2)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {/* Error */}
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full" style={{ opacity: isDisabled ? 0.3 : 1, pointerEvents: isDisabled ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].map((key, i) => {
            if (key === 'bio') {
              if (showBiometric) {
                return (
                  <button
                    key={i}
                    onClick={attemptBiometric}
                    className="h-16 rounded-2xl flex items-center justify-center active:bg-white/10 transition-colors"
                    aria-label="Use biometrics"
                  >
                    <Fingerprint size={26} style={{ color: 'var(--text-secondary)' }} />
                  </button>
                )
              }
              return <div key={i} />
            }
            if (key === 'del') {
              return (
                <button
                  key={i}
                  onClick={handleDelete}
                  className="h-16 rounded-2xl flex items-center justify-center active:bg-white/10 transition-colors"
                >
                  <Delete size={22} style={{ color: 'var(--text-secondary)' }} />
                </button>
              )
            }
            return (
              <button
                key={i}
                onClick={() => handleKey(key)}
                className="h-16 rounded-2xl text-2xl font-light active:bg-white/10 transition-colors"
                style={{
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                {key}
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-10px); }
          80% { transform: translateX(10px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  )
}
