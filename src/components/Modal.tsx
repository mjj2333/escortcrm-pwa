import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  actions?: ReactNode
}

export function Modal({ isOpen, onClose, title, children, actions }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative mt-8 flex-1 flex flex-col rounded-t-2xl overflow-hidden animate-slide-up"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <button onClick={onClose} className="p-1" style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          <div className="w-7">
            {actions}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}

// Form field components
interface FormSectionProps {
  title: string
  children: ReactNode
  footer?: string
}

export function FormSection({ title, children, footer }: FormSectionProps) {
  return (
    <div className="px-4 py-3">
      <h3
        className="text-xs font-semibold uppercase tracking-wide mb-2"
        style={{ color: 'var(--text-secondary)' }}
      >
        {title}
      </h3>
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        {children}
      </div>
      {footer && (
        <p className="text-xs mt-1.5 px-1" style={{ color: 'var(--text-secondary)' }}>
          {footer}
        </p>
      )}
    </div>
  )
}

interface FormRowProps {
  label?: string
  children: ReactNode
  onClick?: () => void
}

export function FormRow({ label, children, onClick }: FormRowProps) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      className="flex items-center gap-3 px-4 py-3 w-full text-left"
      style={{ borderColor: 'var(--border)' }}
      onClick={onClick}
    >
      {label && (
        <span className="text-sm shrink-0" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
      )}
      <div className="flex-1 flex justify-end">{children}</div>
    </Wrapper>
  )
}

interface FormInputProps {
  label: React.ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  multiline?: boolean
}

export function FormInput({ label, value, onChange, placeholder, type = 'text', required, multiline }: FormInputProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderColor: 'var(--border)' }}>
      <span className="text-sm shrink-0" style={{ color: 'var(--text-primary)' }}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="flex-1 text-sm text-right bg-transparent outline-none resize-none"
          style={{ color: 'var(--text-primary)' }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-sm text-right bg-transparent outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
      )}
    </div>
  )
}

interface FormSelectProps<T extends string> {
  label: React.ReactNode
  value: T
  options: readonly T[]
  onChange: (value: T) => void
  displayFn?: (value: T) => string
}

export function FormSelect<T extends string>({ label, value, options, onChange, displayFn }: FormSelectProps<T>) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderColor: 'var(--border)' }}>
      <span className="text-sm shrink-0" style={{ color: 'var(--text-primary)' }}>
        {label}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="flex-1 text-sm text-right bg-transparent outline-none appearance-none cursor-pointer"
        style={{ color: 'var(--text-secondary)' }}
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{displayFn ? displayFn(opt) : opt}</option>
        ))}
      </select>
    </div>
  )
}

interface FormToggleProps {
  label: string
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

export function FormToggle({ label, value, onChange, disabled }: FormToggleProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderColor: 'var(--border)' }}>
      <span className="text-sm flex-1" style={{ color: disabled ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
        {label}
      </span>
      <button
        onClick={() => !disabled && onChange(!value)}
        className={`w-12 h-7 rounded-full transition-colors relative ${disabled ? 'opacity-50' : ''}`}
        style={{ backgroundColor: value ? '#a855f7' : 'var(--border)' }}
      >
        <div
          className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform"
          style={{ transform: value ? 'translateX(22px)' : 'translateX(2px)' }}
        />
      </button>
    </div>
  )
}

interface FormCurrencyProps {
  label: string
  value: number
  onChange: (value: number) => void
}

export function FormCurrency({ label, value, onChange }: FormCurrencyProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderColor: 'var(--border)' }}>
      <span className="text-sm shrink-0" style={{ color: 'var(--text-primary)' }}>
        {label}
      </span>
      <div className="flex-1 flex items-center justify-end gap-1">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>$</span>
        <input
          type="number"
          inputMode="decimal"
          value={value || ''}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          placeholder="0"
          className="w-24 text-sm text-right bg-transparent outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>
    </div>
  )
}
