import React from 'react'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED FORM FIELD COMPONENTS (vertical label style)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const fieldInputStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  fontSize: '16px',
}

export function FieldHint({ text, required }: { text: string; required?: boolean }) {
  return (
    <p className="text-[11px] mt-0.5 px-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
      {required && <span className="text-purple-400 font-bold">Required · </span>}
      {text}
    </p>
  )
}

export function SectionLabel({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-4">
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      {optional && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          optional
        </span>
      )}
    </div>
  )
}

export function FieldTextInput({ label, value, onChange, placeholder, hint, required, type, icon }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; required?: boolean; type?: string; icon?: React.ReactNode }
) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
        {icon && <span className="inline-flex items-center gap-1.5">{icon} </span>}
        {label} {required && <span className="text-purple-400">*</span>}
      </label>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
        style={fieldInputStyle}
      />
      {hint && <FieldHint text={hint} required={required} />}
    </div>
  )
}

export function FieldTextArea({ label, value, onChange, placeholder, hint, icon }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; icon?: React.ReactNode }
) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
        {icon && <span className="inline-flex items-center gap-1.5">{icon} </span>}
        {label}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
        style={fieldInputStyle}
      />
      {hint && <FieldHint text={hint} />}
    </div>
  )
}

function deriveCurrencySymbol(): string {
  try {
    const currency = localStorage.getItem('currency') || 'USD'
    const parts = new Intl.NumberFormat(navigator.language || 'en-US', {
      style: 'currency', currency,
    }).formatToParts(0)
    return parts.find(p => p.type === 'currency')?.value ?? currency
  } catch {
    return '$'
  }
}

export function FieldCurrency({ label, value, onChange, hint }:
  { label: string; value: number; onChange: (v: number) => void; hint?: string }
) {
  const symbol = deriveCurrencySymbol()
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
        {label}
      </label>
      <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <span className="pl-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{symbol}</span>
        <input
          type="text"
          inputMode="decimal"
          value={value > 0 ? value.toLocaleString() : ''}
          onChange={e => {
            const raw = e.target.value.replace(/[^0-9.]/g, '')
            if (raw === '' || raw === '.') { onChange(0); return }
            const v = parseFloat(raw)
            // Clamp to 0 — negative rates/fees/deposits corrupt payment totals
            if (!isNaN(v)) onChange(Math.max(0, v))
          }}}
          placeholder="0"
          className="flex-1 px-2 py-2.5 text-sm outline-none bg-transparent"
          style={{ color: 'var(--text-primary)', fontSize: '16px' }}
        />
      </div>
      {hint && <FieldHint text={hint} />}
    </div>
  )
}

export function FieldSelect<T extends string>({ label, value, options, onChange, hint, displayFn, icon }:
  { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; hint?: string; displayFn?: (v: T) => string; icon?: React.ReactNode }
) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
        {icon && <span className="inline-flex items-center gap-1.5">{icon} </span>}
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
        style={fieldInputStyle}
      >
        {options.map(o => (
          <option key={o} value={o}>{displayFn ? displayFn(o) : o}</option>
        ))}
      </select>
      {hint && <FieldHint text={hint} />}
    </div>
  )
}

export function FieldToggle({ label, value, onChange, hint, disabled }:
  { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }
) {
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => !disabled && onChange(!value)}
        className="flex items-center justify-between w-full"
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
        <div
          className="w-10 h-6 rounded-full p-0.5 transition-colors"
          style={{ backgroundColor: value ? '#a855f7' : 'var(--border)' }}
        >
          <div
            className="w-5 h-5 rounded-full bg-white transition-transform"
            style={{ transform: value ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </div>
      </button>
      {hint && <FieldHint text={hint} />}
    </div>
  )
}

export function FieldDate({ label, value, onChange, hint, icon }:
  { label: string; value: string; onChange: (v: string) => void; hint?: string; icon?: React.ReactNode }
) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>
        {icon && <span className="inline-flex items-center gap-1.5">{icon} </span>}
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
        style={fieldInputStyle}
      />
      {hint && <FieldHint text={hint} />}
    </div>
  )
}

export function FieldDateTime({ label, value, onChange, hint }:
  { label: string; value: string; onChange: (v: string) => void; hint?: string }
) {
  return (
    <div className="mb-3">
      <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--text-primary)' }}>{label}</label>
      <input
        type="datetime-local"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
        style={fieldInputStyle}
      />
      {hint && <FieldHint text={hint} />}
    </div>
  )
}
