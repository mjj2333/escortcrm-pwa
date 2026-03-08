import { useLiveQuery } from 'dexie-react-hooks'
import {
  Settings, Clock, CalendarDays, DollarSign, Users,
  ChevronRight, ShieldAlert, TrendingUp, Cake, Bell, Database, X, CircleUser, Building2, UserCheck
} from 'lucide-react'
import { startOfDay, endOfDay, startOfWeek, startOfMonth, isToday, differenceInDays, isSameDay } from 'date-fns'
import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense, useReducer } from 'react'
import { useScrollLock } from '../../hooks/useScrollLock'
import { db, formatCurrency, isUpcoming, bookingTotal } from '../../db'
import { PageHeader } from '../../components/PageHeader'
import { Card, CardHeader } from '../../components/Card'
import { StatusBadge } from '../../components/StatusBadge'
import { EmptyState } from '../../components/EmptyState'
import { SwipeableBookingRow } from '../../components/SwipeableBookingRow'
import { CancellationSheet } from '../../components/CancellationSheet'
import { JournalEntryEditor } from '../../components/JournalEntryEditor'
import { isPro } from '../../components/planLimits'
import { SampleDataBanner } from '../../components/SampleDataBanner'
import { formatTime12 } from '../../utils/availability'
import { availabilityStatusColors, bookingStatusColors } from '../../types'
import type { Booking } from '../../types'
import { useLocalStorage } from '../../hooks/useSettings'
import { useBackupReminder } from '../../hooks/useBackupReminder'
import { HomePageSkeleton } from '../../components/Skeleton'
import { computeFollowUps } from '../../utils/followUpReminders'
import { AvailabilityPicker } from '../schedule/AvailabilityPicker'
import { BookingEditor } from '../schedule/BookingEditor'

// Lazy-load heavy modals — only fetched when opened by user tap
const ProfilePage = lazy(() => import('./ProfilePage').then(m => ({ default: m.ProfilePage })))
const IncallBookPage = lazy(() => import('./IncallBookPage').then(m => ({ default: m.IncallBookPage })))
const BackupRestoreModal = lazy(() => import('../../components/BackupRestore').then(m => ({ default: m.BackupRestoreModal })))
import { GettingStarted, useGettingStartedDone } from '../../components/GettingStarted'
import { DidYouKnowTip } from '../../components/DidYouKnowTip'

interface HomePageProps {
  onNavigateTab: (tab: number) => void
  onOpenSettings: () => void
  onOpenBooking: (bookingId: string) => void
  onOpenClient: (clientId: string) => void
}

