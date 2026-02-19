import { useState, useEffect, useCallback } from 'react'
import { Check, AlertTriangle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastData {
  id: number
  message: string
  type: ToastType
}

let toastId = 0
const listeners: Set<(t: ToastData) => void> = new Set()

export function showToast(message: string, type: ToastType = 'success') {
  const toast: ToastData = { id: ++toastId, message, type }
  listeners.forEach(fn => fn(toast))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const handleToast = useCallback((toast: ToastData) => {
    setToasts(prev => [...prev, toast])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id))
    }, 2200)
  }, [])

  useEffect(() => {
    listeners.add(handleToast)
    return () => { listeners.delete(handleToast) }
  }, [handleToast])

  if (toasts.length === 0) return null

  const iconFor = (type: ToastType) => {
    switch (type) {
      case 'success': return <Check size={16} />
      case 'error': return <AlertTriangle size={16} />
      case 'info': return <Info size={16} />
    }
  }

  const colorFor = (type: ToastType) => {
    switch (type) {
      case 'success': return { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.3)', text: '#22c55e' }
      case 'error': return { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.3)', text: '#ef4444' }
      case 'info': return { bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.3)', text: '#a855f7' }
    }
  }

  return (
    <div className="fixed top-14 left-0 right-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4">
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
            }}
          >
            {iconFor(toast.type)}
            {toast.message}
          </div>
        )
      })}
    </div>
  )
}
