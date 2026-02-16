import { useRef, useState, useCallback } from 'react'
import { ChevronRight, X } from 'lucide-react'
import { format } from 'date-fns'
import { db, formatCurrency, bookingTotal, bookingDurationFormatted, newId } from '../db'
import { StatusBadge } from './StatusBadge'
import { MiniTags } from './TagPicker'
import { bookingStatusColors } from '../types'
import type { Booking, BookingStatus, Client } from '../types'

const STATUS_FLOW: BookingStatus[] = [
  'Inquiry', 'Screening', 'Pending Deposit', 'Confirmed', 'In Progress', 'Completed'
]

function nextStatus(current: BookingStatus): BookingStatus | null {
  const idx = STATUS_FLOW.indexOf(current)
  if (idx === -1 || idx >= STATUS_FLOW.length - 1) return null
  return STATUS_FLOW[idx + 1]
}

function nextStatusLabel(current: BookingStatus): string {
  const next = nextStatus(current)
  if (!next) return ''
  switch (next) {
    case 'Screening': return 'Screen'
    case 'Pending Deposit': return 'Pending'
    case 'Confirmed': return 'Confirm'
    case 'In Progress': return 'Start'
    case 'Completed': return 'Complete'
    default: return next
  }
}

interface Props {
  booking: Booking
  client?: Client
  onOpen: () => void
}

export function SwipeableBookingRow({ booking, client, onOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const currentX = useRef(0)
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const isDragging = useRef(false)

  const canAdvance = nextStatus(booking.status) !== null
  const canCancel = booking.status !== 'Completed' && booking.status !== 'Cancelled' && booking.status !== 'No Show'
  const hasActions = canAdvance || canCancel

  // Thresholds
  const ADVANCE_WIDTH = 80
  const CANCEL_WIDTH = 160
  const SNAP_THRESHOLD = 40

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!hasActions) return
    startX.current = e.clientX
    currentX.current = 0
    isDragging.current = false
    setSwiping(true)
  }, [hasActions])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!swiping) return
    const dx = e.clientX - startX.current
    // Only allow left swipe (negative)
    const clamped = Math.min(0, Math.max(-CANCEL_WIDTH, dx))
    if (Math.abs(dx) > 5) isDragging.current = true
    currentX.current = clamped
    setOffset(clamped)
  }, [swiping])

  const handlePointerUp = useCallback(() => {
    if (!swiping) return
    setSwiping(false)

    // Snap logic
    if (currentX.current < -ADVANCE_WIDTH - SNAP_THRESHOLD && canCancel) {
      // Snap to show cancel
      setOffset(-CANCEL_WIDTH)
    } else if (currentX.current < -SNAP_THRESHOLD && canAdvance) {
      // Snap to show advance
      setOffset(-ADVANCE_WIDTH)
    } else {
      setOffset(0)
    }
  }, [swiping, canAdvance, canCancel])

  const handlePointerCancel = useCallback(() => {
    setSwiping(false)
    setOffset(0)
  }, [])

  async function handleAdvance() {
    const next = nextStatus(booking.status)
    if (!next) return

    const updates: Partial<Booking> = { status: next }

    // If completing, record payment and create transaction
    if (next === 'Completed') {
      updates.completedAt = new Date()
      updates.paymentReceived = true

      // Create income transaction
      await db.transactions.add({
        id: newId(),
        bookingId: booking.id,
        amount: bookingTotal(booking),
        type: 'income',
        category: 'booking',
        date: new Date(),
        notes: `Booking with ${client?.alias ?? 'client'}`,
      })
    }

    await db.bookings.update(booking.id, updates)
    if (navigator.vibrate) navigator.vibrate(20)
    setOffset(0)
  }

  async function handleCancel() {
    await db.bookings.update(booking.id, { status: 'Cancelled' })
    if (navigator.vibrate) navigator.vibrate([20, 50, 20])
    setOffset(0)
  }

  function handleClick() {
    if (!isDragging.current) onOpen()
  }

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ touchAction: 'pan-y' }}>
      {/* Action buttons behind */}
      <div className="absolute inset-y-0 right-0 flex">
        {canAdvance && (
          <button
            onClick={handleAdvance}
            className="flex flex-col items-center justify-center text-white font-semibold text-xs"
            style={{ width: `${ADVANCE_WIDTH}px`, backgroundColor: '#22c55e' }}
          >
            <ChevronRight size={18} />
            <span className="mt-0.5">{nextStatusLabel(booking.status)}</span>
          </button>
        )}
        {canCancel && (
          <button
            onClick={handleCancel}
            className="flex flex-col items-center justify-center text-white font-semibold text-xs"
            style={{ width: `${CANCEL_WIDTH - ADVANCE_WIDTH}px`, backgroundColor: '#ef4444' }}
          >
            <X size={18} />
            <span className="mt-0.5">Cancel</span>
          </button>
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
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
        >
          <span className="text-sm font-bold text-purple-500">
            {client?.alias?.charAt(0).toUpperCase() ?? '?'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {client?.alias ?? 'Unknown'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {format(new Date(booking.dateTime), 'EEE, MMM d · h:mm a')} · {bookingDurationFormatted(booking.duration)}
          </p>
          {client?.tags && <MiniTags tags={client.tags} />}
          {booking.recurrence && booking.recurrence !== 'none' && (
            <span className="text-[9px] text-purple-500 font-medium">🔄 {booking.recurrence === 'weekly' ? 'Weekly' : booking.recurrence === 'biweekly' ? 'Biweekly' : 'Monthly'}</span>
          )}
        </div>
        <div className="text-right shrink-0">
          <StatusBadge text={booking.status} color={bookingStatusColors[booking.status]} />
          <p className="text-xs font-medium mt-1" style={{ color: 'var(--text-secondary)' }}>
            {formatCurrency(bookingTotal(booking))}
          </p>
        </div>
      </div>
    </div>
  )
}
