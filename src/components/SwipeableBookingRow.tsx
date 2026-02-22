import { useRef, useState, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { format, isToday, isTomorrow, differenceInDays, startOfDay } from 'date-fns'
import { db, formatCurrency, bookingTotal, bookingDurationFormatted, completeBookingPayment, recordBookingPayment, removeBookingPayment as removePayment } from '../db'
import { StatusBadge } from './StatusBadge'
import { MiniTags } from './TagPicker'
import { VerifiedBadge } from './VerifiedBadge'
import { bookingStatusColors, screeningStatusColors } from '../types'
import type { Booking, BookingStatus, Client, ScreeningStatus, AvailabilityStatus } from '../types'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatRelativeDate(dt: Date): string {
  if (isToday(dt)) return `Today · ${format(dt, 'h:mm a')}`
  if (isTomorrow(dt)) return `Tomorrow · ${format(dt, 'h:mm a')}`
  const daysAway = differenceInDays(startOfDay(dt), startOfDay(new Date()))
  if (daysAway > 1 && daysAway <= 6) return `${format(dt, 'EEEE')} · ${format(dt, 'h:mm a')}`
  return format(dt, 'EEE, MMM d · h:mm a')
}

const availDotColors: Record<AvailabilityStatus, string> = {
  'Available': '#22c55e',
  'Limited': '#f97316',
  'Busy': '#ef4444',
  'Off': '#6b7280',
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STATUS FLOW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PILL COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ActionPill({ label, active, color, onTap }: {
  label: string; active: boolean; color: string; onTap: () => void
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onTap() }}
      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0 transition-all"
      style={{
        backgroundColor: active ? `${color}` : 'rgba(255,255,255,0.08)',
        color: active ? '#fff' : 'rgba(255,255,255,0.5)',
        textShadow: active ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
        minWidth: '38px',
        textAlign: 'center',
      }}
    >
      {label}
    </button>
  )
}

function ActionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-2">
      <span className="text-[8px] font-bold uppercase tracking-wider w-[44px] shrink-0"
        style={{ color: 'rgba(255,255,255,0.45)' }}>
        {label}
      </span>
      <div className="flex gap-1 flex-1 justify-end">
        {children}
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Props {
  booking: Booking
  client?: Client
  onOpen: () => void
  onCompleted?: (booking: Booking) => void
  availabilityStatus?: AvailabilityStatus
}

