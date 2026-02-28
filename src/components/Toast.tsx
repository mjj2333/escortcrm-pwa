import { useState, useEffect, useCallback, useRef } from 'react'
import { Check, AlertTriangle, Info, RotateCcw } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'undo'

interface ToastData {
  id: number
  message: string
  type: ToastType
  onUndo?: () => void
}

let toastId = 0
const listeners: Set<(t: ToastData) => void> = new Set()

export function showToast(message: string, type: ToastType = 'success') {
  const toast: ToastData = { id: ++toastId, message, type }
  listeners.forEach(fn => fn(toast))
}

// Shows a toast with an Undo button. onUndo is called if the user taps it within 5s.
export function showUndoToast(message: string, onUndo: () => void) {
  const toast: ToastData = { id: ++toastId, message, type: 'undo', onUndo }
  listeners.forEach(fn => fn(toast))
}

const DURATION: Record<ToastType, number> = {
  success: 2200,
  error: 2200,
  info: 2200,
  undo: 5000,
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const handleToast = useCallback((toast: ToastData) => {
    setToasts(prev => [...prev, toast])
    const timer = setTimeout(() => { timers.current.delete(toast.id); dismiss(toast.id) }, DURATION[toast.type])
    timers.current.set(toast.id, timer)
  }, [dismiss])

  useEffect(() => {
    listeners.add(handleToast)
    return () => { listeners.delete(handleToast) }
  }, [handleToast])

  if (toasts.length === 0) return null

  const iconFor = (type: ToastType) => {
    switch (type) {
      case 'success': return <Check size={16} />
      case 'error':   return <AlertTriangle size={16} />
      case 'info':    return <Info size={16} />
      case 'undo':    return <Check size={16} />
    }
  }

  const colorFor = (type: ToastType) => {
    switch (type) {
      case 'success': return { bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.3)',  text: '#22c55e' }
      case 'error':   return { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.3)',  text: '#ef4444' }
      case 'info':    return { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#a855f7' }
      case 'undo':    return { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.3)',  text: '#ef4444' }
    }
  }

  return (
    <div className="fixed top-14 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4"
         style={{ pointerEvents: 'none' }}>
      {toasts.map(toast => {
        const c = colorFor(toast.type)
        return (
          <div
            key={toast.id}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl backdrop-blur-xl text-sm font-medium shadow-lg animate-toast-in max-w-sm w-full"
            style={{
              backgroundColor: c.bg,
              border: `1px solid ${c.border}`,
              color: c.text,
              pointerEvents: toast.type === 'undo' ? 'auto' : 'none',
            }}
          >
            {iconFor(toast.type)}
            <span className="flex-1">{toast.message}</span>
            {toast.type === 'undo' && toast.onUndo && (
              <button
                onClick={() => {
                  toast.onUndo!()
                  dismiss(toast.id)
                }}
                className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ml-1 active:opacity-70"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.2)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#ef4444',
                }}
              >
                <RotateCcw size={11} />
                Undo
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
