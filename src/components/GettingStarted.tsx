import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle, Circle, ChevronRight, Rocket, X } from 'lucide-react'
import { db } from '../db'
import { useLocalStorage } from '../hooks/useSettings'

interface GettingStartedProps {
  onOpenProfile: () => void
  onOpenSettings: () => void
  onNavigateTab: (tab: number) => void
}

interface ChecklistItem {
  label: string
  done: boolean
  action: () => void
}

export function GettingStarted({ onOpenProfile, onOpenSettings, onNavigateTab }: GettingStartedProps) {
  const [dismissed, setDismissed] = useLocalStorage('gettingStartedDismissed', false)
  const [profileDone] = useLocalStorage('profileSetupDone', false)
  const [pinEnabled] = useLocalStorage('pinEnabled', false)

  const clientCount = useLiveQuery(() => db.clients.count()) ?? 0
  const bookingCount = useLiveQuery(() => db.bookings.count()) ?? 0
  const availCount = useLiveQuery(() => db.availability.count()) ?? 0
  const contactCount = useLiveQuery(() => db.safetyContacts.count()) ?? 0

  const items: ChecklistItem[] = [
    { label: 'Set up your profile', done: profileDone, action: onOpenProfile },
    { label: 'Add your first client', done: clientCount > 0, action: () => onNavigateTab(2) },
    { label: 'Create a booking', done: bookingCount > 0, action: () => onNavigateTab(1) },
    { label: 'Set your availability', done: availCount > 0, action: () => onNavigateTab(1) },
    { label: 'Add a safety contact', done: contactCount > 0, action: () => onNavigateTab(4) },
    { label: 'Enable PIN lock', done: pinEnabled, action: onOpenSettings },
  ]

  const completed = items.filter(i => i.done).length
  const allDone = completed === items.length

  if (dismissed || allDone) return null

  const progress = completed / items.length

  return (
    <div
      className="mx-4 mt-3 rounded-2xl p-4"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Rocket size={18} className="text-purple-500" />
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Getting Started</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7' }}
          >
            {completed} of {items.length}
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="p-0.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ backgroundColor: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress * 100}%`, backgroundColor: '#a855f7' }}
        />
      </div>

      {/* Items */}
      <div className="space-y-0.5">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={item.done ? undefined : item.action}
            disabled={item.done}
            className="flex items-center gap-3 w-full py-2 px-1 rounded-lg text-left transition-colors"
            style={{ opacity: item.done ? 0.5 : 1 }}
          >
            {item.done ? (
              <CheckCircle size={18} className="text-green-500 shrink-0" />
            ) : (
              <Circle size={18} className="shrink-0" style={{ color: 'var(--border)' }} />
            )}
            <span
              className="flex-1 text-sm"
              style={{
                color: item.done ? 'var(--text-secondary)' : 'var(--text-primary)',
                textDecoration: item.done ? 'line-through' : 'none',
              }}
            >
              {item.label}
            </span>
            {!item.done && (
              <ChevronRight size={14} className="text-purple-500 shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Check if the Getting Started card should be hidden */
export function useGettingStartedDone() {
  const [dismissed] = useLocalStorage('gettingStartedDismissed', false)
  const [profileDone] = useLocalStorage('profileSetupDone', false)
  const [pinEnabled] = useLocalStorage('pinEnabled', false)

  const clientCount = useLiveQuery(() => db.clients.count()) ?? 0
  const bookingCount = useLiveQuery(() => db.bookings.count()) ?? 0
  const availCount = useLiveQuery(() => db.availability.count()) ?? 0
  const contactCount = useLiveQuery(() => db.safetyContacts.count()) ?? 0

  if (dismissed) return true
  return profileDone && clientCount > 0 && bookingCount > 0 && availCount > 0 && contactCount > 0 && pinEnabled
}
