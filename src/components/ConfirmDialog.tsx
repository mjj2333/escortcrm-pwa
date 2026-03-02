import { useState, useEffect, useRef, useId } from 'react'
import { useScrollLock } from '../hooks/useScrollLock'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmColor?: string
  onConfirm: (inputValue?: string) => void
  onCancel: () => void
  /** If set, shows a text input field in the dialog */
  inputPlaceholder?: string
}

export function ConfirmDialog({
  isOpen, title, message, confirmLabel = 'Confirm', confirmColor = '#ef4444', onConfirm, onCancel, inputPlaceholder
}: ConfirmDialogProps) {
  useScrollLock(isOpen)
  const [inputValue, setInputValue] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (isOpen) setInputValue('')
  }, [isOpen])

  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  // Focus management and keyboard handling
  useEffect(() => {
    if (!isOpen) return
    previousFocusRef.current = document.activeElement as HTMLElement | null

    // Focus first interactive element
    requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>('input, button')
      first?.focus()
    })

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancelRef.current()
        return
      }
      // Focus trap
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])')
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative w-full max-w-xs rounded-2xl p-5 text-center"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <h3 id={titleId} className="font-bold text-base mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{message}</p>
        {inputPlaceholder && (
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={inputPlaceholder}
            className="w-full text-sm p-2.5 rounded-lg outline-none mb-4"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
            autoFocus
          />
        )}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(inputPlaceholder ? inputValue : undefined)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: confirmColor }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
