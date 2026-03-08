import { useState, useRef, useCallback, useMemo } from 'react'
import { Upload, Check, AlertCircle, User, ChevronDown, Clock } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format } from 'date-fns'
import { Modal } from './Modal'
import { showToast } from './Toast'
import { db, createBooking } from '../db'
import { parseICS, extractClientName, matchClients, type ParsedEvent } from '../utils/icsImport'
import type { Booking, Client } from '../types'

interface IcsImportSheetProps {
  isOpen: boolean
  onClose: () => void
}

interface ImportRow {
  event: ParsedEvent
  clientId: string
  clientMatches: string[] // candidate IDs
  baseRate: number
  duration: number
  include: boolean
  overlap: Booking | null // existing booking that overlaps this slot
}

/** Check if two time ranges overlap */
function timesOverlap(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart
}

export function IcsImportSheet({ isOpen, onClose }: IcsImportSheetProps) {
  const [step, setStep] = useState<'select' | 'preview'>('select')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const clients = useLiveQuery(
    () => db.clients.filter(c => !c.isBlocked).toArray(),
    [],
  ) ?? []

  const rates = useLiveQuery(
    () => db.serviceRates.filter(r => r.isActive).sortBy('sortOrder'),
    [],
  ) ?? []

  // Load existing bookings for overlap detection (non-terminal only)
  const existingBookings = useLiveQuery(
    () => db.bookings
      .filter(b => b.status !== 'Cancelled' && b.status !== 'No Show')
      .toArray(),
    [],
  ) ?? []

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>()
    for (const c of clients) map.set(c.id, c)
    return map
  }, [clients])

  // Reset when opened
  const handleClose = useCallback(() => {
    setStep('select')
    setRows([])
    setImporting(false)
    setExpandedRow(null)
    onClose()
  }, [onClose])

  function matchRate(durationMin: number): number {
    const exact = rates.find(r => r.duration === durationMin)
    if (exact) return exact.rate
    const close = rates
      .filter(r => Math.abs(r.duration - durationMin) <= 15)
      .sort((a, b) => Math.abs(a.duration - durationMin) - Math.abs(b.duration - durationMin))
    if (close.length > 0) return close[0].rate
    return 0
  }

  function findOverlap(event: ParsedEvent): Booking | null {
    const evStart = event.start.getTime()
    const evEnd = evStart + event.durationMin * 60000
    for (const b of existingBookings) {
      const bStart = new Date(b.dateTime).getTime()
      const bEnd = bStart + b.duration * 60000
      if (timesOverlap(evStart, evEnd, bStart, bEnd)) return b
    }
    return null
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const events = parseICS(text)

      if (events.length === 0) {
        showToast('No events found in this file')
        return
      }

      const clientList = clients.map(c => ({ id: c.id, alias: c.alias }))

      const importRows: ImportRow[] = events.map(ev => {
        const name = extractClientName(ev.summary)
        const matches = matchClients(name, clientList)
        const rate = matchRate(ev.durationMin)
        const overlap = findOverlap(ev)

        return {
          event: ev,
          clientId: matches.length === 1 ? matches[0] : '',
          clientMatches: matches,
          baseRate: rate,
          duration: ev.durationMin,
          include: !overlap, // auto-uncheck overlapping events
          overlap,
        }
      })

      // Sort by start date
      importRows.sort((a, b) => a.event.start.getTime() - b.event.start.getTime())

      setRows(importRows)
      setStep('preview')
    }
    reader.onerror = () => {
      showToast('Failed to read file')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function toggleInclude(idx: number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, include: !r.include } : r))
  }

  function setClient(idx: number, clientId: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, clientId } : r))
    setExpandedRow(null)
  }

  const includedCount = rows.filter(r => r.include).length
  const overlapCount = rows.filter(r => r.overlap).length

  async function handleImport() {
    if (importing || includedCount === 0) return
    setImporting(true)
    try {
      const toImport = rows.filter(r => r.include)
      const bookings = toImport.map(r =>
        createBooking({
          clientId: r.clientId || undefined,
          dateTime: r.event.start,
          duration: r.duration,
          baseRate: r.baseRate,
          notes: [r.event.description, r.event.location].filter(Boolean).join('\n'),
          status: 'To Be Confirmed',
        })
      )
      await db.bookings.bulkAdd(bookings)
      showToast(`Imported ${bookings.length} booking${bookings.length !== 1 ? 's' : ''}`)
      handleClose()
    } catch (err) {
      showToast(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setImporting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Calendar"
      actions={
        step === 'preview' ? (
          <button type="button"
            onClick={handleImport}
            disabled={importing || includedCount === 0}
            className={`p-2 ${includedCount > 0 && !importing ? 'text-purple-500' : 'opacity-30'}`}
            aria-label="Import bookings"
          >
            <Check size={20} />
          </button>
        ) : undefined
      }
    >
      <div className="px-4 py-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {step === 'select' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(168,85,247,0.12)' }}
            >
              <Upload size={28} className="text-purple-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Import .ics Calendar File
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                From Google Calendar, Outlook, Apple Calendar, etc.
              </p>
            </div>
            <button type="button"
              onClick={() => fileRef.current?.click()}
              className="px-6 py-2.5 rounded-xl font-semibold text-sm bg-purple-600 text-white active:bg-purple-700"
            >
              Choose File
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".ics,text/calendar"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        )}

        {step === 'preview' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {rows.length} event{rows.length !== 1 ? 's' : ''} found
                  {includedCount < rows.length && ` · ${includedCount} selected`}
                </p>
                {overlapCount > 0 && (
                  <p className="text-[10px] mt-0.5" style={{ color: '#f97316' }}>
                    {overlapCount} overlap{overlapCount !== 1 ? '' : 's'} with existing bookings
                  </p>
                )}
              </div>
              <button type="button"
                onClick={() => { setStep('select'); setRows([]) }}
                className="text-xs text-purple-500 font-medium"
              >
                Change file
              </button>
            </div>

            <div className="space-y-2">
              {rows.map((row, idx) => {
                const client = row.clientId ? clientMap.get(row.clientId) : null
                const hasMultiple = row.clientMatches.length > 1
                const isExpanded = expandedRow === idx
                const overlapClient = row.overlap?.clientId
                  ? clientMap.get(row.overlap.clientId)
                  : null

                return (
                  <div
                    key={row.event.uid}
                    className="rounded-xl overflow-hidden"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      border: `1px solid ${row.overlap ? 'rgba(249,115,22,0.4)' : 'var(--border)'}`,
                      opacity: row.include ? 1 : 0.45,
                    }}
                  >
                    <div className="flex items-start gap-3 p-3">
                      {/* Include checkbox */}
                      <button type="button"
                        onClick={() => toggleInclude(idx)}
                        className="mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0"
                        style={{
                          borderColor: row.include ? '#a855f7' : 'var(--border)',
                          backgroundColor: row.include ? '#a855f7' : 'transparent',
                        }}
                        aria-label={row.include ? 'Exclude from import' : 'Include in import'}
                      >
                        {row.include && <Check size={12} className="text-white" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        {/* Event summary / date */}
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {row.event.summary || 'Untitled Event'}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {format(row.event.start, 'MMM d, yyyy · h:mm a')} · {row.duration} min
                        </p>
                        {row.event.location && (
                          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {row.event.location}
                          </p>
                        )}

                        {/* Overlap warning */}
                        {row.overlap && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Clock size={10} color="#f97316" />
                            <span className="text-[10px] font-medium" style={{ color: '#f97316' }}>
                              Overlaps with {overlapClient?.alias ?? 'existing booking'}
                            </span>
                          </div>
                        )}

                        {/* Client match */}
                        <div className="mt-2">
                          {client ? (
                            <button type="button"
                              onClick={() => setExpandedRow(isExpanded ? null : idx)}
                              className="flex items-center gap-1.5 text-xs font-medium"
                              style={{ color: '#22c55e' }}
                            >
                              <User size={12} />
                              {client.alias}
                              <ChevronDown size={10} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          ) : hasMultiple ? (
                            <button type="button"
                              onClick={() => setExpandedRow(isExpanded ? null : idx)}
                              className="flex items-center gap-1.5 text-xs font-medium"
                              style={{ color: '#f97316' }}
                            >
                              <AlertCircle size={12} />
                              {row.clientMatches.length} matches
                              <ChevronDown size={10} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          ) : (
                            <button type="button"
                              onClick={() => setExpandedRow(isExpanded ? null : idx)}
                              className="flex items-center gap-1.5 text-xs"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              <User size={12} />
                              No client matched
                              <ChevronDown size={10} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </div>

                        {/* Rate info */}
                        {row.baseRate > 0 && (
                          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            Rate: ${row.baseRate}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Client picker dropdown */}
                    {isExpanded && (
                      <div
                        className="border-t px-3 py-2 space-y-1"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
                      >
                        <button type="button"
                          onClick={() => setClient(idx, '')}
                          className="w-full text-left px-2 py-1.5 rounded text-xs"
                          style={{
                            backgroundColor: !row.clientId ? 'rgba(168,85,247,0.12)' : 'transparent',
                            color: !row.clientId ? '#a855f7' : 'var(--text-secondary)',
                          }}
                        >
                          No client
                        </button>
                        {(row.clientMatches.length > 0
                          ? [...new Set([...row.clientMatches, ...clients.map(c => c.id)])]
                          : clients.map(c => c.id)
                        ).map(cid => {
                          const c = clientMap.get(cid)
                          if (!c) return null
                          const isMatch = row.clientMatches.includes(cid)
                          return (
                            <button type="button"
                              key={cid}
                              onClick={() => setClient(idx, cid)}
                              className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2"
                              style={{
                                backgroundColor: row.clientId === cid ? 'rgba(168,85,247,0.12)' : 'transparent',
                                color: row.clientId === cid ? '#a855f7' : 'var(--text-primary)',
                              }}
                            >
                              <span className="truncate">{c.alias}</span>
                              {isMatch && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                                  style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                                  match
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Import button */}
            <div className="pt-4 pb-2">
              <button type="button"
                onClick={handleImport}
                disabled={importing || includedCount === 0}
                className={`w-full py-3 rounded-xl font-semibold text-sm ${
                  includedCount > 0 && !importing
                    ? 'bg-purple-600 text-white active:bg-purple-700'
                    : 'opacity-40 bg-purple-600 text-white'
                }`}
              >
                {importing
                  ? 'Importing…'
                  : `Import ${includedCount} Booking${includedCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
