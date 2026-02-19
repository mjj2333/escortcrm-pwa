import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, CalendarDays, List } from 'lucide-react'
import { useState } from 'react'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, isToday,
  startOfWeek, endOfWeek, isSameMonth, addMonths, subMonths, subDays
} from 'date-fns'
import { db } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'
import { BookingEditor } from './BookingEditor'
import { AvailabilityPicker } from './AvailabilityPicker'
import { SwipeableBookingRow } from '../../components/SwipeableBookingRow'
import { formatTime12 } from '../../utils/availability'

interface SchedulePageProps {
  onOpenBooking: (bookingId: string) => void
}

export function SchedulePage({ onOpenBooking }: SchedulePageProps) {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [showEditor, setShowEditor] = useState(false)
  const [showAvailPicker, setShowAvailPicker] = useState(false)

  const bookings = useLiveQuery(() => db.bookings.orderBy('dateTime').toArray()) ?? []
  const clients = useLiveQuery(() => db.clients.toArray()) ?? []
  const availability = useLiveQuery(() => db.availability.toArray()) ?? []

  const clientFor = (id?: string) => clients.find(c => c.id === id)

  // Calendar grid
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const isViewingCurrentMonth = isSameMonth(currentMonth, new Date())

  const bookingsForDay = (day: Date) =>
    bookings.filter(b => isSameDay(new Date(b.dateTime), day) && b.status !== 'Cancelled')

  const availForDay = (day: Date) =>
    availability.find(a => isSameDay(new Date(a.date), day))

  const selectedBookings = selectedDate
    ? bookingsForDay(selectedDate).sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
    : []

  // List view: upcoming + recent 30 days, split into sections
  const now = new Date()
  const past30 = subDays(now, 30)
  const listBookings = bookings
    .filter(b => new Date(b.dateTime) >= past30 && b.status !== 'Cancelled')
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
  const pastBookings = listBookings.filter(b => new Date(b.dateTime) < now)
  const futureBookings = listBookings.filter(b => new Date(b.dateTime) >= now)

  function goToToday() {
    setCurrentMonth(new Date())
    setSelectedDate(new Date())
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

  return (
    <div className="pb-20">
      <PageHeader title="Schedule">
        <div
          className="flex rounded-lg overflow-hidden border"
          style={{ borderColor: 'var(--border)' }}
        >
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
                const inMonth = isSameMonth(day, currentMonth)
                const today = isToday(day)
                const selected = selectedDate && isSameDay(day, selectedDate)
                const dayBookings = bookingsForDay(day)
                const avail = availColor(day)

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(day)}
                    className={`relative flex flex-col items-center justify-center py-2 rounded-lg text-sm transition-colors ${
                      !inMonth ? 'opacity-30' : ''
                    }`}
                    style={{
                      backgroundColor: selected ? 'rgba(168,85,247,0.2)' : today ? 'var(--bg-secondary)' : undefined,
                      color: selected ? '#a855f7' : 'var(--text-primary)',
                      fontWeight: today || selected ? 700 : 400,
                    }}
                  >
                    {avail && (
                      <div
                        className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: avail }}
                      />
                    )}
                    {format(day, 'd')}
                    {dayBookings.length > 0 && (
                      <span
                        className="text-[8px] font-bold leading-none mt-0.5 rounded-full min-w-[14px] text-center py-px"
                        style={{
                          backgroundColor: 'rgba(168,85,247,0.2)',
                          color: '#a855f7',
                        }}
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
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No bookings</p>
                ) : (
                  <div className="space-y-2">
                    {selectedBookings.map(b => {
                      const client = clientFor(b.clientId)
                      return (
                        <SwipeableBookingRow
                          key={b.id}
                          booking={b}
                          client={client}
                          onOpen={() => onOpenBooking(b.id)}
                          availabilityStatus={availForDay(selectedDate!)?.status}
                        />
                      )
                    })}
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
                title="No bookings"
                description="Create your first booking to see it here"
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
                {/* Recent */}
                {pastBookings.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Recent (last 30 days)
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
