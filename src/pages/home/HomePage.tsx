import { useLiveQuery } from 'dexie-react-hooks'
import {
  Settings, Clock, CalendarDays, DollarSign, Users,
  ChevronRight, ShieldAlert, TrendingUp, Cake, Bell, Minus
} from 'lucide-react'
import { startOfDay, endOfDay, startOfWeek, startOfMonth, isToday, differenceInDays, addYears, isSameDay } from 'date-fns'
import { useState } from 'react'
import { db, formatCurrency, isUpcoming, bookingTotal } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { Card, CardHeader } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { SwipeableBookingRow } from '../../components/SwipeableBookingRow'
import { SampleDataBanner } from '../../components/SampleDataBanner'
import { TransactionEditor } from '../finances/TransactionEditor'
import { formatTime12 } from '../../utils/availability'
import { availabilityStatusColors } from '../../types'
import { useLocalStorage } from '../../hooks/useSettings'

interface HomePageProps {
  onNavigateTab: (tab: number) => void
  onOpenSettings: () => void
  onOpenBooking: (bookingId: string) => void
  onOpenClient: (clientId: string) => void
}

export function HomePage({ onNavigateTab, onOpenSettings, onOpenBooking, onOpenClient }: HomePageProps) {
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const weekStart = startOfWeek(now)
  const monthStart = startOfMonth(now)

  const [showExpenseEditor, setShowExpenseEditor] = useState(false)
  const [remindersEnabled] = useLocalStorage('remindersEnabled', false)

  const allBookings = useLiveQuery(() => db.bookings.toArray()) ?? []
  const clients = useLiveQuery(() => db.clients.toArray()) ?? []
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const allPayments = useLiveQuery(() => db.payments.toArray()) ?? []
  const safetyChecks = useLiveQuery(() => db.safetyChecks.where('status').equals('pending').toArray()) ?? []
  const availability = useLiveQuery(() => db.availability.toArray()) ?? []
  const todayAvailability = useLiveQuery(() =>
    db.availability.where('date').between(todayStart, todayEnd, true, true).first()
  )

  const availForDay = (day: Date) =>
    availability.find(a => isSameDay(new Date(a.date), day))

  const showNotificationPrompt = !remindersEnabled && 'Notification' in window && Notification.permission === 'default'

  const todaysBookings = allBookings.filter(b => {
    const d = new Date(b.dateTime)
    return isToday(d) && b.status !== 'Cancelled'
  })

  const upcoming = allBookings
    .filter(b => isUpcoming(b))
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
    .slice(0, 5)

  const weekIncome = transactions
    .filter(t => t.type === 'income' && new Date(t.date) >= weekStart)
    .reduce((sum, t) => sum + t.amount, 0)

  const monthIncome = transactions
    .filter(t => t.type === 'income' && new Date(t.date) >= monthStart)
    .reduce((sum, t) => sum + t.amount, 0)

  const pendingScreenings = clients.filter(
    c => c.screeningStatus === 'Pending' || c.screeningStatus === 'In Progress'
  ).length

  // Upcoming birthdays (next 30 days)
  const upcomingBirthdays = clients
    .filter(c => c.birthday && !c.isBlocked)
    .map(c => {
      const bday = new Date(c.birthday!)
      // Find next birthday
      let next = new Date(now.getFullYear(), bday.getMonth(), bday.getDate())
      if (next < todayStart) next = addYears(next, 1)
      const daysUntil = differenceInDays(next, todayStart)
      return { client: c, daysUntil, nextBirthday: next }
    })
    .filter(b => b.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil)

  const clientForBooking = (clientId?: string) =>
    clients.find(c => c.id === clientId)

  // Outstanding balances — bookings with unpaid amounts
  const bookingsWithBalance = allBookings
    .filter(b => b.status !== 'Cancelled' && b.status !== 'No Show')
    .map(b => {
      const total = bookingTotal(b)
      const paid = allPayments.filter(p => p.bookingId === b.id).reduce((s, p) => s + p.amount, 0)
      const owing = total - paid
      return { booking: b, owing, client: clientForBooking(b.clientId) }
    })
    .filter(x => x.owing > 0)
    .sort((a, b) => b.owing - a.owing)

  const totalOutstanding = bookingsWithBalance.reduce((sum, x) => sum + x.owing, 0)

  return (
    <div className="pb-20">
      <PageHeader title="Home">
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg active:bg-white/10 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Settings size={20} />
        </button>
      </PageHeader>

      <SampleDataBanner />

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Safety Alert Banner */}
        {safetyChecks.length > 0 && (
          <div
            className="rounded-xl p-4 flex items-center gap-3 cursor-pointer"
            style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}
            onClick={() => onNavigateTab(4)}
          >
            <ShieldAlert size={24} className="text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-500 text-sm">
                {safetyChecks.length} Pending Check-in{safetyChecks.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-red-400">Tap to review</p>
            </div>
            <ChevronRight size={16} className="text-red-400" />
          </div>
        )}

        {/* Availability Status */}
        <Card onClick={() => onNavigateTab(2)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: todayAvailability
                    ? `rgba(${todayAvailability.status === 'Available' ? '34,197,94' : todayAvailability.status === 'Limited' ? '249,115,22' : todayAvailability.status === 'Busy' ? '239,68,68' : '107,114,128'},0.15)`
                    : 'rgba(107,114,128,0.15)'
                }}
              >
                <Clock size={20} style={{
                  color: todayAvailability
                    ? availabilityStatusColors[todayAvailability.status] === 'green' ? '#22c55e'
                      : availabilityStatusColors[todayAvailability.status] === 'orange' ? '#f97316'
                      : availabilityStatusColors[todayAvailability.status] === 'red' ? '#ef4444'
                      : '#6b7280'
                    : '#6b7280'
                }} />
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Today's Status
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {todayAvailability?.status ?? 'Not set'}
                  {todayAvailability?.startTime && todayAvailability?.endTime
                    ? ` · ${formatTime12(todayAvailability.startTime)} – ${formatTime12(todayAvailability.endTime)}`
                    : ''}
                  {todayAvailability?.notes ? ` — ${todayAvailability.notes}` : ''}
                </p>
              </div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
          </div>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card onClick={() => onNavigateTab(2)}>
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays size={16} className="text-purple-500" />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Today</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {todaysBookings.length}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              booking{todaysBookings.length !== 1 ? 's' : ''}
            </p>
          </Card>

          <Card onClick={() => onNavigateTab(1)}>
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} className="text-purple-500" />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Screening</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {pendingScreenings}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              pending
            </p>
          </Card>

          <Card onClick={() => onNavigateTab(3)}>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={16} className="text-green-500" />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>This Week</span>
            </div>
            <p className="text-2xl font-bold text-green-500">
              {formatCurrency(weekIncome)}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>income</p>
          </Card>

          <Card onClick={() => onNavigateTab(3)}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-green-500" />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>This Month</span>
            </div>
            <p className="text-2xl font-bold text-green-500">
              {formatCurrency(monthIncome)}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>income</p>
          </Card>
        </div>

        {/* Outstanding Balances */}
        {totalOutstanding > 0 && (
          <Card>
            <CardHeader
              title="Outstanding Balances"
              icon={<DollarSign size={16} className="text-orange-500" />}
              action={<span className="text-sm font-bold text-orange-500">{formatCurrency(totalOutstanding)}</span>}
            />
            <div className="space-y-2 mt-2">
              {bookingsWithBalance.slice(0, 4).map(({ booking, owing, client: c }) => (
                <button
                  key={booking.id}
                  onClick={() => onOpenBooking(booking.id)}
                  className="flex items-center justify-between w-full py-1.5 text-left"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'rgba(249,115,22,0.15)' }}
                    >
                      <span className="text-[10px] font-bold text-orange-500">
                        {c?.alias?.charAt(0)?.toUpperCase() ?? '?'}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {c?.alias ?? 'Unknown'}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {booking.status}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-orange-500">{formatCurrency(owing)}</span>
                </button>
              ))}
              {bookingsWithBalance.length > 4 && (
                <p className="text-[10px] text-center" style={{ color: 'var(--text-secondary)' }}>
                  +{bookingsWithBalance.length - 4} more
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Quick Expense Button — Item 16 */}
        <button
          onClick={() => setShowExpenseEditor(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold active:opacity-80"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          <Minus size={16} className="text-red-500" />
          Quick Expense
        </button>

        {/* Notification Prompt — Item 17 */}
        {showNotificationPrompt && (
          <div
            className="rounded-xl p-4 flex items-start gap-3"
            style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
              <Bell size={18} className="text-purple-500" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                Never miss a booking
              </p>
              <p className="text-xs mt-0.5 mb-2" style={{ color: 'var(--text-secondary)' }}>
                Get reminders 1 hour and 15 minutes before appointments, plus birthday alerts.
              </p>
              <button
                onClick={() => onOpenSettings()}
                className="text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ backgroundColor: '#a855f7', color: '#fff' }}
              >
                Enable Reminders
              </button>
            </div>
          </div>
        )}

        {/* Birthday Reminders */}
        {upcomingBirthdays.length > 0 && (
          <Card>
            <CardHeader
              title="Birthdays"
              icon={<Cake size={16} style={{ color: '#ec4899' }} />}
            />
            <div className="space-y-2">
              {upcomingBirthdays.map(({ client: c, daysUntil }) => (
                <button
                  key={c.id}
                  onClick={() => onOpenClient(c.id)}
                  className="flex items-center gap-3 w-full text-left py-1.5"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(236,72,153,0.15)' }}
                  >
                    <span className="text-xs font-bold" style={{ color: '#ec4899' }}>
                      {c.alias.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {c.alias}
                    </p>
                  </div>
                  <span className="text-xs font-semibold shrink-0" style={{
                    color: daysUntil === 0 ? '#ec4899' : 'var(--text-secondary)'
                  }}>
                    {daysUntil === 0 ? '🎂 Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Upcoming Bookings */}
        <Card>
          <CardHeader
            title="Upcoming"
            icon={<CalendarDays size={16} className="text-purple-500" />}
            action={
              <button
                onClick={() => onNavigateTab(2)}
                className="text-xs text-purple-500 font-medium"
              >
                See All
              </button>
            }
          />
          {upcoming.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={40} />}
              title="No upcoming bookings"
              description="Tap + on the Schedule tab to create one"
            />
          ) : (
            <div className="space-y-3">
              {upcoming.map(booking => {
                const client = clientForBooking(booking.clientId)
                return (
                  <SwipeableBookingRow
                    key={booking.id}
                    booking={booking}
                    client={client}
                    onOpen={() => onOpenBooking(booking.id)}
                    availabilityStatus={availForDay(new Date(booking.dateTime))?.status}
                  />
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <TransactionEditor isOpen={showExpenseEditor} onClose={() => setShowExpenseEditor(false)} initialType="expense" />
    </div>
  )
}
