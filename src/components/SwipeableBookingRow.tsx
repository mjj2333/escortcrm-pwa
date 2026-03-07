import { useRef, useState, useCallback, memo } from 'react'
import { isToday, isTomorrow, differenceInDays, startOfDay, addMinutes } from 'date-fns'
import { Check, X, Play, DollarSign, UserCheck, AlertTriangle } from 'lucide-react'
import { db, newId, formatCurrency, bookingTotal, bookingDurationFormatted, completeBookingPayment, recordBookingPayment } from '../db'
import { StatusBadge } from './StatusBadge'
import { showToast } from './Toast'
import { MiniTags } from './TagPicker'
import { VerifiedBadge } from './VerifiedBadge'
import { fmtTime, fmtWeekday, fmtShortDayDate } from '../utils/dateFormat'
import { bookingStatusColors, screeningStatusColors } from '../types'
import type { Booking, BookingStatus, Client, ScreeningStatus, AvailabilityStatus } from '../types'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatRelativeDate(dt: Date): string {
  if (isToday(dt)) return `Today · ${fmtTime(dt)}`
  if (isTomorrow(dt)) return `Tomorrow · ${fmtTime(dt)}`
  const daysAway = differenceInDays(startOfDay(dt), startOfDay(new Date()))
  if (daysAway > 1 && daysAway <= 6) return `${fmtWeekday(dt)} · ${fmtTime(dt)}`
  return `${fmtShortDayDate(dt)} · ${fmtTime(dt)}`
}

