import { useRef, useCallback } from 'react'
import type { RiskLevel } from '../types'

const levels: { level: RiskLevel; label: string; color: string; position: number }[] = [
  { level: 'Low Risk',    label: 'Low',    color: '#22c55e', position: 0 },
  { level: 'Medium Risk', label: 'Medium', color: '#eab308', position: 1 },
  { level: 'High Risk',   label: 'High',   color: '#ef4444', position: 2 },
]

interface RiskLevelBarProps {
  value: RiskLevel
  onChange: (level: RiskLevel) => void
  disabled?: boolean
}

export function RiskLevelBar({ value, onChange, disabled }: RiskLevelBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const isUnknown = value === 'Unknown'
  const activeIndex = levels.findIndex(l => l.level === value)

  // Map touch/pointer position to level
  const resolveLevel = useCallback((clientX: number) => {
    if (disabled || !barRef.current) return
    const rect = barRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    // Divide into 3 zones
    const idx = Math.min(2, Math.floor(pct * 3))
    onChange(levels[idx].level)
  }, [disabled, onChange])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    resolveLevel(e.clientX)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (disabled) return
    if (e.buttons === 0 && e.pressure === 0) return
    resolveLevel(e.clientX)
  }

  // Bar fill width and color
  const fillPct = isUnknown ? 0 : ((activeIndex + 1) / 3) * 100
  const activeColor = isUnknown ? '#71717a' : levels[activeIndex].color

  // Gradient for the filled portion
  const fillGradient = isUnknown
    ? 'transparent'
    : activeIndex === 0
      ? '#22c55e'
      : activeIndex === 1
        ? 'linear-gradient(to right, #22c55e, #eab308)'
        : 'linear-gradient(to right, #22c55e, #eab308, #ef4444)'

  return (
    <div className="select-none">
      {/* Label row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Risk Level</span>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: isUnknown ? 'rgba(113,113,122,0.15)' : `${activeColor}20`,
            color: activeColor,
          }}
        >
          {isUnknown ? 'Unknown' : value}
        </span>
      </div>

      {/* Bar */}
      <div
        ref={barRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className={`relative w-full h-8 rounded-full ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
        style={{ backgroundColor: 'var(--bg-secondary)', touchAction: 'none' }}
      >
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-200"
          style={{
            width: `${fillPct}%`,
            background: fillGradient,
            opacity: isUnknown ? 0 : 0.85,
          }}
        />

        {/* Segment markers */}
        <div className="absolute inset-0 flex">
          {levels.map((l, i) => (
            <button
              key={l.level}
              onClick={() => !disabled && onChange(l.level)}
              aria-label={`Set risk level to ${l.label}`}
              className="flex-1 flex items-center justify-center relative z-10"
              disabled={disabled}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-wide transition-all duration-200"
                style={{
                  color: !isUnknown && activeIndex >= i ? 'white' : 'var(--text-secondary)',
                  textShadow: !isUnknown && activeIndex >= i ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
                }}
              >
                {l.label}
              </span>
            </button>
          ))}
        </div>

        {/* Thumb indicator */}
        {!isUnknown && (
          <div
            className="absolute top-0.5 w-7 h-7 rounded-full border-2 border-white shadow-lg transition-all duration-200"
            style={{
              left: `calc(${((activeIndex + 0.5) / 3) * 100}% - 14px)`,
              backgroundColor: activeColor,
              boxShadow: `0 2px 8px ${activeColor}60`,
            }}
          />
        )}
      </div>

      {/* Clear to Unknown */}
      {!isUnknown && !disabled && (
        <button
          onClick={() => onChange('Unknown')}
          className="mt-1.5 text-[11px] font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Clear → Unknown
        </button>
      )}
    </div>
  )
}
