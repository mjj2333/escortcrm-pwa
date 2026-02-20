import { useState, useEffect } from 'react'
import { Shield, Delete } from 'lucide-react'

/** SHA-256 hash a PIN string → hex. Used for storage and comparison so
 *  the plaintext PIN never lives in localStorage. */
export async function hashPin(pin: string): Promise<string> {
  const encoded = new TextEncoder().encode(pin)
  const buf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

interface PinLockProps {
  onUnlock: () => void
  correctPin: string
  isSetup?: boolean
  onSetPin?: (pin: string) => void
}

export function PinLock({ onUnlock, correctPin, isSetup, onSetPin }: PinLockProps) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [phase, setPhase] = useState<'enter' | 'confirm'>(isSetup ? 'enter' : 'enter')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  const maxLength = 4
  const currentPin = phase === 'confirm' ? confirmPin : pin

  useEffect(() => {
    if (!isSetup && pin.length === maxLength) {
      hashPin(pin).then(hash => {
        if (hash === correctPin) {
          onUnlock()
        } else {
          setError('Incorrect PIN')
          setShake(true)
          setTimeout(() => { setShake(false); setPin(''); setError('') }, 600)
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
          onSetPin?.(hash)
          onUnlock()
        })
      } else {
        setError('PINs don\'t match')
        setShake(true)
        setTimeout(() => { setShake(false); setConfirmPin(''); setError(''); setPhase('enter'); setPin('') }, 600)
      }
    }
  }, [pin, confirmPin, phase, isSetup, correctPin, onUnlock, onSetPin])

  function handleKey(digit: string) {
    if (phase === 'confirm') {
      if (confirmPin.length < maxLength) setConfirmPin(prev => prev + digit)
    } else {
      if (pin.length < maxLength) setPin(prev => prev + digit)
    }
  }

  function handleDelete() {
    if (phase === 'confirm') {
      setConfirmPin(prev => prev.slice(0, -1))
    } else {
      setPin(prev => prev.slice(0, -1))
    }
  }

  const title = isSetup
    ? phase === 'confirm' ? 'Confirm PIN' : 'Create PIN'
    : 'Enter PIN'

  const subtitle = isSetup
    ? phase === 'confirm' ? 'Enter your PIN again' : 'Choose a 4-digit PIN'
    : 'Enter your PIN to unlock'

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="flex flex-col items-center gap-6 w-full max-w-xs px-8">
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
        >
          <Shield size={28} className="text-purple-500" />
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
        <div className="grid grid-cols-3 gap-3 w-full">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key, i) => {
            if (key === '') return <div key={i} />
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