export function SwipeableBookingRow({ booking, client, onOpen, onCompleted, availabilityStatus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const currentX = useRef(0)
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const isDragging = useRef(false)

  // Live deposit payment tracking
  const depositPayments = useLiveQuery(
    () => db.payments.where('bookingId').equals(booking.id).filter(p => p.label === 'Deposit').toArray(),
    [booking.id]
  ) ?? []
  const totalDeposits = depositPayments.reduce((sum, p) => sum + p.amount, 0)
  const depositRemaining = booking.depositAmount - totalDeposits
  const depositFullyPaid = booking.depositAmount > 0 && depositRemaining <= 0
  const depositPartial = totalDeposits > 0 && depositRemaining > 0


  // Panel width
  const PANEL_WIDTH = 280
  const SNAP_THRESHOLD = 60

  // ━━━ Gesture handling ━━━
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    startX.current = e.clientX
    currentX.current = 0
    isDragging.current = false
    setSwiping(true)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!swiping) return
    const dx = e.clientX - startX.current
    const clamped = Math.min(0, Math.max(-PANEL_WIDTH, dx))
    if (Math.abs(dx) > 5) isDragging.current = true
    currentX.current = clamped
    setOffset(clamped)
  }, [swiping])

  const handlePointerUp = useCallback(() => {
    if (!swiping) return
    setSwiping(false)
    if (currentX.current < -SNAP_THRESHOLD) {
      setOffset(-PANEL_WIDTH)
    } else {
      setOffset(0)
    }
  }, [swiping])

  const handlePointerCancel = useCallback(() => {
    setSwiping(false)
    setOffset(0)
  }, [])

  function handleClick() {
    if (!isDragging.current) onOpen()
  }

  // Close panel
  function closePanel() {
    setOffset(0)
  }

  // ━━━ Actions ━━━
  async function recordRemainingDeposit() {
    if (depositRemaining <= 0 || booking.depositAmount === 0) return
    await recordBookingPayment({
      bookingId: booking.id,
      amount: depositRemaining,
      method: booking.depositMethod,
      label: 'Deposit',
      clientAlias: client?.alias,
    })
    if (navigator.vibrate) navigator.vibrate(15)
  }

  async function removeAllDeposits() {
    if (totalDeposits === 0) return
    // Remove all deposit payments for this booking
    const allDeposits = await db.payments
      .where('bookingId').equals(booking.id)
      .filter(p => p.label === 'Deposit')
      .toArray()
    for (const dep of allDeposits) {
      await removePayment(dep.id)
    }
    if (navigator.vibrate) navigator.vibrate(15)
  }

  async function setScreening(status: ScreeningStatus) {
    if (!client) return
    await db.clients.update(client.id, { screeningStatus: status })
    if (navigator.vibrate) navigator.vibrate(15)
  }

  async function setBookingStatus(newStatus: BookingStatus) {
    const updates: Partial<Booking> = { status: newStatus }

    if (newStatus === 'Confirmed') {
      updates.confirmedAt = new Date()
    }

    if (newStatus === 'Completed') {
      updates.completedAt = new Date()
      // Record remaining payment via ledger
      await completeBookingPayment(booking, client?.alias)
      // Update client lastSeen
      if (booking.clientId) {
        await db.clients.update(booking.clientId, { lastSeen: new Date() })
      }
    }

    if (newStatus === 'Cancelled') {
      updates.cancelledAt = new Date()
    }

    await db.bookings.update(booking.id, updates)
    if (navigator.vibrate) navigator.vibrate(newStatus === 'Cancelled' ? [20, 50, 20] : 20)
    closePanel()
    if (newStatus === 'Completed' && onCompleted) {
      // Small delay so the panel closes first
      setTimeout(() => onCompleted(booking), 300)
    }
  }

  async function markNoShow() {
    await db.bookings.update(booking.id, {
      status: 'No Show' as BookingStatus,
      cancelledAt: new Date(),
    })
    // Escalate client risk level based on no-show count
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
    if (navigator.vibrate) navigator.vibrate([20, 50, 20])
    closePanel()
  }

  // Booking status pills — simplified (Screening and Pending Deposit removed — they have their own rows)
  const statusFlowPills: { status: BookingStatus; label: string; color: string }[] = [
    { status: 'To Be Confirmed', label: 'To Be Confirmed', color: '#a855f7' },
    { status: 'Confirmed',       label: 'Confirmed',       color: '#22c55e' },
  ]
  // Row 2: Session / terminal statuses
  const statusSessionPills: { status: BookingStatus; label: string; color: string }[] = [
    { status: 'In Progress', label: 'In Progress', color: '#14b8a6' },
    { status: 'Completed',   label: 'Completed',   color: '#6b7280' },
  ]

  const screeningPills: { status: ScreeningStatus; label: string; color: string }[] = [
    { status: 'Unscreened',   label: 'Unscreened',   color: '#f59e0b' },
    { status: 'In Progress',  label: 'In Progress',  color: '#3b82f6' },
    { status: 'Screened',     label: 'Screened',      color: '#22c55e' },
  ]

  const isVerified = client?.screeningStatus === 'Screened'

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ touchAction: 'pan-y' }}>
      {/* Action panel behind */}
      <div
        className="absolute inset-y-0 right-0 flex flex-col justify-center gap-1.5 py-1.5"
        style={{
          width: `${PANEL_WIDTH}px`,
          background: 'linear-gradient(135deg, #1e1b2e, #1a1a2e)',
        }}
      >
        {/* Unverified: show only screening row */}
        {!isVerified && (
          <ActionRow label="Screen">
            {screeningPills.map(p => (
              <ActionPill
                key={p.status}
                label={p.label}
                active={client?.screeningStatus === p.status}
                color={p.color}
                onTap={() => setScreening(p.status)}
              />
            ))}
          </ActionRow>
        )}

        {/* Verified: show deposit, status, and session rows */}
        {isVerified && (
          <>
            {/* Row 1: Deposit */}
            <ActionRow label="Deposit">
              <ActionPill
                label="Pending"
                active={booking.depositAmount > 0 && totalDeposits === 0}
                color="#f59e0b"
                onTap={totalDeposits > 0 ? removeAllDeposits : () => {}}
              />
              {depositPartial && (
                <ActionPill
                  label="Partial"
                  active={true}
                  color="#f97316"
                  onTap={() => {}}
                />
              )}
              <ActionPill
                label="Received"
                active={depositFullyPaid}
                color="#22c55e"
                onTap={!depositFullyPaid ? recordRemainingDeposit : () => {}}
              />
            </ActionRow>

            {/* Row 2: Booking Status */}
            <ActionRow label="Status">
              {statusFlowPills.map(p => (
                <ActionPill
                  key={p.status}
                  label={p.label}
                  active={booking.status === p.status}
                  color={p.color}
                  onTap={() => {
                    if (p.status !== booking.status) setBookingStatus(p.status)
                  }}
                />
              ))}
            </ActionRow>

            {/* Row 3: Session / terminal statuses + cancel */}
            <ActionRow label="">
              {statusSessionPills.map(p => (
                <ActionPill
                  key={p.status}
                  label={p.label}
                  active={booking.status === p.status}
                  color={p.color}
                  onTap={() => {
                    if (p.status !== booking.status) setBookingStatus(p.status)
                  }}
                />
              ))}
              <ActionPill
                label="Cancel"
                active={booking.status === 'Cancelled'}
                color="#ef4444"
                onTap={() => setBookingStatus('Cancelled')}
              />
              <ActionPill
                label="No Show"
                active={booking.status === 'No Show'}
                color="#ef4444"
                onTap={() => markNoShow()}
              />
            </ActionRow>
          </>
        )}
      </div>

      {/* Foreground card */}
      <div
        ref={containerRef}
        className="flex items-center gap-3 p-3 border cursor-pointer active:scale-[0.98] relative"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
          transform: `translateX(${offset}px)`,
          transition: swiping ? 'none' : 'transform 0.25s ease-out',
          borderRadius: 'var(--radius-xl)',
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
          {/* Mini indicators row */}
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

        {/* Swipe hint edge indicator */}
        {offset === 0 && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-l-full opacity-20"
            style={{ backgroundColor: '#a855f7' }} />
        )}
      </div>
    </div>
  )
}
