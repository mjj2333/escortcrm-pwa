import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, CalendarDays, List, SlidersHorizontal, X } from 'lucide-react'
import { useState, useMemo } from 'react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, isToday,
  startOfWeek, endOfWeek, isSameMonth, addMonths, subMonths, subDays,
  parseISO, startOfDay, endOfDay
} from 'date-fns'
import { db } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'
import { BookingEditor } from './BookingEditor'
import { AvailabilityPicker } from './AvailabilityPicker'
import { SwipeableBookingRow } from '../../components/SwipeableBookingRow'
import { formatTime12 } from '../../utils/availability'
import type { BookingStatus } from '../../types'
import { bookingStatusColors } from '../../types'
import { SchedulePageSkeleton } from '../../components/Skeleton'

interface SchedulePageProps {
  onOpenBooking: (bookingId: string) => void
}

const ALL_STATUSES: BookingStatus[] = [
  'Inquiry', 'Screening', 'Pending Deposit', 'Confirmed',
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

export function SchedulePage({ onOpenBooking }: SchedulePageProps) {
  const [viewMode, setViewMode]         = useState<'calendar' | 'list'>('calendar')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [showEditor, setShowEditor]     = useState(false)
  const [showAvailPicker, setShowAvailPicker] = useState(false)

  // Filter state
  const [filtersOpen, setFiltersOpen]         = useState(false)
  const [searchQuery, setSearchQuery]         = useState('')
  const [activeStatuses, setActiveStatuses]   = useState<Set<BookingStatus>>(new Set())
  const [dateFrom, setDateFrom]               = useState('')
  const [dateTo, setDateTo]                   = useState('')

  const filtersActive = searchQuery.trim() !== '' || activeStatuses.size > 0 || dateFrom !== '' || dateTo !== ''
  const isDateRangeActive = dateFrom !== '' || dateTo !== ''

  const bookings    = useLiveQuery(() => db.bookings.orderBy('dateTime').toArray())
  const clients     = useLiveQuery(() => db.clients.toArray()) ?? []
  const availability = useLiveQuery(() => db.availability.toArray()) ?? []
  if (bookings === undefined) return <SchedulePageSkeleton />

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

  const selectedBookings = selectedDate
    ? bookingsForDay(selectedDate).sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
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
    setSelectedDate(new Date())
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
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
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

        <button onClick={() => setShowEditor(true)} className="p-2 rounded-lg text-purple-500">
          <Plus size={20} />
        </button>
      </PageHeader>

      {/* ── Collapsible Filter Panel ─────────────────────────────────────── */}
      {filtersOpen && (
        <div
          className="border-b px-4 py-3 space-y-3"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
        >
          {/* Search input */}
          <input
            type="search"
            placeholder="Search by client name or alias…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={baseInputStyle}
          />

          {/* Status chips */}
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

          {/* Date range */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                style={baseInputStyle}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                style={baseInputStyle}
              />
            </div>
          </div>

          {/* Clear filters */}
          {filtersActive && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-medium"
              style={{ color: '#a855f7' }}
            >
              <X size={12} />
              Clear all filters
            </button>
          )}
        </div>
      )}

      <div className="max-w-lg mx-auto">
        {viewMode === 'calendar' ? (
          <div className="px-4 py-3">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
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
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
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
                const inMonth    = isSameMonth(day, currentMonth)
                const today      = isToday(day)
                const selected   = selectedDate && isSameDay(day, selectedDate)
                const dayBookings = bookingsForDay(day)
                const avail      = availColor(day)

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(day)}
                    className={`relative flex flex-col items-center justify-center py-2 rounded-lg text-sm transition-colors ${!inMonth ? 'opacity-30' : ''}`}
                    style={{
                      backgroundColor: selected ? 'rgba(168,85,247,0.2)' : today ? 'var(--bg-secondary)' : undefined,
                      color: selected ? '#a855f7' : 'var(--text-primary)',
                      fontWeight: today || selected ? 700 : 400,
                    }}
                  >
                    {avail && (
                      <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: avail }} />
                    )}
                    {format(day, 'd')}
                    {dayBookings.length > 0 && (
                      <span
                        className="text-[8px] font-bold leading-none mt-0.5 rounded-full min-w-[14px] text-center py-px"
                        style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: '#a855f7' }}
                      >
                        {dayBookings.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Selected day details */}
            {selectedDate && (
              <div className="mt-4">
                <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                  {format(selectedDate, 'EEEE, MMMM d')}
                </h3>
                <button
                  onClick={() => setShowAvailPicker(true)}
                  className="mb-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: availColor(selectedDate) ?? 'var(--text-secondary)' }}
                  />
                  {availForDay(selectedDate)?.status ?? 'Set Availability'}
                  {availForDay(selectedDate)?.startTime && availForDay(selectedDate)?.endTime && (
                    <span className="opacity-60 ml-1">
                      {formatTime12(availForDay(selectedDate)!.startTime!)} – {formatTime12(availForDay(selectedDate)!.endTime!)}
                    </span>
                  )}
                </button>
                {selectedBookings.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {filtersActive ? 'No matching bookings' : 'No bookings'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedBookings.map(b => (
                      <SwipeableBookingRow
                        key={b.id}
                        booking={b}
                        client={clientFor(b.clientId)}
                        onOpen={() => onOpenBooking(b.id)}
                        availabilityStatus={availForDay(selectedDate!)?.status}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
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
                {/* Upcoming */}
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
                          availabilityStatus={availForDay(new Date(b.dateTime))?.status}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {/* Past / Recent */}
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

      <BookingEditor isOpen={showEditor} onClose={() => setShowEditor(false)} />
      {showAvailPicker && selectedDate && (
        <AvailabilityPicker
          date={selectedDate}
          current={availForDay(selectedDate)}
          onClose={() => setShowAvailPicker(false)}
        />
      )}
    </div>
  )
}
