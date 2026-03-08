import { useState, useEffect } from 'react'
import { Check, Clock, FileText, Phone, MessageSquare, StickyNote } from 'lucide-react'
import { format } from 'date-fns'
import { db, newId } from '../db'
import { Modal } from './Modal'
import { showToast } from './Toast'
import { SectionLabel, FieldDateTime, fieldInputStyle } from './FormFields'
import type { JournalEntry, JournalTag, JournalEntryType, Booking } from '../types'
import { journalTagColors } from '../types'

const ALL_TAGS: JournalTag[] = [
  'Regular', 'Great Chemistry', 'Respectful', 'Relaxed',
  'New Experience', 'Generous', 'Late', 'Rushed', 'Difficult', 'Boundary Issue',
]

const ACTIVITY_TYPES: { type: JournalEntryType; label: string; Icon: typeof Phone; color: string; bg: string }[] = [
  { type: 'call', label: 'Call', Icon: Phone, color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  { type: 'message', label: 'Message', Icon: MessageSquare, color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  { type: 'note', label: 'Note', Icon: StickyNote, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
]

interface JournalEntryEditorProps {
  isOpen: boolean
  onClose: () => void
  booking?: Booking
  clientId?: string
  clientAlias?: string
  existingEntry?: JournalEntry
  defaultEntryType?: JournalEntryType
}

export function JournalEntryEditor({ isOpen, onClose, booking, clientId, clientAlias, existingEntry, defaultEntryType }: JournalEntryEditorProps) {
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState<JournalTag[]>([])
  const [actualDuration, setActualDuration] = useState('')
  const [timingNotes, setTimingNotes] = useState('')
  const [entryType, setEntryType] = useState<JournalEntryType>(defaultEntryType ?? 'note')
  const [dateTime, setDateTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [saving, setSaving] = useState(false)

  const isSessionMode = !!booking

  useEffect(() => {
    if (isOpen) {
      setNotes(existingEntry?.notes ?? '')
      setTags(existingEntry?.tags ?? [])
      setActualDuration(existingEntry?.actualDuration ? String(existingEntry.actualDuration) : '')
      setTimingNotes(existingEntry?.timingNotes ?? '')
      setEntryType(existingEntry?.entryType ?? defaultEntryType ?? (booking ? 'session' : 'note'))
      setDateTime(existingEntry?.date
        ? format(new Date(existingEntry.date), "yyyy-MM-dd'T'HH:mm")
        : format(new Date(), "yyyy-MM-dd'T'HH:mm"))
    }
  }, [isOpen, existingEntry, booking, defaultEntryType])

  function toggleTag(tag: JournalTag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const hasContent = notes.trim().length > 0 || tags.length > 0 || actualDuration !== '' || timingNotes.trim().length > 0

  async function handleSave() {
    if (saving) return
    if (!existingEntry && !hasContent) { onClose(); return }
    const resolvedClientId = booking?.clientId ?? clientId
    if (!existingEntry && !resolvedClientId) {
      showToast('No client associated', 'error')
      return
    }
    setSaving(true)
    const now = new Date()
    try {
      if (existingEntry) {
        const updates: Partial<JournalEntry> = {
          notes: notes.trim(),
          updatedAt: now,
          entryType: isSessionMode ? 'session' : entryType,
        }
        if (isSessionMode) {
          updates.tags = tags
          updates.actualDuration = actualDuration ? parseInt(actualDuration) : undefined
          updates.timingNotes = timingNotes.trim() || undefined
        } else {
          updates.date = new Date(dateTime)
        }
        await db.journalEntries.update(existingEntry.id, updates)
        showToast('Entry updated')
      } else if (isSessionMode && booking) {
        const entry: JournalEntry = {
          id: newId(),
          bookingId: booking.id,
          clientId: resolvedClientId!,
          entryType: 'session',
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
      } else {
        const entry: JournalEntry = {
          id: newId(),
          clientId: resolvedClientId!,
          entryType,
          date: new Date(dateTime),
          notes: notes.trim(),
          tags: [],
          createdAt: now,
          updatedAt: now,
        }
        await db.journalEntries.add(entry)
        showToast('Activity logged')
      }
      onClose()
    } catch {
      showToast('Failed to save entry', 'error')
    } finally {
      setSaving(false)
    }
  }

  const notesPlaceholder = isSessionMode
    ? 'How did it go? Anything to remember for next time...'
    : entryType === 'call' ? 'What did you discuss?'
    : entryType === 'message' ? 'Message details...'
    : 'Add a note...'

  const modalTitle = existingEntry
    ? 'Edit Entry'
    : isSessionMode ? 'Session Notes' : 'Log Activity'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      actions={
        <button type="button" onClick={handleSave} disabled={saving} aria-label="Save entry" className="p-2 text-purple-500 disabled:opacity-50">
          <Check size={20} />
        </button>
      }
    >
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {isSessionMode && booking ? (
          <>
            {/* Context header */}
            <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl"
              style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}>
              <FileText size={14} className="text-purple-500 shrink-0" />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {clientAlias ?? 'Client'} — {booking.duration} min session
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {(booking.completedAt ? new Date(booking.completedAt) : new Date(booking.dateTime))
                    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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
                  <button type="button"
                    key={tag}
                    aria-pressed={selected}
                    onClick={() => toggleTag(tag)}
                    className="px-2.5 py-2 rounded-full text-[11px] font-semibold transition-all"
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
              placeholder={notesPlaceholder}
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
                    placeholder={String(booking.duration)}
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
          </>
        ) : (
          <>
            {/* Type selector */}
            <SectionLabel label="Type" />
            <div className="flex gap-2 mb-4">
              {ACTIVITY_TYPES.map(at => {
                const selected = entryType === at.type
                return (
                  <button type="button"
                    key={at.type}
                    
                    onClick={() => setEntryType(at.type)}
                    aria-pressed={selected}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: selected ? at.bg : 'var(--bg-primary)',
                      color: selected ? at.color : 'var(--text-secondary)',
                      border: `1px solid ${selected ? at.color + '40' : 'var(--border)'}`,
                    }}
                  >
                    <at.Icon size={14} />
                    {at.label}
                  </button>
                )
              })}
            </div>

            {/* Date/time */}
            <FieldDateTime label="Date & Time" value={dateTime} onChange={setDateTime} />

            {/* Notes */}
            <div className="mt-3">
              <SectionLabel label="Notes" />
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={notesPlaceholder}
                rows={4}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                style={{ ...fieldInputStyle, fontSize: '16px' }}
              />
            </div>
          </>
        )}

        {/* Save button */}
        <div className="py-4">
          <button type="button" onClick={handleSave} disabled={saving}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-purple-600 text-white active:bg-purple-700 disabled:opacity-50">
            {existingEntry ? 'Update Entry' : 'Save Entry'}
          </button>
          {!existingEntry && isSessionMode && (
            <button type="button" onClick={onClose}
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
