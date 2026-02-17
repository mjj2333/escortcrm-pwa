import { useState } from 'react'
import { startOfDay, format } from 'date-fns'
import { db, newId } from '../../db'
import type { AvailabilityStatus, DayAvailability } from '../../types'
import { formatTime12 } from '../../utils/availability'

interface AvailabilityPickerProps {
  date: Date
  current?: DayAvailability
  onClose: () => void
}

const statuses: { status: AvailabilityStatus; color: string; label: string }[] = [
  { status: 'Available', color: '#22c55e', label: 'Available' },
  { status: 'Limited', color: '#f97316', label: 'Limited' },
  { status: 'Busy', color: '#ef4444', label: 'Busy' },
  { status: 'Off', color: '#6b7280', label: 'Day Off' },
]

export function AvailabilityPicker({ date, current, onClose }: AvailabilityPickerProps) {
  const [selectedStatus, setSelectedStatus] = useState<AvailabilityStatus | null>(current?.status ?? null)
  const [startTime, setStartTime] = useState(current?.startTime ?? '10:00')
  const [endTime, setEndTime] = useState(current?.endTime ?? '22:00')

  async function handleStatusTap(status: AvailabilityStatus) {
    setSelectedStatus(status)

    // Off / Busy: save immediately
    if (status === 'Off' || status === 'Busy') {
      const dayStart = startOfDay(date)
      const existing = await db.availability.where('date').equals(dayStart).first()

      // Toggle off if same status tapped
      if (existing?.status === status) {
        await db.availability.delete(existing.id)
        onClose()
        return
      }

      const record: Partial<DayAvailability> = {
        status,
        startTime: undefined,
        endTime: undefined,
        openSlots: undefined,
      }

      if (existing) {
        await db.availability.update(existing.id, record)
      } else {
        await db.availability.add({ id: newId(), date: dayStart, ...record } as DayAvailability)
      }
      onClose()
    }
    // Available / Limited: user configures then taps Save
  }

  async function handleSave() {
    if (!selectedStatus) return
    const dayStart = startOfDay(date)
    const existing = await db.availability.where('date').equals(dayStart).first()

    const record: Partial<DayAvailability> = {
      status: selectedStatus,
    }

    if (selectedStatus === 'Available') {
      record.startTime = startTime
      record.endTime = endTime
      record.openSlots = undefined
    } else if (selectedStatus === 'Limited') {
      record.startTime = undefined
      record.endTime = undefined
      if (existing?.openSlots) record.openSlots = existing.openSlots
    }

    if (existing) {
      await db.availability.update(existing.id, record)
    } else {
      await db.availability.add({ id: newId(), date: dayStart, ...record } as DayAvailability)
    }
    onClose()
  }

  async function handleClear() {
    const dayStart = startOfDay(date)
    const existing = await db.availability.where('date').equals(dayStart).first()
    if (existing) await db.availability.delete(existing.id)
    onClose()
  }

  const showTimePicker = selectedStatus === 'Available'
  const showOpenSlots = selectedStatus === 'Limited' && current?.openSlots && current.openSlots.length > 0
  const showSaveButton = selectedStatus === 'Available' || selectedStatus === 'Limited'

  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 9999 }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        style={{ zIndex: 0 }}
      />

      {/* Panel */}
      <div
        className="w-full max-w-lg rounded-t-2xl overflow-y-auto"
        style={{
          backgroundColor: 'var(--bg-card)',
          maxHeight: '80vh',
          position: 'relative',
          zIndex: 1,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 pb-8">
          {/* Drag handle */}
          <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: 'var(--border)' }} />

          <p className="text-sm font-bold mb-1 text-center" style={{ color: 'var(--text-primary)' }}>
            {format(date, 'EEEE, MMM d')}
          </p>
          <p className="text-xs mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            Tap a status below
          </p>

          {/* Status grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {statuses.map(s => (
              <button
                key={s.status}
                type="button"
                onClick={() => handleStatusTap(s.status)}
                className="flex items-center gap-3 p-3.5 rounded-xl border active:scale-[0.97] transition-transform"
                style={{
                  backgroundColor: selectedStatus === s.status
                    ? `${s.color}15`
                    : 'var(--bg-secondary)',
                  borderColor: selectedStatus === s.status
                    ? s.color
                    : 'var(--border)',
                  borderWidth: selectedStatus === s.status ? '2px' : '1px',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div
                  className="w-3.5 h-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {s.label}
                </span>
              </button>
            ))}
          </div>

          {/* TIME PICKER — shown when Available is selected */}
          {showTimePicker && (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                backgroundColor: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.25)',
              }}
            >
              <p className="text-xs font-bold mb-3" style={{ color: '#22c55e' }}>
                SET YOUR HOURS
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-[10px] uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>
                    From
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    step="1800"
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm font-medium"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      fontSize: '16px',
                    }}
                  />
                </div>
                <span className="text-sm font-medium mt-4" style={{ color: 'var(--text-secondary)' }}>→</span>
                <div className="flex-1">
                  <label className="text-[10px] uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Until
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    step="1800"
                    onChange={e => setEndTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm font-medium"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      fontSize: '16px',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Open slots for Limited */}
          {showOpenSlots && (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                backgroundColor: 'rgba(249,115,22,0.08)',
                border: '1px solid rgba(249,115,22,0.25)',
              }}
            >
              <p className="text-xs font-bold mb-2" style={{ color: '#f97316' }}>
                OPEN WINDOWS
              </p>
              <div className="space-y-1.5">
                {current!.openSlots!.map((slot, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f97316' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {formatTime12(slot.start)} – {formatTime12(slot.end)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] mt-2" style={{ color: 'var(--text-secondary)' }}>
                Auto-created from confirmed bookings
              </p>
            </div>
          )}

          {/* Save button for Available / Limited */}
          {showSaveButton && (
            <button
              type="button"
              onClick={handleSave}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80 mb-2"
              style={{ backgroundColor: '#a855f7' }}
            >
              {selectedStatus === 'Available'
                ? `Save — ${formatTime12(startTime)} to ${formatTime12(endTime)}`
                : 'Save as Limited'
              }
            </button>
          )}

          {/* Clear button */}
          {current && (
            <button
              type="button"
              onClick={handleClear}
              className="w-full py-2.5 text-sm text-center active:opacity-70"
              style={{ color: 'var(--text-secondary)' }}
            >
              Clear Status
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
