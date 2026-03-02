import { useState, useEffect } from 'react'
import { useScrollLock } from '../../hooks/useScrollLock'
import { startOfDay } from 'date-fns'
import { fmtShortDayDate } from '../../utils/dateFormat'
import { db, newId } from '../../db'
import { showToast } from '../../components/Toast'
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
  useScrollLock(true)
  const [selectedStatus, setSelectedStatus] = useState<AvailabilityStatus | null>(current?.status ?? null)
  const [startTime, setStartTime] = useState(current?.startTime ?? '10:00')
  const [endTime, setEndTime] = useState(current?.endTime ?? '22:00')
  const [notes, setNotes] = useState(current?.notes ?? '')
  const [saving, setSaving] = useState(false)

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  async function handleStatusTap(status: AvailabilityStatus) {
    if (saving) return

    // Toggle off if same status tapped
    if (selectedStatus === status) {
      setSaving(true)
      try {
        const dayStart = startOfDay(date)
        const existing = await db.availability.where('date').equals(dayStart).first()
        if (existing) await db.availability.delete(existing.id)
        onClose()
      } catch {
        showToast('Failed to clear availability', 'error')
      } finally {
        setSaving(false)
      }
      return
    }

    setSelectedStatus(status)
    // All statuses show Save button — user can add notes before saving
  }

  async function handleSave() {
    if (!selectedStatus || saving) return
    if (selectedStatus === 'Available' && startTime >= endTime) {
      showToast('Start time must be before end time', 'error')
      return
    }
    setSaving(true)
    try {
      const dayStart = startOfDay(date)
      const existing = await db.availability.where('date').equals(dayStart).first()

      const record: Partial<DayAvailability> = {
        status: selectedStatus,
        notes: notes.trim() || undefined,
      }

      if (selectedStatus === 'Available') {
        record.startTime = startTime
        record.endTime = endTime
        record.openSlots = undefined
      } else if (selectedStatus === 'Limited') {
        record.startTime = undefined
        record.endTime = undefined
        if (existing?.openSlots) record.openSlots = existing.openSlots
      } else {
        // Off / Busy
        record.startTime = undefined
        record.endTime = undefined
        record.openSlots = undefined
      }

      if (existing) {
        await db.availability.update(existing.id, record)
      } else {
        await db.availability.add({ id: newId(), date: dayStart, ...record } as DayAvailability)
      }
      onClose()
    } catch {
      showToast('Failed to save availability', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (saving) return
    setSaving(true)
    try {
      const dayStart = startOfDay(date)
      const existing = await db.availability.where('date').equals(dayStart).first()
      if (existing) await db.availability.delete(existing.id)
      onClose()
    } catch {
      showToast('Failed to clear availability', 'error')
    } finally {
      setSaving(false)
    }
  }

  const showTimePicker = selectedStatus === 'Available'
  const showOpenSlots = selectedStatus === 'Limited' && current?.openSlots && current.openSlots.length > 0
  const showSaveButton = !!selectedStatus

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg rounded-t-2xl overflow-y-auto"
        style={{
          backgroundColor: 'var(--bg-card)',
          maxHeight: '80vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 pb-8">
          {/* Drag handle */}
          <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: 'var(--border)' }} />

          <p className="text-sm font-bold mb-1 text-center" style={{ color: 'var(--text-primary)' }}>
            {fmtShortDayDate(date)}
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
                aria-pressed={selectedStatus === s.status}
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

          {/* Notes */}
          {selectedStatus && (
            <div className="mb-4">
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  fontSize: '16px',
                }}
              />
            </div>
          )}

          {/* Save button */}
          {showSaveButton && (
            <button
              type="button"
              onClick={handleSave}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white active:opacity-80 mb-2"
              style={{ backgroundColor: '#a855f7' }}
            >
              {selectedStatus === 'Available'
                ? `Save — ${formatTime12(startTime)} to ${formatTime12(endTime)}`
                : selectedStatus === 'Limited'
                ? 'Save as Limited'
                : selectedStatus === 'Off'
                ? 'Save as Day Off'
                : 'Save as Busy'
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
