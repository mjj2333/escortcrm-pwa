import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, CalendarDays, List, SlidersHorizontal, X, ChevronRight } from 'lucide-react'
import { useState, useMemo, useRef, useEffect } from 'react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, isToday,
  startOfWeek, endOfWeek, isSameMonth, addMonths, subMonths, subDays,
  parseISO, startOfDay, endOfDay
} from 'date-fns'
import { db, formatCurrency, bookingTotal } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'
import { BookingEditor } from './BookingEditor'
import { AvailabilityPicker } from './AvailabilityPicker'
import { SwipeableBookingRow } from '../../components/SwipeableBookingRow'
import { CancellationSheet } from '../../components/CancellationSheet'
import { JournalEntryEditor } from '../../components/JournalEntryEditor'
import { formatTime12 } from '../../utils/availability'
import type { Booking, BookingStatus } from '../../types'
import { bookingStatusColors } from '../../types'
import { SchedulePageSkeleton } from '../../components/Skeleton'
import { isPro, usePlanLimits } from '../../components/planLimits'

interface SchedulePageProps {
  onOpenBooking: (bookingId: string) => void
}

const ALL_STATUSES: BookingStatus[] = [
  'To Be Confirmed', 'Screening', 'Pending Deposit', 'Confirmed',
  'In Progress', 'Completed', 'Cancelled', 'No Show'
]

const chipStyle = (color: string, active: boolean): React.CSSProperties => {
  const palette: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
    purple:  { bg: 'rgba(168,85,247,0.08)',  text: '#a855f7', border: '#a855f7', activeBg: 'rgba(168,85,247,0.85)' },
    blue:    { bg: 'rgba(59,130,246,0.08)',   text: '#3b82f6', border: '#3b82f6', activeBg: 'rgba(59,130,246,0.85)'  },
    orange:  { bg: 'rgba(249,115,22,0.08)',   text: '#f97316', border: '#f97316', activeBg: 'rgba(249,115,22,0.85)'  },
    green:   { bg: 'rgba(34,197,94,0.08)',    text: '#16a34a', border: '#22c55e', activeBg: 'rgba(34,197,94,0.85)'   },
    teal:    { bg: 'rgba(20,184,166,0.08)',   text: '#0d9488', border: '#14b8a6', activeBg: 'rgba(20,184,166,0.85)'  },
    gray:    { bg: 'rgba(107,114,128,0.08)',  text: '#6b7280', border: '#6b7280', activeBg: 'rgba(107,114,128,0.75)' },
    red:     { bg: 'rgba(239,68,68,0.08)',    text: '#ef4444', border: '#ef4444', activeBg: 'rgba(239,68,68,0.85)'   },
  }
  const p = palette[color] ?? palette.gray
  return active
    ? { backgroundColor: p.activeBg, color: '#fff', border: `1px solid ${p.border}` }
    : { backgroundColor: p.bg,       color: p.text, border: `1px solid ${p.border}` }
}

/** Map status color names to actual hex values */
const statusHex: Record<string, string> = {
  purple: '#a855f7', blue: '#3b82f6', orange: '#f97316',
  green: '#22c55e', teal: '#14b8a6', gray: '#6b7280', red: '#ef4444',
}

/** Max booking bars to show per calendar cell */
const MAX_BARS = 2

