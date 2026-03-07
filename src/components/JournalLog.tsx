import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Clock, Edit3, ChevronDown, ChevronUp, Phone, MessageSquare, StickyNote, Plus } from 'lucide-react'
import { fmtMediumDate } from '../utils/dateFormat'
import { db } from '../db'
import type { JournalEntry, JournalEntryType, Booking } from '../types'
import { journalTagColors } from '../types'

function entryIcon(type?: JournalEntryType) {
  switch (type) {
    case 'call': return { Icon: Phone, bg: 'rgba(59,130,246,0.12)', className: 'text-blue-500' }
    case 'message': return { Icon: MessageSquare, bg: 'rgba(34,197,94,0.12)', className: 'text-green-500' }
    case 'note': return { Icon: StickyNote, bg: 'rgba(245,158,11,0.12)', className: 'text-amber-500' }
    default: return { Icon: FileText, bg: 'rgba(168,85,247,0.12)', className: 'text-purple-500' }
  }
}

function entryTypeLabel(type?: JournalEntryType) {
  switch (type) {
    case 'call': return 'Call'
    case 'message': return 'Message'
    case 'note': return 'Note'
    default: return 'Session'
  }
}

interface JournalLogProps {
  clientId: string
  onEditEntry: (entry: JournalEntry, booking?: Booking) => void
  onAddNew?: () => void
}

export function JournalLog({ clientId, onEditEntry, onAddNew }: JournalLogProps) {
  const entries = useLiveQuery(
    () => db.journalEntries.where('clientId').equals(clientId).reverse().sortBy('date'),
    [clientId]
  ) ?? []

  const bookings = useLiveQuery(
    () => db.bookings.where('clientId').equals(clientId).toArray(),
    [clientId]
  ) ?? []

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const bookingMap = new Map(bookings.map(b => [b.id, b]))

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>
          Activity {entries.length > 0 && `(${entries.length})`}
        </p>
        {onAddNew && (
          <button type="button"
            onClick={onAddNew}
            className="flex items-center gap-1 text-xs font-medium text-purple-500 active:opacity-70"
          >
            <Plus size={12} /> Add
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          No activity logged yet.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => {
            const isSession = !entry.entryType || entry.entryType === 'session'
            const booking = entry.bookingId ? bookingMap.get(entry.bookingId) : undefined
            const isExpanded = expanded.has(entry.id)
            const { Icon, bg, className: iconClass } = entryIcon(entry.entryType)

            return (
              <div key={entry.id} className="rounded-xl overflow-hidden"
                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>

                {/* Header — always visible */}
                <button type="button"
                  onClick={() => toggleExpand(entry.id)}
                  className="w-full flex items-start gap-3 px-3 py-2.5 text-left active:opacity-70"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: bg }}>
                    <Icon size={14} className={iconClass} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {fmtMediumDate(new Date(entry.date))}
                        </p>
                        {!isSession && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: bg, color: entry.entryType === 'call' ? '#3b82f6' : entry.entryType === 'message' ? '#22c55e' : '#f59e0b' }}>
                            {entryTypeLabel(entry.entryType)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isSession && entry.actualDuration && (
                          <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--text-secondary)' }}>
                            <Clock size={9} />{entry.actualDuration}m
                          </span>
                        )}
                        {isExpanded ? <ChevronUp size={12} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={12} style={{ color: 'var(--text-secondary)' }} />}
                      </div>
                    </div>

                    {/* Tags row (sessions only) */}
                    {isSession && entry.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {entry.tags.map(tag => {
                          const colors = journalTagColors[tag]
                          return (
                            <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: colors.bg, color: colors.fg }}>
                              {tag}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* Preview (collapsed) */}
                    {!isExpanded && entry.notes && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                        {entry.notes}
                      </p>
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-3" style={{ borderTop: '1px solid var(--border)' }}>
                    {entry.notes && (
                      <p className="text-sm leading-relaxed mt-2.5 whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                        {entry.notes}
                      </p>
                    )}

                    {/* Timing details (sessions only) */}
                    {isSession && (entry.actualDuration || entry.timingNotes) && (
                      <div className="flex items-center gap-3 mt-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {entry.actualDuration && booking && (
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {entry.actualDuration}m
                            {entry.actualDuration !== booking.duration && (
                              <span style={{ color: entry.actualDuration > booking.duration ? '#f97316' : '#22c55e' }}>
                                ({entry.actualDuration > booking.duration ? '+' : ''}{entry.actualDuration - booking.duration}m)
                              </span>
                            )}
                          </span>
                        )}
                        {entry.timingNotes && (
                          <span>· {entry.timingNotes}</span>
                        )}
                      </div>
                    )}

                    {/* Edit button */}
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); onEditEntry(entry, booking) }}
                      className="flex items-center gap-1.5 mt-3 text-xs font-medium text-purple-500 active:opacity-70"
                    >
                      <Edit3 size={11} /> Edit Entry
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