export function HomePage({ onNavigateTab, onOpenSettings, onOpenBooking, onOpenClient }: HomePageProps) {
  // Force re-render at midnight so date-dependent data stays fresh
  const [tick, forceRefresh] = useReducer(x => x + 1, 0)
  useEffect(() => {
    const msUntilMidnight = endOfDay(new Date()).getTime() - Date.now() + 1000
    const timer = setTimeout(forceRefresh, msUntilMidnight)
    return () => clearTimeout(timer)
  }, [tick])

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])
  const todayStart = useMemo(() => startOfDay(now), [now])
  const todayEnd = useMemo(() => endOfDay(now), [now])
  const weekStart = useMemo(() => startOfWeek(now, { weekStartsOn: 1 }), [now])
  const monthStart = useMemo(() => startOfMonth(now), [now])

  const [showAllActive, setShowAllActive] = useState(false)
  const [showAllBalances, setShowAllBalances] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showIncallBook, setShowIncallBook] = useState(false)
  const [showAvailPicker, setShowAvailPicker] = useState(false)
  const [remindersEnabled] = useLocalStorage('remindersEnabled', false)
  const [showBackup, setShowBackup] = useState(false)
  const [reminderDismissed, setReminderDismissed] = useState(() => sessionStorage.getItem('backupReminderDismissed') === '1')
  const dismissReminder = () => { sessionStorage.setItem('backupReminderDismissed', '1'); setReminderDismissed(true) }
  const [cancelTarget, setCancelTarget] = useState<{ booking: Booking; mode: 'cancel' | 'noshow' } | null>(null)
  const [journalBooking, setJournalBooking] = useState<Booking | null>(null)
  const noop = useCallback(() => {}, [])
  const handleBookingCompleted = isPro() ? setJournalBooking : noop
  const [bookClientId, setBookClientId] = useState<string | null>(null)
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

  const availForDay = (day: Date) =>
    availability.find(a => isSameDay(new Date(a.date), day))

  const showNotificationPrompt = !remindersEnabled && 'Notification' in window && Notification.permission === 'default'

  const safeBookings = allBookings ?? []

  const todaysBookings = useMemo(() => safeBookings.filter(b => {
    if (b.status === 'Cancelled' || b.status === 'No Show') return false
    const start = new Date(b.dateTime)
    if (isToday(start)) return true
    // Include overnight sessions that started yesterday but end today
    const endMs = start.getTime() + b.duration * 60_000
    return start < todayStart && endMs > todayStart.getTime()
  }), [safeBookings, todayStart])

  const upcoming = useMemo(() => safeBookings
    .filter(b => isUpcoming(b, now))
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
    .slice(0, 5), [safeBookings, now])

  // All bookings not yet completed (for "See All" modal)
  const allActiveBookings = useMemo(() => safeBookings
    .filter(b => !['Completed', 'Cancelled', 'No Show'].includes(b.status))
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()), [safeBookings])

  const weekIncome = useMemo(() => transactions
    .filter(t => t.type === 'income' && new Date(t.date) >= weekStart)
    .reduce((sum, t) => sum + t.amount, 0), [transactions, weekStart])

  const monthIncome = useMemo(() => transactions
    .filter(t => t.type === 'income' && new Date(t.date) >= monthStart)
    .reduce((sum, t) => sum + t.amount, 0), [transactions, monthStart])

  const pendingScreenings = useMemo(() => clients.filter(
    c => c.screeningStatus === 'Unscreened' || c.screeningStatus === 'In Progress'
  ).length, [clients])

  // Upcoming birthdays (next 30 days)
  const upcomingBirthdays = useMemo(() => clients
    .filter(c => c.birthday && !c.isBlocked)
    .map(c => {
      const bday = new Date(c.birthday!)
      // Find next birthday — clamp Feb 29 to Feb 28 in non-leap years
      const bdayMonth = bday.getMonth()
      const bdayDay = bday.getDate()
      let year = now.getFullYear()
      let next = new Date(year, bdayMonth, bdayDay)
      // If Date constructor overflowed (e.g. Feb 29 → Mar 1), clamp to last day of month
      if (next.getMonth() !== bdayMonth) next = new Date(year, bdayMonth + 1, 0)
      if (next < todayStart) {
        year += 1
        next = new Date(year, bdayMonth, bdayDay)
        if (next.getMonth() !== bdayMonth) next = new Date(year, bdayMonth + 1, 0)
      }
      const daysUntil = differenceInDays(next, todayStart)
      return { client: c, daysUntil, nextBirthday: next }
    })
    .filter(b => b.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil), [clients, now, todayStart])

  // Follow-up reminders (overdue clients based on booking frequency)
  const followUpReminders = useMemo(() =>
    computeFollowUps(clients, safeBookings, now).slice(0, 5), [clients, safeBookings, now])

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  const clientForBooking = (clientId?: string) =>
    clientId ? clientMap.get(clientId) : undefined

  // Pre-build payment lookup to avoid O(n*m) nested filters
  const paymentsByBookingId = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of allPayments) {
      if (p.label === 'Tip') continue
      map.set(p.bookingId, (map.get(p.bookingId) ?? 0) + p.amount)
    }
    return map
  }, [allPayments])

  // Pre-compute deposit totals per booking to avoid per-row useLiveQuery subscriptions
  const depositByBooking = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of allPayments) {
      if (p.label === 'Deposit') map.set(p.bookingId, (map.get(p.bookingId) ?? 0) + p.amount)
    }
    return map
  }, [allPayments])

  // Outstanding balances — bookings with unpaid amounts (only Pending Deposit+ stages)
  const bookingsWithBalance = useMemo(() => safeBookings
    .filter(b => b.status === 'Pending Deposit' || b.status === 'Confirmed' || b.status === 'In Progress' || b.status === 'Completed')
    .map(b => {
      const total = bookingTotal(b)
      const paid = paymentsByBookingId.get(b.id) ?? 0
      const owing = total - paid
      return { booking: b, owing, client: clientForBooking(b.clientId) }
    })
    .filter(x => x.owing > 0)
    .sort((a, b) => b.owing - a.owing), [safeBookings, paymentsByBookingId, clientMap])

  const totalOutstanding = useMemo(() => bookingsWithBalance.reduce((sum, x) => sum + x.owing, 0), [bookingsWithBalance])

  if (allBookings === undefined) return <HomePageSkeleton />

  return (
    <div className="pb-20">
      <PageHeader title="Home">
        <button type="button"
          onClick={() => setShowIncallBook(true)}
          className="p-2 rounded-lg active:opacity-60 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Incall Book"
        >
          <Building2 size={20} />
        </button>
        <button type="button"
          onClick={() => setShowProfile(true)}
          className="p-2 rounded-lg active:opacity-60 transition-colors relative"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Profile"
        >
          <CircleUser size={20} />
          {!profileSetupDone && (
            <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-purple-500" />
          )}
        </button>
        <button type="button"
          onClick={onOpenSettings}
          className="p-2 rounded-lg active:opacity-60 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Settings"
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
            <button type="button"
              onClick={() => setShowBackup(true)}
              className="text-xs font-medium underline mt-0.5"
              style={{ color: '#a855f7' }}
            >
              Back up now
            </button>
          </div>
          <button type="button"
            onClick={dismissReminder}
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
          <button type="button"
            className="w-full rounded-xl p-4 flex items-center gap-3 text-left"
            style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}
            onClick={() => onNavigateTab(4)}
          >
            <ShieldAlert size={24} className="text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-500 text-sm">
                {safetyChecks.length} Pending Check-in{safetyChecks.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-red-500">Tap to review</p>
            </div>
            <ChevronRight size={16} className="text-red-500" />
          </button>
        )}

        {/* Availability Status */}
        <Card onClick={() => setShowAvailPicker(true)}>
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
                <button type="button"
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
                    onCompleted={handleBookingCompleted}
                    onCancel={(b) => setCancelTarget({ booking: b, mode: 'cancel' })}
                    onNoShow={(b) => setCancelTarget({ booking: b, mode: 'noshow' })}
                    availabilityStatus={availForDay(new Date(booking.dateTime))?.status}
                    depositPaid={depositByBooking.get(booking.id) ?? 0}
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
              {(showAllBalances ? bookingsWithBalance : bookingsWithBalance.slice(0, 4)).map(({ booking, owing, client: c }) => (
                <button type="button"
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
              {bookingsWithBalance.length > 4 && !showAllBalances && (
                <button type="button"
                  onClick={() => setShowAllBalances(true)}
                  className="text-[10px] text-center w-full py-1 font-medium"
                  style={{ color: '#a855f7' }}
                >
                  +{bookingsWithBalance.length - 4} more
                </button>
              )}
            </div>
          </Card>
        )}

        {/* Follow-Up Reminders */}
        {followUpReminders.length > 0 && (
          <Card>
            <CardHeader
              title="Follow-Up Due"
              icon={<UserCheck size={16} className="text-blue-500" />}
            />
            <div className="space-y-2">
              {followUpReminders.map(({ clientId, avgIntervalDays, daysSinceLastSeen, daysOverdue }) => {
                const c = clientMap.get(clientId)
                if (!c) return null
                return (
                  <div
                    key={clientId}
                    role="button" tabIndex={0}
                    onClick={() => onOpenClient(clientId)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenClient(clientId) } }}
                    className="flex items-center gap-3 w-full text-left py-1.5 cursor-pointer"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'rgba(59,130,246,0.15)' }}
                    >
                      <span className="text-xs font-bold" style={{ color: '#3b82f6' }}>
                        {c.alias.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {c.alias}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        Every ~{avgIntervalDays}d — last seen {daysSinceLastSeen}d ago
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold text-orange-500">
                        {daysOverdue}d overdue
                      </span>
                      {c.screeningStatus === 'Screened' && (
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); setBookClientId(c.id) }}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7' }}
                        >
                          Book
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Notification Prompt */}
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
              <button type="button"
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
                <div
                  key={c.id}
                  role="button" tabIndex={0}
                  onClick={() => onOpenClient(c.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenClient(c.id) } }}
                  className="flex items-center gap-3 w-full text-left py-1.5 cursor-pointer"
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
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold" style={{
                      color: daysUntil === 0 ? '#ec4899' : 'var(--text-secondary)'
                    }}>
                      {daysUntil === 0 ? '🎂 Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                    </span>
                    {c.screeningStatus === 'Screened' && (
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); setBookClientId(c.id) }}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7' }}
                      >
                        Book
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

      </div>

      <Suspense fallback={null}>
        {showBackup && <BackupRestoreModal isOpen={showBackup} onClose={() => { setShowBackup(false); dismissReminder() }} />}
        {showProfile && <ProfilePage isOpen={showProfile} onClose={() => setShowProfile(false)} />}
        {showIncallBook && <IncallBookPage isOpen={showIncallBook} onClose={() => setShowIncallBook(false)} />}
      </Suspense>

      {/* Availability picker from Home tab */}
      {showAvailPicker && (
        <AvailabilityPicker
          date={todayStart}
          current={todayAvailability ?? undefined}
          onClose={() => setShowAvailPicker(false)}
        />
      )}

      {/* Quick-book from birthday card */}
      {bookClientId && (
        <BookingEditor isOpen={!!bookClientId} onClose={() => setBookClientId(null)} preselectedClientId={bookClientId} />
      )}

      {/* All Active Bookings Modal */}
      {showAllActive && (
        <AllActiveBookingsModal
          bookings={allActiveBookings}
          clientFor={clientForBooking}
          availForDay={availForDay}
          onClose={() => setShowAllActive(false)}
          onOpenBooking={(id) => { setShowAllActive(false); onOpenBooking(id) }}
          onCompleted={handleBookingCompleted}
          onCancel={(b) => setCancelTarget({ booking: b, mode: 'cancel' })}
          onNoShow={(b) => setCancelTarget({ booking: b, mode: 'noshow' })}
          depositByBooking={depositByBooking}
        />
      )}

      {/* Journal prompt after booking completion */}
      {journalBooking && (
        <JournalEntryEditor
          isOpen={!!journalBooking}
          onClose={() => setJournalBooking(null)}
          booking={journalBooking}
          clientAlias={clientForBooking(journalBooking.clientId)?.alias}
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
  bookings, clientFor, availForDay, onClose, onOpenBooking, onCompleted, onCancel, onNoShow, depositByBooking,
}: {
  bookings: import('../../types').Booking[]
  clientFor: (id?: string) => import('../../types').Client | undefined
  availForDay: (day: Date) => import('../../types').DayAvailability | undefined
  onClose: () => void
  onOpenBooking: (id: string) => void
  onCompleted?: (booking: import('../../types').Booking) => void
  onCancel?: (booking: import('../../types').Booking) => void
  onNoShow?: (booking: import('../../types').Booking) => void
  depositByBooking?: Map<string, number>
}) {
  useScrollLock(true)
  const backdropRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 250)
  }, [onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="All active bookings"
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
          <button type="button"
            onClick={handleClose}
            className="p-2 rounded-lg"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close"
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
                  onCompleted={onCompleted}
                  onCancel={onCancel}
                  onNoShow={onNoShow}
                  availabilityStatus={availForDay(new Date(b.dateTime))?.status}
                  depositPaid={depositByBooking?.get(b.id) ?? 0}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
