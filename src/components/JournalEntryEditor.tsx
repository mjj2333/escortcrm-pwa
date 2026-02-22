import { useState, useEffect } from 'react'
import { Check, Clock, FileText } from 'lucide-react'
import { db, newId } from '../db'
import { Modal } from './Modal'
import { showToast } from './Toast'
import { SectionLabel, fieldInputStyle } from './FormFields'
import type { JournalEntry, JournalTag, Booking } from '../types'
import { journalTagColors } from '../types'

const ALL_TAGS: JournalTag[] = [
  'Regular', 'Great Chemistry', 'Respectful', 'Relaxed',
  'New Experience', 'Generous', 'Late', 'Rushed', 'Difficult', 'Boundary Issue',
]

interface JournalEntryEditorProps {
  isOpen: boolean
  onClose: () => void
  booking: Booking
  clientAlias?: string
  existingEntry?: JournalEntry
}

export function JournalEntryEditor({ isOpen, onClose, booking, clientAlias, existingEntry }: JournalEntryEditorProps) {
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState<JournalTag[]>([])
  const [actualDuration, setActualDuration] = useState('')
  const [timingNotes, setTimingNotes] = useState('')

  useEffect(() => {
    if (isOpen) {
      setNotes(existingEntry?.notes ?? '')
      setTags(existingEntry?.tags ?? [])
      setActualDuration(existingEntry?.actualDuration ? String(existingEntry.actualDuration) : '')
      setTimingNotes(existingEntry?.timingNotes ?? '')
    }
  }, [isOpen, existingEntry])

  function toggleTag(tag: JournalTag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  async function handleSave() {
    const now = new Date()
    if (existingEntry) {
      await db.journalEntries.update(existingEntry.id, {
        notes: notes.trim(),
        tags,
        actualDuration: actualDuration ? parseInt(actualDuration) : undefined,
        timingNotes: timingNotes.trim() || undefined,
        updatedAt: now,
      })
      showToast('Journal updated')
    } else {
      const entry: JournalEntry = {
        id: newId(),
        bookingId: booking.id,
        clientId: booking.clientId ?? '',
        date: booking.completedAt ?? booking.dateTime,
        notes: notes.trim(),
        tags,
        actualDuration: actualDuration ? parseInt(actualDuration) : undefined,
        timingNotes: timingNotes.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      }
      await db.journalEntries.add(entry)
      showToast('Journal entry saved')
    }
    onClose()
  }

  const scheduledDuration = booking.duration

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existingEntry ? 'Edit Journal' : 'Session Notes'}
      actions={
        <button onClick={handleSave} className="p-1 text-purple-500">
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Context header */}
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}>
          <FileText size={14} className="text-purple-500 shrink-0" />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {clientAlias ?? 'Client'} — {scheduledDuration} min session
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {booking.completedAt
                ? new Date(booking.completedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : new Date(booking.dateTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              }
            </p>
          </div>
        </div>

        {/* Quick Tags */}
        <SectionLabel label="Quick Tags" />
        <div className="flex flex-wrap gap-1.5 mb-4">
          {ALL_TAGS.map(tag => {
            const selected = tags.includes(tag)
            const colors = journalTagColors[tag]
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all"
                style={{
                  backgroundColor: selected ? colors.bg : 'transparent',
                  color: selected ? colors.fg : 'var(--text-secondary)',
                  border: `1px solid ${selected ? colors.fg + '40' : 'var(--border)'}`,
                  opacity: selected ? 1 : 0.7,
                }}
              >
                {tag}
              </button>
            )
          })}
        </div>

        {/* Notes */}
        <SectionLabel label="Session Notes" />
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="How did it go? Anything to remember for next time..."
          rows={5}
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none mb-4"
          style={{ ...fieldInputStyle, fontSize: '16px' }}
        />

        {/* Timing */}
        <SectionLabel label="Timing" optional />
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
              <Clock size={10} className="inline mr-1" />Actual Duration
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="numeric"
                value={actualDuration}
                onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); setActualDuration(v) }}
                placeholder={String(scheduledDuration)}
                className="w-20 px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ ...fieldInputStyle, fontSize: '16px' }}
              />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>min</span>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>Timing Notes</label>
            <input
              type="text"
              value={timingNotes}
              onChange={e => setTimingNotes(e.target.value)}
              placeholder="e.g. arrived early"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ ...fieldInputStyle, fontSize: '16px' }}
            />
          </div>
        </div>

        {/* Save button */}
        <div className="py-4">
          <button onClick={handleSave}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-purple-600 text-white active:bg-purple-700">
            {existingEntry ? 'Update Entry' : 'Save Entry'}
          </button>
          {!existingEntry && (
            <button onClick={onClose}
              className="w-full py-2 mt-2 rounded-xl text-sm font-medium"
              style={{ color: 'var(--text-secondary)' }}>
              Skip for Now
            </button>
          )}
        </div>
        <div className="h-4" />
      </div>
    </Modal>
  )
}
