interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmColor?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  isOpen, title, message, confirmLabel = 'Confirm', confirmColor = '#ef4444', onConfirm, onCancel
}: ConfirmDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div
        className="relative w-full max-w-xs rounded-2xl p-5 text-center"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <h3 className="font-bold text-base mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
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
