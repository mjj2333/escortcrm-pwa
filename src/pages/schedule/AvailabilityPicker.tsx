import { startOfDay } from 'date-fns'
import { db, newId } from '../../db'
import type { AvailabilityStatus } from '../../types'

interface AvailabilityPickerProps {
  date: Date
  currentStatus?: AvailabilityStatus
  onClose: () => void
}

const statuses: { status: AvailabilityStatus; color: string; label: string }[] = [
  { status: 'Available', color: '#22c55e', label: 'Available' },
  { status: 'Limited', color: '#f97316', label: 'Limited' },
  { status: 'Busy', color: '#ef4444', label: 'Busy' },
  { status: 'Off', color: '#6b7280', label: 'Day Off' },
]

export function AvailabilityPicker({ date, currentStatus, onClose }: AvailabilityPickerProps) {
  async function setStatus(status: AvailabilityStatus) {
    const dayStart = startOfDay(date)
    const existing = await db.availability.where('date').equals(dayStart).first()
    if (existing) {
      if (existing.status === status) {
        // Toggle off - remove
        await db.availability.delete(existing.id)
      } else {
        await db.availability.update(existing.id, { status })
      }
    } else {
      await db.availability.add({
        id: newId(),
        date: dayStart,
        status,
      })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-2xl p-4 pb-8"
        style={{ backgroundColor: 'var(--bg-card)' }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: 'var(--border)' }} />
        <p className="text-sm font-semibold mb-3 text-center" style={{ color: 'var(--text-primary)' }}>
          Set Availability
        </p>
        <div className="grid grid-cols-2 gap-2">
          {statuses.map(s => (
            <button
              key={s.status}
              onClick={() => setStatus(s.status)}
              className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${
                currentStatus === s.status ? 'ring-2 ring-purple-500' : ''
              }`}
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {s.label}
              </span>
            </button>
          ))}
        </div>
        {currentStatus && (
          <button
            onClick={async () => {
              const existing = await db.availability.where('date').equals(startOfDay(date)).first()
              if (existing) await db.availability.delete(existing.id)
              onClose()
            }}
            className="w-full mt-3 py-2 text-sm text-center"
            style={{ color: 'var(--text-secondary)' }}
          >
            Clear Status
          </button>
        )}
      </div>
    </div>
  )
}