const availDotColors: Record<AvailabilityStatus, string> = {
  'Available': '#22c55e',
  'Limited': '#f97316',
  'Busy': '#ef4444',
  'Off': '#6b7280',
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACTION BLOCK — compact square with icon + label
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ActionDef {
  label: string
  Icon: typeof Check
  color: string
  bg: string
  onTap: () => void
}

function ActionBlock({ action }: { action: ActionDef }) {
  return (
    <button type="button"
      onClick={e => { e.stopPropagation(); action.onTap() }}
      className="flex-1 flex flex-col items-center justify-center gap-1 active:opacity-70 h-full"
      style={{ backgroundColor: action.bg }}
    >
      <action.Icon size={18} color={action.color} />
      <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: action.color }}>
        {action.label}
      </span>
    </button>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Props {
  booking: Booking
  client?: Client
  onOpen: () => void
  onCompleted?: (booking: Booking) => void
  onCancel?: (booking: Booking) => void
  onNoShow?: (booking: Booking) => void
  availabilityStatus?: AvailabilityStatus
  depositPaid?: number
}

export const SwipeableBookingRow = memo(function SwipeableBookingRow({ booking, client, onOpen, onCompleted, onCancel, onNoShow, availabilityStatus, depositPaid = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const currentX = useRef(0)
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const isDragging = useRef(false)

  // Deposit tracking
  const totalDeposits = depositPaid
  const depositRemaining = booking.depositAmount - totalDeposits
  const depositFullyPaid = booking.depositAmount > 0 && depositRemaining <= 0

  const isTerminal = booking.status === 'Completed' || booking.status === 'Cancelled' || booking.status === 'No Show'

  // ━━━ Build contextual actions (max 3) ━━━
  const actions: ActionDef[] = []

  if (!isTerminal) {
    // Slot 1: Next status (always present for non-terminal)
    const nextMap: Partial<Record<BookingStatus, { status: BookingStatus; label: string; Icon: typeof Check; color: string; bg: string }>> = {
      'To Be Confirmed': { status: 'Pending Deposit', label: 'Advance',  Icon: Check,  color: '#fff', bg: '#3b82f6' },
      'Pending Deposit':  { status: 'Confirmed',      label: 'Confirm',  Icon: Check,  color: '#fff', bg: '#22c55e' },
      'Confirmed':        { status: 'In Progress',    label: 'Start',    Icon: Play,   color: '#fff', bg: '#14b8a6' },
      'In Progress':      { status: 'Completed',      label: 'Complete', Icon: Check,  color: '#fff', bg: '#22c55e' },
    }
    const next = nextMap[booking.status]
    if (next) {
      const targetStatus = next.status
      actions.push({
        label: next.label,
        Icon: next.Icon,
        color: next.color,
        bg: next.bg,
        onTap: () => setBookingStatus(targetStatus),
      })
    }

    // Slot 2: Deposit or Screening (contextual middle action)
    const clientIsScreened = client?.screeningStatus === 'Screened'
    if (booking.depositAmount > 0 && !depositFullyPaid) {
      actions.push({
        label: 'Deposit',
        Icon: DollarSign,
        color: '#fff',
        bg: '#f59e0b',
        onTap: recordRemainingDeposit,
      })
    } else if (client && !clientIsScreened) {
      actions.push({
        label: 'Screen',
        Icon: UserCheck,
        color: '#fff',
        bg: '#8b5cf6',
        onTap: setScreened,
      })
    }

    // Slot 3: Cancel or No-Show
    if (booking.status === 'Confirmed' || booking.status === 'In Progress') {
      actions.push({
        label: 'No-Show',
        Icon: AlertTriangle,
        color: '#fff',
        bg: '#ef4444',
        onTap: markNoShow,
      })
    } else {
      actions.push({
        label: 'Cancel',
        Icon: X,
        color: '#fff',
        bg: '#ef4444',
        onTap: () => setBookingStatus('Cancelled'),
      })
    }
  }

  // Panel width: sized to actions (each block ~75px)
  const BLOCK_WIDTH = 75
  const PANEL_WIDTH = isTerminal ? 0 : actions.length * BLOCK_WIDTH
  const SNAP_THRESHOLD = 50

  // ━━━ Gesture handling ━━━
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isTerminal) return
    startX.current = e.clientX
    currentX.current = 0
    isDragging.current = false
    setSwiping(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [isTerminal])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!swiping) return
    const dx = e.clientX - startX.current
    const clamped = Math.min(0, Math.max(-PANEL_WIDTH, dx))
    if (Math.abs(dx) > 5) isDragging.current = true
    currentX.current = clamped
    setOffset(clamped)
  }, [swiping, PANEL_WIDTH])

  const handlePointerUp = useCallback(() => {
    if (!swiping) return
    setSwiping(false)
    if (currentX.current < -SNAP_THRESHOLD) {
      setOffset(-PANEL_WIDTH)
    } else {
      setOffset(0)
    }
  }, [swiping, PANEL_WIDTH])

  const handlePointerCancel = useCallback(() => {
    setSwiping(false)
    setOffset(0)
  }, [])

  function handleClick() {
    if (!isDragging.current) onOpen()
  }

  function closePanel() {
    setOffset(0)
  }

  // ━━━ Action handlers ━━━
  async function recordRemainingDeposit() {
    if (depositRemaining <= 0 || booking.depositAmount === 0) return
    try {
      await recordBookingPayment({
        bookingId: booking.id,
        amount: depositRemaining,
        method: booking.depositMethod ?? booking.paymentMethod ?? 'Cash',
        label: 'Deposit',
        clientAlias: client?.alias,
      })
      if (navigator.vibrate) navigator.vibrate(15)
    } catch {
      showToast('Failed to record deposit', 'error')
    }
  }

  async function setBookingStatus(newStatus: BookingStatus) {
    if (isTerminal) return
    if (newStatus === 'Cancelled' && onCancel) {
      closePanel()
      setTimeout(() => onCancel(booking), 300)
      return
    }
    try {
      if (newStatus === 'Completed') {
        await db.transaction('rw', [db.bookings, db.payments, db.transactions, db.clients], async () => {
          const current = await db.bookings.get(booking.id)
          if (!current || current.status === 'Completed') return
          await db.bookings.update(booking.id, { status: 'Completed', completedAt: new Date() })
          await completeBookingPayment(current, client?.alias)
          if (booking.clientId) {
            await db.clients.update(booking.clientId, { lastSeen: new Date() })
          }
        })
      } else {
        const updates: Partial<Booking> = { status: newStatus }
        if (newStatus === 'Confirmed') updates.confirmedAt = new Date()
        if (newStatus === 'Cancelled') updates.cancelledAt = new Date()
        await db.bookings.update(booking.id, updates)
      }
      if (newStatus === 'In Progress' && booking.requiresSafetyCheck) {
        const existing = await db.safetyChecks.where('bookingId').equals(booking.id).first()
        if (!existing) {
          const sessionStart = Math.max(new Date(booking.dateTime).getTime(), Date.now())
          const checkTime = addMinutes(new Date(sessionStart), booking.safetyCheckMinutesAfter || 15)
          await db.safetyChecks.add({
            id: newId(),
            bookingId: booking.id,
            safetyContactId: booking.safetyContactId,
            scheduledTime: checkTime,
            bufferMinutes: 15,
            status: 'pending',
          })
        }
      }
      if (navigator.vibrate) navigator.vibrate(newStatus === 'Cancelled' ? [20, 50, 20] : 20)
      closePanel()
      if (newStatus === 'Completed' && onCompleted) {
        const freshForCallback = await db.bookings.get(booking.id)
        setTimeout(() => onCompleted(freshForCallback ?? booking), 300)
      }
    } catch {
      showToast('Failed to update booking status', 'error')
    }
  }

  async function markNoShow() {
    if (isTerminal) return
    if (onNoShow) {
      closePanel()
      setTimeout(() => onNoShow(booking), 300)
      return
    }
    try {
      await db.transaction('rw', [db.bookings, db.clients], async () => {
        await db.bookings.update(booking.id, {
          status: 'No Show' as BookingStatus,
          cancelledAt: new Date(),
        })
        if (booking.clientId) {
          const clientBookings = await db.bookings.where('clientId').equals(booking.clientId).toArray()
          const noShows = clientBookings.filter(b => b.status === 'No Show').length
          const currentClient = await db.clients.get(booking.clientId)
          if (currentClient) {
            let riskLevel = currentClient.riskLevel
            if (noShows >= 2) riskLevel = 'High Risk'
            else if (noShows >= 1 && (riskLevel === 'Unknown' || riskLevel === 'Low Risk')) riskLevel = 'Medium Risk'
            await db.clients.update(booking.clientId, { riskLevel })
          }
        }
      })
      if (navigator.vibrate) navigator.vibrate([20, 50, 20])
      closePanel()
    } catch {
      showToast('Failed to mark no-show', 'error')
    }
  }

  async function setScreened() {
    if (!client) return
    try {
      const oldStatus = client.screeningStatus
      await db.clients.update(client.id, { screeningStatus: 'Screened' as ScreeningStatus })
      const { advanceBookingsOnScreen } = await import('../db')
      await advanceBookingsOnScreen(client.id, oldStatus, 'Screened')
      if (navigator.vibrate) navigator.vibrate(15)
    } catch {
      showToast('Failed to update screening', 'error')
    }
  }

  const depositPartial = totalDeposits > 0 && depositRemaining > 0

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ touchAction: 'pan-y' }}>
      {/* Action panel behind — horizontal blocks */}
      {PANEL_WIDTH > 0 && (
        <div
          className="absolute inset-y-0 right-0 flex"
          aria-hidden={offset === 0}
          style={{ width: `${PANEL_WIDTH}px` }}
        >
          {actions.map((a, i) => (
            <ActionBlock key={i} action={a} />
          ))}
        </div>
      )}

      {/* Foreground card */}
      <div
        ref={containerRef}
        className="flex items-center gap-3 p-3 border cursor-pointer active:scale-[0.98] relative"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
          transform: `translateX(${offset}px)`,
          transition: swiping ? 'none' : 'transform 0.25s ease-out',
          borderRadius: '0.75rem',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        onContextMenu={e => e.preventDefault()}
      >
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
        >
          <span className="text-sm font-bold text-purple-500">
            {client?.alias?.charAt(0).toUpperCase() ?? '?'}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {client?.alias ?? 'Unknown'}<VerifiedBadge client={client} size={13} />
          </p>
          <div className="flex items-center gap-1.5">
            {availabilityStatus && (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                title={availabilityStatus}
                style={{ backgroundColor: availDotColors[availabilityStatus] }}
              />
            )}
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {formatRelativeDate(new Date(booking.dateTime))} · {bookingDurationFormatted(booking.duration)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {client?.tags && <MiniTags tags={client.tags} />}
            {booking.recurrence && booking.recurrence !== 'none' && (
              <span className="text-[9px] text-purple-500 font-medium">🔄 {booking.recurrence === 'weekly' ? 'Weekly' : booking.recurrence === 'biweekly' ? 'Biweekly' : 'Monthly'}</span>
            )}
          </div>
        </div>

        {/* Right side: status + price + indicators */}
        <div className="text-right shrink-0">
          <StatusBadge text={booking.status} color={bookingStatusColors[booking.status]} />
          <p className="text-xs font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>
            {formatCurrency(bookingTotal(booking))}
          </p>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            {booking.depositAmount > 0 && (
              <span className="text-[9px]" title={depositFullyPaid ? 'Deposit received' : depositPartial ? 'Deposit partial' : 'Deposit pending'}>
                {depositFullyPaid ? '💰' : depositPartial ? '💸' : '⏳'}
              </span>
            )}
            {client && (
              <span
                className="w-1.5 h-1.5 rounded-full"
                title={`Screening: ${client.screeningStatus}`}
                style={{ backgroundColor: screeningStatusColors[client.screeningStatus] === 'orange' ? '#f59e0b' : screeningStatusColors[client.screeningStatus] === 'green' ? '#22c55e' : screeningStatusColors[client.screeningStatus] === 'blue' ? '#3b82f6' : '#ef4444' }}
              />
            )}
          </div>
        </div>

        {/* Swipe hint */}
        {offset === 0 && !isTerminal && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-10 rounded-l-full"
            style={{ backgroundColor: '#a855f7', opacity: 0.35 }} />
        )}
      </div>
    </div>
  )
})
