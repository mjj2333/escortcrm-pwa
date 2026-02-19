import { useRef, useCallback } from 'react'
import type { ScreeningStatus } from '../types'

const segments: { status: ScreeningStatus; label: string; color: string; position: number }[] = [
  { status: 'Declined',  label: 'Declined', color: '#ef4444', position: 0 },
  { status: 'Pending',   label: 'Pending',  color: '#f59e0b', position: 1 },
  { status: 'Verified',  label: 'Verified', color: '#22c55e', position: 2 },
]

interface ScreeningStatusBarProps {
  value: ScreeningStatus
  onChange: (status: ScreeningStatus) => void
  disabled?: boolean
  /** Compact mode for swipe actions - shorter height, no label row */
  compact?: boolean
}

export function ScreeningStatusBar({ value, onChange, disabled, compact }: ScreeningStatusBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const isInProgress = value === 'In Progress'
  const activeIndex = segments.findIndex(s => s.status === value)

  const resolveStatus = useCallback((clientX: number) => {
    if (disabled || !barRef.current) return
    const rect = barRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    const idx = Math.min(2, Math.floor(pct * 3))
    onChange(segments[idx].status)
  }, [disabled, onChange])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    resolveStatus(e.clientX)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (disabled) return
    if (e.buttons === 0 && e.pressure === 0) return
    resolveStatus(e.clientX)
  }

  // Colors & fill
  const activeColor = isInProgress
    ? '#3b82f6'
    : activeIndex >= 0 ? segments[activeIndex].color : '#71717a'

  // Fill gradient based on position
  const effectiveIdx = isInProgress ? 1.5 : activeIndex
  const fillPct = effectiveIdx < 0 ? 0 : ((effectiveIdx + 1) / 3) * 100

  const fillGradient =
    effectiveIdx <= 0 ? segments[0].color
    : effectiveIdx <= 1 ? `linear-gradient(to right, ${segments[0].color}, ${segments[1].color})`
    : `linear-gradient(to right, ${segments[0].color}, ${segments[1].color}, ${segments[2].color})`

  const barHeight = compact ? 'h-7' : 'h-8'

  return (
    <div className="select-none">
      {/* Label row - hide in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Screening</span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: `${activeColor}20`,
              color: activeColor,
            }}
          >
            {value}
          </span>
        </div>
      )}

      {/* Bar */}
      <div
        ref={barRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className={`relative w-full ${barHeight} rounded-full ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
        style={{ backgroundColor: 'var(--bg-secondary)', touchAction: 'none' }}
      >
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-200"
          style={{
            width: `${fillPct}%`,
            background: fillGradient,
            opacity: 0.85,
          }}
        />

        {/* Segment labels */}
        <div className="absolute inset-0 flex">
          {segments.map((s, i) => (
            <button
              key={s.status}
              onClick={() => !disabled && onChange(s.status)}
              className="flex-1 flex items-center justify-center relative z-10"
              disabled={disabled}
            >
              <span
                className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-bold uppercase tracking-wide transition-all duration-200`}
                style={{
                  color: effectiveIdx >= i ? 'white' : 'var(--text-secondary)',
                  textShadow: effectiveIdx >= i ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
                }}
              >
                {s.label}
              </span>
            </button>
          ))}
        </div>

        {/* Thumb indicator */}
        <div
          className={`absolute ${compact ? 'top-0.5 w-6 h-6' : 'top-0.5 w-7 h-7'} rounded-full border-2 border-white shadow-lg transition-all duration-200`}
          style={{
            left: `calc(${((effectiveIdx + 0.5) / 3) * 100}% - ${compact ? 12 : 14}px)`,
            backgroundColor: activeColor,
            boxShadow: `0 2px 8px ${activeColor}60`,
          }}
        />
      </div>

      {/* "In Progress" option - hide in compact mode */}
      {!compact && !disabled && value !== 'In Progress' && (
        <button
          onClick={() => onChange('In Progress')}
          className="mt-1.5 text-[11px] font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Set to In Progress
        </button>
      )}
      {!compact && !disabled && value === 'In Progress' && (
        <button
          onClick={() => onChange('Pending')}
          className="mt-1.5 text-[11px] font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Clear → Pending
        </button>
      )}
    </div>
  )
}
