import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Clock, Edit3, ChevronDown, ChevronUp } from 'lucide-react'
import { format } from 'date-fns'
import { db } from '../db'
import type { JournalEntry, Booking } from '../types'
import { journalTagColors } from '../types'

interface JournalLogProps {
  clientId: string
  onEditEntry: (entry: JournalEntry, booking: Booking) => void
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
      <p className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-secondary)' }}>
        Session Journal {entries.length > 0 && `(${entries.length})`}
      </p>

      {entries.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          No session notes yet. Journal entries are created when bookings are completed.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => {
            const booking = bookingMap.get(entry.bookingId)
            const isExpanded = expanded.has(entry.id)

            return (
              <div key={entry.id} className="rounded-xl overflow-hidden"
                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}>

                {/* Header — always visible */}
                <button
                  onClick={() => toggleExpand(entry.id)}
                  className="w-full flex items-start gap-3 px-3 py-2.5 text-left active:opacity-70"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: 'rgba(168,85,247,0.12)' }}>
                    <FileText size={14} className="text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {format(new Date(entry.date), 'MMM d, yyyy')}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {entry.actualDuration && (
                          <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--text-secondary)' }}>
                            <Clock size={9} />{entry.actualDuration}m
                          </span>
                        )}
                        {isExpanded ? <ChevronUp size={12} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={12} style={{ color: 'var(--text-secondary)' }} />}
                      </div>
                    </div>

                    {/* Tags row */}
                    {entry.tags.length > 0 && (
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

                    {/* Timing details */}
                    {(entry.actualDuration || entry.timingNotes) && (
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
                    {booking && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onEditEntry(entry, booking) }}
                        className="flex items-center gap-1.5 mt-3 text-xs font-medium text-purple-500 active:opacity-70"
                      >
                        <Edit3 size={11} /> Edit Entry
                      </button>
                    )}
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
