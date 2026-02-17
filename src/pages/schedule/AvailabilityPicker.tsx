import { useState } from 'react'
import { startOfDay, format } from 'date-fns'
import { Clock } from 'lucide-react'
import { db, newId } from '../../db'
import type { AvailabilityStatus, DayAvailability } from '../../types'
import { generateTimeOptions, formatTime12 } from '../../utils/availability'

interface AvailabilityPickerProps {
  date: Date
  current?: DayAvailability
  onClose: () => void
}

const statuses: { status: AvailabilityStatus; color: string; label: string; desc: string }[] = [
  { status: 'Available', color: '#22c55e', label: 'Available', desc: 'Open for bookings' },
  { status: 'Limited', color: '#f97316', label: 'Limited', desc: 'Selective availability' },
  { status: 'Busy', color: '#ef4444', label: 'Busy', desc: 'Fully booked / blocked' },
  { status: 'Off', color: '#6b7280', label: 'Day Off', desc: 'Not working' },
]

const timeOptions = generateTimeOptions()

export function AvailabilityPicker({ date, current, onClose }: AvailabilityPickerProps) {
  const [selectedStatus, setSelectedStatus] = useState<AvailabilityStatus | null>(current?.status ?? null)
  const [startTime, setStartTime] = useState(current?.startTime ?? '10:00')
  const [endTime, setEndTime] = useState(current?.endTime ?? '22:00')
  const [notes, setNotes] = useState(current?.notes ?? '')

  async function handleSave() {
    if (!selectedStatus) return

    const dayStart = startOfDay(date)
    const existing = await db.availability.where('date').equals(dayStart).first()

    const record: Partial<DayAvailability> = {
      status: selectedStatus,
      notes: notes.trim() || undefined,
    }

    // Set time range for Available
    if (selectedStatus === 'Available') {
      record.startTime = startTime
      record.endTime = endTime
      record.openSlots = undefined
    }

    // Keep existing open slots when switching to Limited
    if (selectedStatus === 'Limited') {
      record.startTime = undefined
      record.endTime = undefined
      if (existing?.openSlots) {
        record.openSlots = existing.openSlots
      }
    }

    // Clear time data for Off/Busy
    if (selectedStatus === 'Off' || selectedStatus === 'Busy') {
      record.startTime = undefined
      record.endTime = undefined
      record.openSlots = undefined
    }

    if (existing) {
      await db.availability.update(existing.id, record)
    } else {
      await db.availability.add({
        id: newId(),
        date: dayStart,
        ...record,
      } as DayAvailability)
    }
    onClose()
  }

  async function handleClear() {
    const dayStart = startOfDay(date)
    const existing = await db.availability.where('date').equals(dayStart).first()
    if (existing) await db.availability.delete(existing.id)
    onClose()
  }

  const hasOpenSlots = current?.openSlots && current.openSlots.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-2xl p-4 pb-8 overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-card)', maxHeight: '85vh' }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: 'var(--border)' }} />
        <p className="text-sm font-semibold mb-1 text-center" style={{ color: 'var(--text-primary)' }}>
          {format(date, 'EEEE, MMM d')}
        </p>
        <p className="text-xs mb-4 text-center" style={{ color: 'var(--text-secondary)' }}>
          Set your availability
        </p>

        {/* Status buttons */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {statuses.map(s => (
            <button
              key={s.status}
              onClick={() => setSelectedStatus(s.status)}
              className={`flex items-center gap-2.5 p-3 rounded-xl border transition-colors ${
                selectedStatus === s.status ? 'ring-2 ring-purple-500' : ''
              }`}
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <div className="text-left">
                <span className="text-sm font-medium block" style={{ color: 'var(--text-primary)' }}>
                  {s.label}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  {s.desc}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Time range for Available */}
        {selectedStatus === 'Available' && (
          <div
            className="rounded-xl p-3 mb-4 border"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} style={{ color: 'var(--text-secondary)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                Working Hours
              </span>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="flex-1 text-sm rounded-lg px-3 py-2 outline-none appearance-none"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
              >
                {timeOptions.map(t => (
                  <option key={t} value={t}>{formatTime12(t)}</option>
                ))}
              </select>
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>to</span>
              <select
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="flex-1 text-sm rounded-lg px-3 py-2 outline-none appearance-none"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
              >
                {timeOptions.map(t => (
                  <option key={t} value={t}>{formatTime12(t)}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Open slots display for Limited */}
        {selectedStatus === 'Limited' && hasOpenSlots && (
          <div
            className="rounded-xl p-3 mb-4 border"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <span className="text-xs font-semibold block mb-2" style={{ color: 'var(--text-secondary)' }}>
              Open Windows
            </span>
            <div className="space-y-1.5">
              {current!.openSlots!.map((slot, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-primary)' }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f97316' }} />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {formatTime12(slot.start)} – {formatTime12(slot.end)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'var(--text-secondary)' }}>
              These windows were created from confirmed bookings
            </p>
          </div>
        )}

        {/* Notes */}
        <input
          type="text"
          placeholder="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full text-sm rounded-xl px-4 py-3 mb-4 outline-none"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        />

        {/* Actions */}
        <button
          onClick={handleSave}
          disabled={!selectedStatus}
          className={`w-full py-3 rounded-xl font-semibold text-sm text-white mb-2 ${
            selectedStatus ? 'bg-purple-600 active:bg-purple-700' : 'bg-purple-600 opacity-40'
          }`}
        >
          Save
        </button>
        {current && (
          <button
            onClick={handleClear}
            className="w-full py-2 text-sm text-center"
            style={{ color: 'var(--text-secondary)' }}
          >
            Clear Status
          </button>
        )}
      </div>
    </div>
  )
}
