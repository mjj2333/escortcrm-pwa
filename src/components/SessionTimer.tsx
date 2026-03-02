import { useState, useEffect, useRef } from 'react'
import { Clock } from 'lucide-react'

interface SessionTimerProps {
  startTime: Date
  durationMin: number
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SessionTimer({ startTime, durationMin }: SessionTimerProps) {
  const [now, setNow] = useState(Date.now())
  const vibratedWarning = useRef(false)
  const vibratedEnd = useRef(false)

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Reset vibration refs when booking changes
  useEffect(() => {
    vibratedWarning.current = false
    vibratedEnd.current = false
  }, [startTime, durationMin])

  const endMs = new Date(startTime).getTime() + durationMin * 60000
  const remaining = endMs - now
  const isOvertime = remaining <= 0
  const isWarning = remaining > 0 && remaining <= 5 * 60 * 1000

  // Progress: 0 → 1 as time passes
  const elapsed = now - new Date(startTime).getTime()
  const totalMs = durationMin * 60000
  const progress = totalMs > 0 ? Math.min(Math.max(elapsed / totalMs, 0), 1) : 1

  // Vibration alerts
  useEffect(() => {
    if (isWarning && !vibratedWarning.current) {
      vibratedWarning.current = true
      navigator.vibrate?.([200, 100, 200])
    }
    if (isOvertime && !vibratedEnd.current) {
      vibratedEnd.current = true
      navigator.vibrate?.([500, 200, 500, 200, 500])
    }
  }, [isWarning, isOvertime])

  const barColor = isOvertime
    ? '#ef4444'
    : isWarning
    ? '#f97316'
    : '#a855f7'

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid ${isOvertime ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} style={{ color: barColor }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Session Timer
        </span>
      </div>

      {/* Countdown display */}
      <div className="text-center mb-3">
        <span
          className="text-3xl font-mono font-bold"
          style={{ color: isOvertime ? '#ef4444' : 'var(--text-primary)' }}
        >
          {isOvertime ? '+' : ''}{formatTime(remaining)}
        </span>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          {isOvertime ? 'overtime' : 'remaining'}
        </p>
      </div>

      {/* Progress bar */}
      <div
        className="h-2 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Session progress"
        style={{ backgroundColor: 'var(--border)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${Math.min(progress * 100, 100)}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
    </div>
  )
}
