import { useLiveQuery } from 'dexie-react-hooks'
import {
  Settings, Clock, CalendarDays, DollarSign, Users,
  ChevronRight, ShieldAlert, TrendingUp, Cake, Bell, Database, X, CircleUser, Building2
} from 'lucide-react'
import { startOfDay, endOfDay, startOfWeek, startOfMonth, isToday, differenceInDays, addYears, isSameDay } from 'date-fns'
import { useState, useRef, useEffect } from 'react'
import { db, formatCurrency, isUpcoming, bookingTotal } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { Card, CardHeader } from '../../components/Card'
import { StatusBadge } from '../../components/StatusBadge'
import { EmptyState } from '../../components/EmptyState'
import { SwipeableBookingRow } from '../../components/SwipeableBookingRow'
import { CancellationSheet } from '../../components/CancellationSheet'
import { SampleDataBanner } from '../../components/SampleDataBanner'
import { formatTime12 } from '../../utils/availability'
import { availabilityStatusColors, bookingStatusColors } from '../../types'
import type { Booking } from '../../types'
import { useLocalStorage } from '../../hooks/useSettings'
import { useBackupReminder } from '../../hooks/useBackupReminder'
import { BackupRestoreModal } from '../../components/BackupRestore'
import { HomePageSkeleton } from '../../components/Skeleton'
import { ProfilePage } from './ProfilePage'
import { IncallBookPage } from './IncallBookPage'
import { GettingStarted, useGettingStartedDone } from '../../components/GettingStarted'
import { DidYouKnowTip } from '../../components/DidYouKnowTip'

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
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const monthStart = startOfMonth(now)

  const [showAllActive, setShowAllActive] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showIncallBook, setShowIncallBook] = useState(false)
  const [remindersEnabled] = useLocalStorage('remindersEnabled', false)
  const [showBackup, setShowBackup] = useState(false)
  const [reminderDismissed, setReminderDismissed] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<{ booking: Booking; mode: 'cancel' | 'noshow' } | null>(null)
  const [profileSetupDone] = useLocalStorage('profileSetupDone', false)
  const gettingStartedDone = useGettingStartedDone()
  const { shouldRemind, daysSince } = useBackupReminder()

  const allBookings = useLiveQuery(() => db.bookings.toArray())
  const clients = useLiveQuery(() => db.clients.toArray()) ?? []
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const allPayments = useLiveQuery(() => db.payments.toArray()) ?? []
  const safetyChecks = useLiveQuery(() => db.safetyChecks.where('status').equals('pending').toArray()) ?? []
  const availability = useLiveQuery(() => db.availability.toArray()) ?? []
  const todayAvailability = useLiveQuery(() =>
    db.availability.where('date').between(todayStart, todayEnd, true, true).first()
  )
  if (allBookings === undefined) return <HomePageSkeleton />

  const availForDay = (day: Date) =>
    availability.find(a => isSameDay(new Date(a.date), day))

  const showNotificationPrompt = !remindersEnabled && 'Notification' in window && Notification.permission === 'default'

  const todaysBookings = allBookings.filter(b => {
    const d = new Date(b.dateTime)
    return isToday(d) && b.status !== 'Cancelled' && b.status !== 'No Show'
  })

  const upcoming = allBookings
    .filter(b => isUpcoming(b, now))
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
    .slice(0, 5)

  // All bookings not yet completed (for "See All" modal)
  const allActiveBookings = allBookings
    .filter(b => !['Completed', 'Cancelled', 'No Show'].includes(b.status))
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())

  const weekIncome = transactions
    .filter(t => t.type === 'income' && new Date(t.date) >= weekStart)
    .reduce((sum, t) => sum + t.amount, 0)

  const monthIncome = transactions
    .filter(t => t.type === 'income' && new Date(t.date) >= monthStart)
    .reduce((sum, t) => sum + t.amount, 0)

  const pendingScreenings = clients.filter(
    c => c.screeningStatus === 'Unscreened' || c.screeningStatus === 'In Progress'
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

  // Outstanding balances — bookings with unpaid amounts (only Pending Deposit+ stages)
  const bookingsWithBalance = allBookings
    .filter(b => b.status === 'Pending Deposit' || b.status === 'Confirmed' || b.status === 'In Progress' || b.status === 'Completed')
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
          onClick={() => setShowIncallBook(true)}
          className="p-2 rounded-lg active:bg-white/10 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Building2 size={20} />
        </button>
        <button
          onClick={() => setShowProfile(true)}
          className="p-2 rounded-lg active:bg-white/10 transition-colors relative"
          style={{ color: 'var(--text-secondary)' }}
        >
          <CircleUser size={20} />
          {!profileSetupDone && (
            <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-purple-500" />
          )}
        </button>
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg active:bg-white/10 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Settings size={20} />
        </button>
      </PageHeader>

      <SampleDataBanner />

      {/* Getting Started checklist / Did You Know tips */}
      {!gettingStartedDone ? (
        <GettingStarted
          onOpenProfile={() => setShowProfile(true)}
          onOpenSettings={onOpenSettings}
          onNavigateTab={onNavigateTab}
        />
      ) : (
        <DidYouKnowTip />
      )}

      {/* Backup reminder banner */}
      {shouldRemind && !reminderDismissed && (
        <div
          className="mx-4 mt-3 rounded-xl p-3 flex items-center gap-3"
          style={{ backgroundColor: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)' }}
        >
          <Database size={18} style={{ color: '#a855f7', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: '#a855f7' }}>
              {daysSince === null ? 'You haven\'t backed up yet' : `Last backup ${daysSince} day${daysSince !== 1 ? 's' : ''} ago`}
            </p>
            <button
              onClick={() => setShowBackup(true)}
              className="text-xs font-medium underline mt-0.5"
              style={{ color: '#a855f7' }}
            >
              Back up now
            </button>
          </div>
          <button
            onClick={() => setReminderDismissed(true)}
            className="p-1 opacity-50 active:opacity-100 shrink-0"
            style={{ color: '#a855f7' }}
            aria-label="Dismiss reminder"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Safety Alert Banner */}
        {safetyChecks.length > 0 && (
          <button
            className="w-full rounded-xl p-4 flex items-center gap-3 text-left"
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
          </button>
        )}

        {/* Availability Status */}
        <Card onClick={() => onNavigateTab(1)}>
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

        {/* Upcoming Bookings — moved below Today's Status */}
        <Card>
          <CardHeader
            title="Upcoming"
            icon={<CalendarDays size={16} className="text-purple-500" />}
            action={
              allActiveBookings.length > 0 ? (
                <button
                  onClick={() => setShowAllActive(true)}
                  className="text-xs text-purple-500 font-medium"
                >
                  See All ({allActiveBookings.length})
                </button>
              ) : undefined
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
                    onCancel={(b) => setCancelTarget({ booking: b, mode: 'cancel' })}
                    onNoShow={(b) => setCancelTarget({ booking: b, mode: 'noshow' })}
                    availabilityStatus={availForDay(new Date(booking.dateTime))?.status}
                  />
                )
              })}
            </div>
          )}
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card onClick={() => onNavigateTab(1)}>
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

          <Card onClick={() => onNavigateTab(2)}>
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
                      <StatusBadge text={booking.status} color={bookingStatusColors[booking.status]} />
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

      </div>

      <BackupRestoreModal isOpen={showBackup} onClose={() => { setShowBackup(false); setReminderDismissed(true) }} />
      <ProfilePage isOpen={showProfile} onClose={() => setShowProfile(false)} />
      <IncallBookPage isOpen={showIncallBook} onClose={() => setShowIncallBook(false)} />

      {/* All Active Bookings Modal */}
      {showAllActive && (
        <AllActiveBookingsModal
          bookings={allActiveBookings}
          clientFor={clientForBooking}
          availForDay={availForDay}
          onClose={() => setShowAllActive(false)}
          onOpenBooking={(id) => { setShowAllActive(false); onOpenBooking(id) }}
          onCancel={(b) => setCancelTarget({ booking: b, mode: 'cancel' })}
          onNoShow={(b) => setCancelTarget({ booking: b, mode: 'noshow' })}
        />
      )}

      {/* Cancellation sheet */}
      <CancellationSheet
        booking={cancelTarget?.booking ?? null}
        mode={cancelTarget?.mode ?? 'cancel'}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  )
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// All Active Bookings Modal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AllActiveBookingsModal({
  bookings, clientFor, availForDay, onClose, onOpenBooking, onCancel, onNoShow,
}: {
  bookings: import('../../types').Booking[]
  clientFor: (id?: string) => import('../../types').Client | undefined
  availForDay: (day: Date) => import('../../types').DayAvailability | undefined
  onClose: () => void
  onOpenBooking: (id: string) => void
  onCancel?: (booking: import('../../types').Booking) => void
  onNoShow?: (booking: import('../../types').Booking) => void
}) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      style={{
        backgroundColor: visible ? 'rgba(0,0,0,0.5)' : 'transparent',
        transition: 'background-color 0.2s',
      }}
      onClick={e => { if (e.target === backdropRef.current) handleClose() }}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--bg-card)',
          maxHeight: '80vh',
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
          <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
            Active Bookings ({bookings.length})
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {bookings.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
              No active bookings
            </p>
          ) : (
            <div className="space-y-2">
              {bookings.map(b => (
                <SwipeableBookingRow
                  key={b.id}
                  booking={b}
                  client={clientFor(b.clientId)}
                  onOpen={() => onOpenBooking(b.id)}
                  onCancel={onCancel}
                  onNoShow={onNoShow}
                  availabilityStatus={availForDay(new Date(b.dateTime))?.status}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