export function SchedulePage({ onOpenBooking }: SchedulePageProps) {
  const [viewMode, setViewMode]         = useState<'calendar' | 'list'>('calendar')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showEditor, setShowEditor]     = useState(false)
  const [showAvailPicker, setShowAvailPicker] = useState(false)

  // Day detail modal
  const [dayDetailDate, setDayDetailDate] = useState<Date | null>(null)

  // Monthly summary filter — which status pill is expanded
  const [summaryFilter, setSummaryFilter] = useState<BookingStatus | null>(null)

  // Filter state
  const [filtersOpen, setFiltersOpen]         = useState(false)
  const [searchQuery, setSearchQuery]         = useState('')
  const [activeStatuses, setActiveStatuses]   = useState<Set<BookingStatus>>(new Set())
  const [dateFrom, setDateFrom]               = useState('')
  const [dateTo, setDateTo]                   = useState('')

  const filtersActive = searchQuery.trim() !== '' || activeStatuses.size > 0 || dateFrom !== '' || dateTo !== ''
  const isDateRangeActive = dateFrom !== '' || dateTo !== ''

  // Journal prompt after completing a booking
  const [journalBooking, setJournalBooking] = useState<Booking | null>(null)
  const handleBookingCompleted = isPro() ? setJournalBooking : () => {}
  const [cancelTarget, setCancelTarget] = useState<{ booking: Booking; mode: 'cancel' | 'noshow' } | null>(null)

  const limits = usePlanLimits()
  const rawBookings = useLiveQuery(() => db.bookings.orderBy('dateTime').toArray())
  const bookings    = rawBookings ?? []
  const clients     = useLiveQuery(() => db.clients.toArray()) ?? []
  const availability = useLiveQuery(() => db.availability.toArray()) ?? []
  const clientFor = (id?: string) => clients.find(c => c.id === id)

  // Shared search + status predicate
  const matchesFilters = useMemo(() => {
    return (b: { clientId?: string; status: BookingStatus }) => {
      if (activeStatuses.size > 0 && !activeStatuses.has(b.status)) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const client = clientFor(b.clientId)
        if (!client?.alias?.toLowerCase().includes(q)) return false
      }
      return true
    }
  }, [clients, activeStatuses, searchQuery])

  // Calendar grid
  const monthStart = startOfMonth(currentMonth)
  const monthEnd   = endOfMonth(currentMonth)
  const calStart   = startOfWeek(monthStart)
  const calEnd     = endOfWeek(monthEnd)
  const days       = eachDayOfInterval({ start: calStart, end: calEnd })

  const isViewingCurrentMonth = isSameMonth(currentMonth, new Date())

  const bookingsForDay = (day: Date) =>
    bookings.filter(b => {
      if (!isSameDay(new Date(b.dateTime), day)) return false
      const hiddenByDefault = b.status === 'Cancelled' || b.status === 'No Show'
      if (hiddenByDefault && !activeStatuses.has(b.status)) return false
      if (!matchesFilters(b)) return false
      if (isDateRangeActive) {
        const dt = new Date(b.dateTime)
        if (dateFrom && dt < startOfDay(parseISO(dateFrom))) return false
        if (dateTo   && dt > endOfDay(parseISO(dateTo)))     return false
      }
      return true
    })

  const availForDay = (day: Date) =>
    availability.find(a => isSameDay(new Date(a.date), day))

  // ── Monthly summary ──────────────────────────────────────────
  const monthBookings = useMemo(() => {
    return bookings.filter(b => {
      const dt = new Date(b.dateTime)
      if (dt < monthStart || dt > monthEnd) return false
      const hiddenByDefault = b.status === 'Cancelled' || b.status === 'No Show'
      if (hiddenByDefault && !activeStatuses.has(b.status)) return false
      if (!matchesFilters(b)) return false
      return true
    })
  }, [bookings, clients, activeStatuses, searchQuery, currentMonth])

  const monthRevenue = monthBookings
    .filter(b => b.status === 'Completed')
    .reduce((sum, b) => sum + bookingTotal(b), 0)

  const monthStatusCounts = useMemo(() => {
    const counts: Partial<Record<BookingStatus, number>> = {}
    for (const b of monthBookings) {
      counts[b.status] = (counts[b.status] ?? 0) + 1
    }
    return counts
  }, [monthBookings])

  // ── Day detail bookings ──────────────────────────────────────
  const dayDetailBookings = dayDetailDate
    ? bookingsForDay(dayDetailDate).sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
    : []

  // List view
  const now    = new Date()
  const past30 = subDays(now, 30)

  const listBookings = useMemo(() => {
    return bookings
      .filter(b => {
        const dt = new Date(b.dateTime)
        const hiddenByDefault = b.status === 'Cancelled' || b.status === 'No Show'
        if (hiddenByDefault && activeStatuses.size === 0) return false
        if (!matchesFilters(b)) return false
        if (isDateRangeActive) {
          if (dateFrom && dt < startOfDay(parseISO(dateFrom))) return false
          if (dateTo   && dt > endOfDay(parseISO(dateTo)))     return false
          return true
        }
        return dt >= past30
      })
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
  }, [bookings, clients, activeStatuses, searchQuery, dateFrom, dateTo])

  const pastBookings   = listBookings.filter(b => new Date(b.dateTime) < now)
  const futureBookings = listBookings.filter(b => new Date(b.dateTime) >= now)

  function goToToday() {
    setCurrentMonth(new Date())
    setSummaryFilter(null)
  }

  function toggleStatus(s: BookingStatus) {
    setActiveStatuses(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  function clearFilters() {
    setSearchQuery('')
    setActiveStatuses(new Set())
    setDateFrom('')
    setDateTo('')
  }

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  const availColor = (day: Date) => {
    const a = availForDay(day)
    if (!a) return undefined
    const map: Record<string, string> = {
      'Available': '#22c55e', 'Limited': '#f97316', 'Busy': '#ef4444', 'Off': '#6b7280'
    }
    return map[a.status]
  }

  const baseInputStyle: React.CSSProperties = {
    fontSize: '16px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 10px',
    width: '100%',
    outline: 'none',
  }

  if (rawBookings === undefined) return <SchedulePageSkeleton />

  return (
    <div className="pb-20">
      <PageHeader title="Schedule">
        {/* Filter toggle with dot indicator */}
        <button
          onClick={() => setFiltersOpen(v => !v)}
          className="relative p-2 rounded-lg"
          style={{ color: filtersActive ? '#a855f7' : 'var(--text-secondary)' }}
          aria-label="Toggle filters"
        >
          <SlidersHorizontal size={18} />
          {filtersActive && (
            <span
              className="absolute top-1 right-1 w-2 h-2 rounded-full"
              style={{ backgroundColor: '#a855f7' }}
            />
          )}
        </button>

        {/* View toggle */}
        <div data-tour="tour-schedule-view" className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 text-xs font-medium ${viewMode === 'calendar' ? 'bg-purple-500 text-white' : ''}`}
            style={viewMode !== 'calendar' ? { color: 'var(--text-secondary)' } : {}}
          >
            <CalendarDays size={14} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-medium ${viewMode === 'list' ? 'bg-purple-500 text-white' : ''}`}
            style={viewMode !== 'list' ? { color: 'var(--text-secondary)' } : {}}
          >
            <List size={14} />
          </button>
        </div>

        <button data-tour="tour-schedule-add" onClick={() => setShowEditor(true)}
          className={`p-2 rounded-lg ${limits.canAddBooking ? 'text-purple-500' : ''}`}
          style={!limits.canAddBooking ? { color: 'var(--text-secondary)', opacity: 0.5 } : {}}>
          <Plus size={20} />
        </button>
      </PageHeader>

      {!limits.isPro && (
        <div className="px-4 pt-1 pb-1">
          <p className="text-[10px] text-center" style={{ color: 'var(--text-secondary)' }}>
            {limits.bookingCount} / {limits.bookingLimit} bookings this month on free plan
          </p>
        </div>
      )}

      {/* ── Collapsible Filter Panel ─────────────────────────────────────── */}
      {filtersOpen && (
        <div
          className="border-b px-4 py-3 space-y-3"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
        >
          <input
            type="search"
            placeholder="Search by client name or alias…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={baseInputStyle}
          />
          <div className="flex flex-wrap gap-1.5">
            {ALL_STATUSES.map(s => {
              const active = activeStatuses.has(s)
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full transition-all"
                  style={chipStyle(bookingStatusColors[s], active)}
                >
                  {s}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={baseInputStyle} />
            </div>
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={baseInputStyle} />
            </div>
          </div>
          {filtersActive && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs font-medium" style={{ color: '#a855f7' }}>
              <X size={12} /> Clear all filters
            </button>
          )}
        </div>
      )}

      <div data-tour="tour-schedule-content" className="max-w-lg mx-auto">
        {viewMode === 'calendar' ? (
          <div className="px-4 py-3">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => { setCurrentMonth(subMonths(currentMonth, 1)); setSummaryFilter(null) }}
                className="text-sm font-medium px-3 py-1 rounded-lg"
                style={{ color: 'var(--text-secondary)' }}
              >
                ‹ Prev
              </button>
              <div className="flex items-center gap-2">
                <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>
                  {format(currentMonth, 'MMMM yyyy')}
                </h2>
                {!isViewingCurrentMonth && (
                  <button
                    onClick={goToToday}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7' }}
                  >
                    Today
                  </button>
                )}
              </div>
              <button
                onClick={() => { setCurrentMonth(addMonths(currentMonth, 1)); setSummaryFilter(null) }}
                className="text-sm font-medium px-3 py-1 rounded-lg"
                style={{ color: 'var(--text-secondary)' }}
              >
                Next ›
              </button>
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {dayLabels.map((label, i) => (
                <div key={`${label}-${i}`} className="text-center text-xs font-medium py-1" style={{ color: 'var(--text-secondary)' }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, i) => {
                const inMonth     = isSameMonth(day, currentMonth)
                const today       = isToday(day)
                const dayBookings = bookingsForDay(day)
                const avail       = availColor(day)
                const sorted      = [...dayBookings].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
                const visible     = sorted.slice(0, MAX_BARS)
                const overflow    = sorted.length - MAX_BARS

                return (
                  <button
                    key={i}
                    onClick={() => setDayDetailDate(day)}
                    className={`relative flex flex-col items-stretch rounded-lg text-sm transition-colors overflow-hidden ${!inMonth ? 'opacity-30' : ''}`}
                    style={{
                      backgroundColor: today ? 'var(--bg-secondary)' : undefined,
                      minHeight: '58px',
                      padding: '2px',
                    }}
                  >
                    {/* Day number row */}
                    <div className="flex items-center justify-between px-0.5">
                      <span
                        className="text-[11px] leading-none"
                        style={{
                          color: today ? '#a855f7' : 'var(--text-primary)',
                          fontWeight: today ? 700 : 400,
                        }}
                      >
                        {format(day, 'd')}
                      </span>
                      {avail && (
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: avail }} />
                      )}
                    </div>

                    {/* Booking bars */}
                    <div className="flex flex-col gap-px mt-0.5 flex-1">
                      {visible.map(b => {
                        const color = statusHex[bookingStatusColors[b.status]] ?? '#6b7280'
                        const dt = new Date(b.dateTime)
                        const h = dt.getHours()
                        const m = dt.getMinutes()
                        const timeStr = `${h > 12 ? h - 12 : h || 12}${m > 0 ? `:${m.toString().padStart(2, '0')}` : ''}${h >= 12 ? 'p' : 'a'}`
                        const client = clientFor(b.clientId)
                        return (
                          <div
                            key={b.id}
                            className="rounded-sm px-0.5 truncate"
                            style={{
                              backgroundColor: color + '25',
                              borderLeft: `2px solid ${color}`,
                              fontSize: '8px',
                              lineHeight: '13px',
                              color: color,
                              fontWeight: 600,
                            }}
                          >
                            {timeStr}{client ? ` ${client.alias.slice(0, 4)}` : ''}
                          </div>
                        )
                      })}
                      {overflow > 0 && (
                        <div
                          className="text-center rounded-sm"
                          style={{
                            fontSize: '7px',
                            lineHeight: '11px',
                            color: 'var(--text-secondary)',
                            backgroundColor: 'var(--bg-secondary)',
                          }}
                        >
                          +{overflow} more
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* ── Monthly Summary ───────────────────────────────────────── */}
            <div className="mt-5">
              <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
                {format(currentMonth, 'MMMM')} Summary
              </h3>

              {monthBookings.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {filtersActive ? 'No matching bookings this month' : 'No bookings this month'}
                </p>
              ) : (
                <>
                  {/* Top-level stats */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{monthBookings.length}</p>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Bookings</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {monthBookings.filter(b => b.status === 'Completed').length}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Completed</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <p className="text-lg font-bold text-purple-500">{formatCurrency(monthRevenue)}</p>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Revenue</p>
                    </div>
                  </div>

                  {/* Status breakdown — clickable */}
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(monthStatusCounts)
                      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                      .map(([status, count]) => {
                        const color = statusHex[bookingStatusColors[status as BookingStatus]] ?? '#6b7280'
                        const isActive = summaryFilter === status
                        return (
                          <button
                            key={status}
                            onClick={() => setSummaryFilter(isActive ? null : status as BookingStatus)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                            style={{
                              backgroundColor: isActive ? color : color + '15',
                              color: isActive ? '#fff' : color,
                              border: isActive ? `1px solid ${color}` : '1px solid transparent',
                            }}
                          >
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isActive ? '#fff' : color }} />
                            {status} ({count})
                          </button>
                        )
                      })}
                  </div>

                  {/* Expanded booking list for selected status */}
                  {summaryFilter && monthStatusCounts[summaryFilter] && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                          {summaryFilter} ({monthStatusCounts[summaryFilter]})
                        </p>
                        <button
                          onClick={() => setSummaryFilter(null)}
                          className="text-xs font-medium flex items-center gap-1"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          <X size={12} /> Close
                        </button>
                      </div>
                      {monthBookings
                        .filter(b => b.status === summaryFilter)
                        .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
                        .map(b => (
                          <SwipeableBookingRow
                            key={b.id}
                            booking={b}
                            client={clientFor(b.clientId)}
                            onOpen={() => onOpenBooking(b.id)}
                            onCompleted={handleBookingCompleted}
                            onCancel={(b) => setCancelTarget({ booking: b, mode: 'cancel' })}
                            onNoShow={(b) => setCancelTarget({ booking: b, mode: 'noshow' })}
                            availabilityStatus={availForDay(new Date(b.dateTime))?.status}
                          />
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          /* List view */
          <div className="px-4 py-3">
            {listBookings.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={40} />}
                title={filtersActive ? 'No matching bookings' : 'No bookings'}
                description={
                  filtersActive
                    ? 'Try adjusting your search or filters'
                    : 'Create your first booking to see it here'
                }
              />
            ) : (
              <div className="space-y-4">
                {futureBookings.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Upcoming ({futureBookings.length})
                    </p>
                    <div className="space-y-2">
                      {futureBookings.map(b => (
                        <SwipeableBookingRow
                          key={b.id}
                          booking={b}
                          client={clientFor(b.clientId)}
                          onOpen={() => onOpenBooking(b.id)}
                          onCompleted={handleBookingCompleted}
                            onCancel={(b) => setCancelTarget({ booking: b, mode: 'cancel' })}
                            onNoShow={(b) => setCancelTarget({ booking: b, mode: 'noshow' })}
                          availabilityStatus={availForDay(new Date(b.dateTime))?.status}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {pastBookings.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                      {isDateRangeActive ? `Past (${pastBookings.length})` : 'Recent (last 30 days)'}
                    </p>
                    <div className="space-y-2">
                      {[...pastBookings].reverse().map(b => (
                        <SwipeableBookingRow
                          key={b.id}
                          booking={b}
                          client={clientFor(b.clientId)}
                          onOpen={() => onOpenBooking(b.id)}
                          onCompleted={handleBookingCompleted}
                            onCancel={(b) => setCancelTarget({ booking: b, mode: 'cancel' })}
                            onNoShow={(b) => setCancelTarget({ booking: b, mode: 'noshow' })}
                          availabilityStatus={availForDay(new Date(b.dateTime))?.status}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Day Detail Modal ──────────────────────────────────────────── */}
      {dayDetailDate && (
        <DayDetailModal
          date={dayDetailDate}
          bookings={dayDetailBookings}
          clientFor={clientFor}
          availForDay={availForDay}
          availColor={availColor(dayDetailDate)}
          filtersActive={filtersActive}
          onClose={() => setDayDetailDate(null)}
          onOpenBooking={(id) => { setDayDetailDate(null); onOpenBooking(id) }}
          onSetAvailability={() => setShowAvailPicker(true)}
          onBookingCompleted={handleBookingCompleted}
          onCancel={(b) => setCancelTarget({ booking: b, mode: 'cancel' })}
          onNoShow={(b) => setCancelTarget({ booking: b, mode: 'noshow' })}
        />
      )}

      <BookingEditor isOpen={showEditor} onClose={() => setShowEditor(false)} />
      {showAvailPicker && dayDetailDate && (
        <AvailabilityPicker
          date={dayDetailDate}
          current={availForDay(dayDetailDate)}
          onClose={() => setShowAvailPicker(false)}
        />
      )}

      {/* Cancellation sheet (shared across swipe rows + day detail) */}
      <CancellationSheet
        booking={cancelTarget?.booking ?? null}
        mode={cancelTarget?.mode ?? 'cancel'}
        onClose={() => setCancelTarget(null)}
      />

      {/* Journal prompt after booking completion */}
      {journalBooking && (
        <JournalEntryEditor
          isOpen={!!journalBooking}
          onClose={() => setJournalBooking(null)}
          booking={journalBooking}
          clientAlias={clientFor(journalBooking.clientId)?.alias}
        />
      )}
    </div>
  )
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Day Detail Modal — slide-up overlay
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DayDetailModalProps {
  date: Date
  bookings: import('../../types').Booking[]
  clientFor: (id?: string) => import('../../types').Client | undefined
  availForDay: (day: Date) => import('../../types').DayAvailability | undefined
  availColor?: string
  filtersActive: boolean
  onClose: () => void
  onOpenBooking: (id: string) => void
  onSetAvailability: () => void
  onBookingCompleted?: (booking: import('../../types').Booking) => void
  onCancel?: (booking: import('../../types').Booking) => void
  onNoShow?: (booking: import('../../types').Booking) => void
}

function DayDetailModal({
  date, bookings, clientFor, availForDay, availColor, filtersActive,
  onClose, onOpenBooking, onSetAvailability, onBookingCompleted, onCancel, onNoShow,
}: DayDetailModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const avail = availForDay(date)

  // Animate in
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        backgroundColor: visible ? 'rgba(0,0,0,0.5)' : 'transparent',
        transition: 'background-color 0.2s',
      }}
      onClick={e => { if (e.target === backdropRef.current) handleClose() }}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--bg-primary)',
          maxHeight: '75vh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s ease-out',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
              {format(date, 'EEEE, MMMM d')}
            </h2>
            {isToday(date) && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500">
                Today
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Availability button */}
        <div className="px-4 pb-3">
          <button
            onClick={onSetAvailability}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: availColor ?? 'var(--text-secondary)' }}
            />
            {avail?.status ?? 'Set Availability'}
            {avail?.startTime && avail?.endTime && (
              <span className="opacity-60 ml-1">
                {formatTime12(avail.startTime)} – {formatTime12(avail.endTime)}
              </span>
            )}
            <ChevronRight size={12} className="ml-auto opacity-40" />
          </button>
        </div>

        {/* Booking rows — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {bookings.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
              {filtersActive ? 'No matching bookings' : 'No bookings this day'}
            </p>
          ) : (
            <div className="space-y-2">
              {bookings.map(b => (
                <SwipeableBookingRow
                  key={b.id}
                  booking={b}
                  client={clientFor(b.clientId)}
                  onOpen={() => onOpenBooking(b.id)}
                  onCompleted={onBookingCompleted}
                  onCancel={onCancel}
                  onNoShow={onNoShow}
                  availabilityStatus={avail?.status}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
