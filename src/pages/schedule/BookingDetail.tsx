import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Edit, Clock, MapPin,
  CheckCircle, XCircle, UserX, RotateCcw, Shield,
  ChevronRight, Trash2, Plus, DollarSign
} from 'lucide-react'
import { format, addMinutes } from 'date-fns'
import { db, newId, formatCurrency, bookingTotal, bookingDurationFormatted, bookingEndTime, completeBookingPayment, recordBookingPayment, removeBookingPayment, downgradeBookingsOnUnscreen, advanceBookingsOnScreen } from '../../db'
import { StatusBadge } from '../../components/StatusBadge'
import { VerifiedBadge } from '../../components/VerifiedBadge'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Card } from '../../components/Card'
import { CollapsibleCard, useAccordion } from '../../components/CollapsibleCard'
import { BookingEditor } from './BookingEditor'
import { JournalEntryEditor } from '../../components/JournalEntryEditor'
import { ProGate } from '../../components/ProGate'
import { isPro } from '../../components/planLimits'
import { showToast, showUndoToast } from '../../components/Toast'
import { CancellationSheet } from '../../components/CancellationSheet'
import { bookingStatusColors, journalTagColors } from '../../types'
import type { Booking, BookingStatus, PaymentMethod, PaymentLabel } from '../../types'

const paymentMethods: PaymentMethod[] = ['Cash', 'e-Transfer', 'Crypto', 'Venmo', 'Cash App', 'Zelle', 'Gift Card', 'Other']
const paymentLabels: PaymentLabel[] = ['Deposit', 'Payment', 'Tip', 'Adjustment']

interface BookingDetailProps {
  bookingId: string
  onBack: () => void
  onOpenClient: (clientId: string) => void
  onShowPaywall?: () => void
}

// Status progression map
const nextStatus: Partial<Record<BookingStatus, BookingStatus>> = {
  'To Be Confirmed': 'Pending Deposit',
  'Pending Deposit': 'Confirmed',
  'Confirmed': 'In Progress',
  'In Progress': 'Completed',
}

export function BookingDetail({ bookingId, onBack, onOpenClient, onShowPaywall }: BookingDetailProps) {
  const booking = useLiveQuery(() => db.bookings.get(bookingId))
  const client = useLiveQuery(
    () => booking?.clientId ? db.clients.get(booking.clientId) : undefined,
    [booking?.clientId]
  )
  const payments = useLiveQuery(
    () => db.payments.where('bookingId').equals(bookingId).toArray(),
    [bookingId]
  )
  const [showEditor, setShowEditor] = useState(false)
  const [showRebook, setShowRebook] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'noshow' | 'cancel' | 'delete' | null>(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showJournal, setShowJournal] = useState(false)
  const { expanded, toggle } = useAccordion(['details', 'pricing'])

  // Journal entry for this booking
  const journalEntry = useLiveQuery(
    () => db.journalEntries.where('bookingId').equals(bookingId).first(),
    [bookingId]
  )
  const venue = useLiveQuery(
    () => booking?.venueId ? db.incallVenues.get(booking.venueId) : undefined,
    [booking?.venueId]
  )
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod | ''>('')
  const [payLabel, setPayLabel] = useState<PaymentLabel>('Payment')
  const [payNotes, setPayNotes] = useState('')
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null)

  if (!booking) return null

  const total = bookingTotal(booking)
  const endTime = bookingEndTime(booking)
  const isTerminal = ['Completed', 'Cancelled', 'No Show'].includes(booking.status)
  const clientIsScreened = client?.screeningStatus === 'Screened'
  // Block advancement past "To Be Confirmed" until client is screened
  const next = (booking.status === 'To Be Confirmed' && !clientIsScreened)
    ? undefined
    : nextStatus[booking.status]

  const totalPaid = (payments ?? []).reduce((sum, p) => sum + p.amount, 0)
  const balance = total - totalPaid
  const isFullyPaid = balance <= 0
  const totalDeposits = (payments ?? []).filter(p => p.label === 'Deposit').reduce((sum, p) => sum + p.amount, 0)
  const depositRemaining = booking.depositAmount - totalDeposits

  async function updateStatus(status: BookingStatus) {
    const updates: Partial<Booking> = { status }
    if (status === 'Confirmed') updates.confirmedAt = new Date()
    if (status === 'Completed') {
      updates.completedAt = new Date()
      // Record remaining payment via ledger
      const c = await db.clients.get(booking!.clientId ?? '')
      await completeBookingPayment(booking!, c?.alias)
      // Update client lastSeen
      if (booking!.clientId) {
        await db.clients.update(booking!.clientId, { lastSeen: new Date() })
      }
    }
    await db.bookings.update(bookingId, updates)
    // Create safety check when manually advancing to In Progress
    if (status === 'In Progress' && booking!.requiresSafetyCheck) {
      const existing = await db.safetyChecks.where('bookingId').equals(bookingId).first()
      if (!existing) {
        const checkTime = addMinutes(new Date(booking!.dateTime), booking!.safetyCheckMinutesAfter || 15)
        await db.safetyChecks.add({
          id: newId(),
          bookingId,
          safetyContactId: booking!.safetyContactId,
          scheduledTime: checkTime,
          bufferMinutes: 15,
          status: 'pending',
        })
      }
    }
    if (status === 'Completed') {
      setTimeout(() => setShowJournal(true), 400)
    }
  }

  async function deleteBooking() {
    // Snapshot everything before deletion for undo
    const bookingSnap = await db.bookings.get(bookingId)
    const paymentsSnap = await db.payments.where('bookingId').equals(bookingId).toArray()
    const txnsSnap = await db.transactions.where('bookingId').equals(bookingId).toArray()
    const checksSnap = await db.safetyChecks.where('bookingId').equals(bookingId).toArray()

    await db.payments.where('bookingId').equals(bookingId).delete()
    await db.transactions.where('bookingId').equals(bookingId).delete()
    await db.safetyChecks.where('bookingId').equals(bookingId).delete()
    await db.bookings.delete(bookingId)
    setConfirmAction(null)
    onBack()

    showUndoToast('Booking deleted', async () => {
      if (bookingSnap) await db.bookings.put(bookingSnap)
      if (paymentsSnap.length) await db.payments.bulkPut(paymentsSnap)
      if (txnsSnap.length) await db.transactions.bulkPut(txnsSnap)
      if (checksSnap.length) await db.safetyChecks.bulkPut(checksSnap)
    })
  }

  function openPaymentForm(defaultLabel?: PaymentLabel, defaultAmount?: number) {
    setPayLabel(defaultLabel ?? 'Payment')
    setPayAmount(defaultAmount != null ? String(defaultAmount) : '')
    setPayMethod(booking!.paymentMethod ?? '')
    setPayNotes('')
    setShowPaymentForm(true)
  }

  async function submitPayment() {
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) return
    await recordBookingPayment({
      bookingId,
      amount,
      method: payMethod || undefined,
      label: payLabel,
      clientAlias: client?.alias,
      notes: payNotes.trim() || undefined,
    })
    setShowPaymentForm(false)
    showToast(`${payLabel} of ${formatCurrency(amount)} recorded`)
  }

  async function confirmDeletePayment() {
    if (!deletePaymentId) return
    await removeBookingPayment(deletePaymentId)
    setDeletePaymentId(null)
    showToast('Payment removed')
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl header-frosted"
        style={{
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center justify-between px-4 h-12 max-w-lg mx-auto">
          <button onClick={onBack} className="flex items-center gap-1 text-purple-500">
            <ArrowLeft size={18} />
            <span className="text-sm">Back</span>
          </button>
          <button onClick={() => setShowEditor(true)} className="p-2 text-purple-500">
            <Edit size={18} />
          </button>
        </div>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
        {/* Status Banner */}
        <div className="flex flex-col items-center py-4">
          <div className="flex items-center gap-2">
            <StatusBadge text={booking.status} color={bookingStatusColors[booking.status]} size="md" />
            {booking.recurrence && booking.recurrence !== 'none' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-500/15 text-purple-500">
                🔄 {booking.recurrence === 'weekly' ? 'Weekly' : booking.recurrence === 'biweekly' ? 'Biweekly' : 'Monthly'}
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold mt-3" style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(total)}
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {format(new Date(booking.dateTime), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>

        {/* Client */}
        {client && (
          <Card onClick={() => onOpenClient(client.id)}>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}
              >
                <span className="text-sm font-bold text-purple-500">
                  {client.alias.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                  {client.nickname ?? client.alias}<VerifiedBadge client={client} size={13} />
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {client.preferredContact}{client.screeningStatus !== 'Screened' ? ` · ${client.screeningStatus}` : ''}
                </p>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
            </div>

            {/* Preferences preview */}
            {(client.preferences || client.boundaries) && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                {client.preferences && (
                  <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                    💜 {client.preferences.slice(0, 100)}{client.preferences.length > 100 ? '…' : ''}
                  </p>
                )}
                {client.boundaries && (
                  <p className="text-xs text-red-400">
                    🚫 {client.boundaries.slice(0, 100)}{client.boundaries.length > 100 ? '…' : ''}
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Time & Location */}
        <CollapsibleCard label="Details" id="details" expanded={expanded} toggle={toggle}
          preview={<span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {format(new Date(booking.dateTime), 'h:mm a')} · {booking.locationType}
          </span>}>
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-3">
              <Clock size={16} style={{ color: 'var(--text-secondary)' }} />
              <div className="flex-1">
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  {format(new Date(booking.dateTime), 'h:mm a')} — {format(endTime, 'h:mm a')}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {bookingDurationFormatted(booking.duration)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <MapPin size={16} style={{ color: 'var(--text-secondary)' }} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{booking.locationType}</p>
                  {venue && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>
                      {venue.name}
                    </span>
                  )}
                </div>
                {booking.locationAddress && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{booking.locationAddress}</p>
                )}
                {booking.locationNotes && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{booking.locationNotes}</p>
                )}
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Pricing Breakdown */}
        <CollapsibleCard label="Pricing" id="pricing" expanded={expanded} toggle={toggle}
          preview={<span className="text-sm font-bold text-green-500">{formatCurrency(total)}</span>}>
          <div className="space-y-2 pt-1">
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Base Rate</span>
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{formatCurrency(booking.baseRate)}</span>
            </div>
            {booking.extras > 0 && (
              <div className="flex justify-between">
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Extras</span>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{formatCurrency(booking.extras)}</span>
              </div>
            )}
            {booking.travelFee > 0 && (
              <div className="flex justify-between">
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Travel Fee</span>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{formatCurrency(booking.travelFee)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Total</span>
              <span className="text-sm font-bold text-green-500">{formatCurrency(total)}</span>
            </div>
          </div>
        </CollapsibleCard>

        {/* Payment Ledger */}
        <CollapsibleCard label="Payments" id="payments" expanded={expanded} toggle={toggle}
          badge={<>
            {!isFullyPaid && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-500">
                {formatCurrency(balance)} due
              </span>
            )}
            {isFullyPaid && totalPaid > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-500">
                Paid
              </span>
            )}
          </>}>
          <div className="pt-1">

          {/* Balance bar */}
          {total > 0 && (
            <div className="mb-3">
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (totalPaid / total) * 100)}%`,
                    backgroundColor: isFullyPaid ? '#22c55e' : '#f59e0b',
                  }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  {formatCurrency(totalPaid)} paid
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  {formatCurrency(total)} total
                </span>
              </div>
            </div>
          )}

          {/* Payment entries */}
          {(payments ?? []).length > 0 && (
            <div className="space-y-1 mb-3">
              {(payments ?? [])
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map(p => (
                <button
                  key={p.id}
                  onClick={() => setDeletePaymentId(p.id)}
                  className="flex items-center justify-between w-full py-2 px-2 rounded-lg text-left"
                  style={{ backgroundColor: 'var(--bg-base)' }}
                >
                  <div className="flex items-center gap-2">
                    <DollarSign size={14} className={p.label === 'Tip' ? 'text-purple-500' : 'text-green-500'} />
                    <div>
                      <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {p.label}{p.method ? ` · ${p.method}` : ''}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {format(new Date(p.date), 'MMM d, h:mm a')}
                        {p.notes ? ` — ${p.notes}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-green-500">{formatCurrency(p.amount)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Quick actions */}
          <div className="flex gap-2">
            {booking.depositAmount > 0 && depositRemaining > 0 && (
              <button
                onClick={() => openPaymentForm('Deposit', depositRemaining)}
                className="flex-1 text-xs font-medium py-2 rounded-lg"
                style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: '#a855f7' }}
              >
                Record Deposit ({formatCurrency(depositRemaining)})
              </button>
            )}
            {!isFullyPaid && balance > 0 && (
              <button
                onClick={() => openPaymentForm('Payment', balance)}
                className="flex-1 text-xs font-medium py-2 rounded-lg"
                style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}
              >
                Record {booking.depositReceived ? 'Balance' : 'Payment'} ({formatCurrency(balance)})
              </button>
            )}
            <button
              onClick={() => openPaymentForm()}
              className="text-xs font-medium py-2 px-3 rounded-lg"
              style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-secondary)' }}
            >
              <Plus size={14} />
            </button>
          </div>
          </div>
        </CollapsibleCard>

        {/* Client Screening — quick toggle */}
        {client && client.screeningStatus !== 'Screened' && (
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Client Screening</span>
              <select
                value={client.screeningStatus}
                onChange={async (e) => {
                  const newStatus = e.target.value as any
                  const oldStatus = client.screeningStatus
                  await db.clients.update(client.id, { screeningStatus: newStatus })
                  await advanceBookingsOnScreen(client.id, oldStatus, newStatus)
                  await downgradeBookingsOnUnscreen(client.id, oldStatus, newStatus)
                }}
                className="text-sm font-semibold rounded-lg px-2 py-1 outline-none"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: client.screeningStatus === 'In Progress' ? '#3b82f6' : '#f59e0b',
                  border: 'none',
                }}
              >
                <option value="Unscreened">Unscreened</option>
                <option value="In Progress">In Progress</option>
                <option value="Screened">Screened</option>
              </select>
            </div>
          </Card>
        )}

        {/* Safety */}
        {booking.requiresSafetyCheck && (
          <CollapsibleCard label="Safety" id="safety" expanded={expanded} toggle={toggle}
            badge={<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-500">
              {booking.safetyCheckMinutesAfter}min
            </span>}>
            <div className="flex items-center gap-2 pt-1">
              <Shield size={16} className="text-purple-500" />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Safety check-in {booking.safetyCheckMinutesAfter}min after start
              </span>
            </div>
          </CollapsibleCard>
        )}

        {/* Session Journal */}
        {isPro() ? (
          <CollapsibleCard label="Session Journal" id="journal" expanded={expanded} toggle={toggle}
            badge={journalEntry ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500">
                Recorded
              </span>
            ) : undefined}>
            <div className="pt-1">
            <div className="flex items-center justify-end mb-2">
              {(isTerminal || journalEntry) && (
                <button onClick={() => setShowJournal(true)}
                  className="text-xs font-medium text-purple-500 active:opacity-70">
                  {journalEntry ? 'Edit' : '+ Add'}
                </button>
              )}
            </div>
            {journalEntry ? (
              <div>
                {journalEntry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {journalEntry.tags.map(tag => {
                      const colors = journalTagColors[tag]
                      return (
                        <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: colors.bg, color: colors.fg }}>
                          {tag}
                        </span>
                      )
                    })}
                  </div>
                )}
                {journalEntry.notes && (
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {journalEntry.notes}
                  </p>
                )}
                {(journalEntry.actualDuration || journalEntry.timingNotes) && (
                  <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {journalEntry.actualDuration && (
                      <span className="flex items-center gap-1">
                        <Clock size={10} />{journalEntry.actualDuration}m
                        {journalEntry.actualDuration !== booking.duration && (
                          <span style={{ color: journalEntry.actualDuration > booking.duration ? '#f97316' : '#22c55e' }}>
                            ({journalEntry.actualDuration > booking.duration ? '+' : ''}{journalEntry.actualDuration - booking.duration}m)
                          </span>
                        )}
                      </span>
                    )}
                    {journalEntry.timingNotes && <span>· {journalEntry.timingNotes}</span>}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {isTerminal ? 'No session notes recorded.' : 'Available after session is completed.'}
              </p>
            )}
            </div>
          </CollapsibleCard>
        ) : (
          <CollapsibleCard label="Session Journal" id="journal" expanded={expanded} toggle={toggle}>
            <ProGate feature="Session Journal" onUpgrade={onShowPaywall} inline />
          </CollapsibleCard>
        )}

        {/* Cancellation info */}
        {(booking.status === 'Cancelled' || booking.status === 'No Show') && (
          <Card>
            <div className="flex items-center gap-2 mb-1" style={{ color: booking.status === 'No Show' ? '#f97316' : '#ef4444' }}>
              <XCircle size={16} />
              <span className="text-sm font-medium">
                {booking.status === 'No Show' ? 'No-Show' : 'Cancelled'}
                {booking.cancelledBy && (
                  <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>
                    {' '}— by {booking.cancelledBy === 'client' ? 'Client' : 'Provider'}
                  </span>
                )}
              </span>
            </div>
            {booking.cancelledAt && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {format(new Date(booking.cancelledAt), 'MMM d, yyyy · h:mm a')}
              </p>
            )}
            {booking.cancellationReason && (
              <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{booking.cancellationReason}</p>
            )}
            {booking.depositOutcome && totalDeposits > 0 && (
              <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Deposit ({formatCurrency(totalDeposits)}):
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  booking.depositOutcome === 'forfeited' ? 'bg-green-500/15 text-green-500'
                  : booking.depositOutcome === 'returned' ? 'bg-orange-500/15 text-orange-500'
                  : 'bg-blue-500/15 text-blue-500'
                }`}>
                  {booking.depositOutcome === 'forfeited' ? 'Forfeited (kept)'
                    : booking.depositOutcome === 'returned' ? 'Returned to client'
                    : 'Credit for future booking'}
                </span>
              </div>
            )}
            {payments?.filter(p => p.label === 'Cancellation Fee').map(p => (
              <div key={p.id} className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Cancellation fee{p.method ? ` · ${p.method}` : ''}
                </span>
                <span className="text-sm font-bold text-green-500">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </Card>
        )}

        {/* Actions */}
        <CollapsibleCard label="Actions" id="actions" expanded={expanded} toggle={toggle}>
          <div className="pt-1">

          {/* Advance Status */}
          {next && (
            <button
              onClick={() => updateStatus(next)}
              className="flex items-center gap-3 py-3 w-full text-left"
            >
              <CheckCircle size={18} className="text-green-500" />
              <span className="text-sm font-medium text-green-500">
                Mark as {next}
              </span>
            </button>
          )}

          {/* Book Again */}
          {isTerminal && (
            <button
              onClick={() => setShowRebook(true)}
              className="flex items-center gap-3 py-3 w-full text-left"
            >
              <RotateCcw size={18} className="text-purple-500" />
              <span className="text-sm font-medium text-purple-500">Book Again</span>
            </button>
          )}

          {/* No Show */}
          {!isTerminal && (
            <button
              onClick={() => setConfirmAction('noshow')}
              className="flex items-center gap-3 py-3 w-full text-left"
            >
              <UserX size={18} className="text-red-500" />
              <span className="text-sm font-medium text-red-500">Mark as No-Show</span>
            </button>
          )}

          {/* Cancel */}
          {!isTerminal && (
            <button
              onClick={() => setConfirmAction('cancel')}
              className="flex items-center gap-3 py-3 w-full text-left"
            >
              <XCircle size={18} className="text-red-500" />
              <span className="text-sm font-medium text-red-500">Cancel Booking</span>
            </button>
          )}

          {/* Delete */}
          {isTerminal && (
            <button
              onClick={() => setConfirmAction('delete')}
              className="flex items-center gap-3 py-3 w-full text-left"
            >
              <Trash2 size={18} className="text-red-500" />
              <span className="text-sm font-medium text-red-500">Delete Booking</span>
            </button>
          )}
          </div>
        </CollapsibleCard>

        {/* Timestamps */}
        <CollapsibleCard label="Timeline" id="timeline" expanded={expanded} toggle={toggle}>
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Created</span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {format(new Date(booking.createdAt), 'MMM d, h:mm a')}
              </span>
            </div>
            {booking.confirmedAt && (
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Confirmed</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {format(new Date(booking.confirmedAt), 'MMM d, h:mm a')}
                </span>
              </div>
            )}
            {booking.completedAt && (
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Completed</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {format(new Date(booking.completedAt), 'MMM d, h:mm a')}
                </span>
              </div>
            )}
          </div>
        </CollapsibleCard>
      </div>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={confirmAction === 'delete'}
        title="Delete Booking"
        message="Permanently delete this booking? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={deleteBooking}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Cancellation / No-Show Sheet */}
      <CancellationSheet
        booking={(confirmAction === 'cancel' || confirmAction === 'noshow') ? booking : null}
        mode={confirmAction === 'noshow' ? 'noshow' : 'cancel'}
        onClose={() => setConfirmAction(null)}
      />

      {/* Editors */}
      <BookingEditor isOpen={showEditor} onClose={() => setShowEditor(false)} booking={booking} />
      <BookingEditor isOpen={showRebook} onClose={() => setShowRebook(false)} rebookFrom={booking} />
      <JournalEntryEditor
        isOpen={showJournal}
        onClose={() => setShowJournal(false)}
        booking={booking}
        clientAlias={client?.alias}
        existingEntry={journalEntry ?? undefined}
      />

      {/* Record Payment Modal */}
      {showPaymentForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPaymentForm(false)} />
          <div
            className="relative w-full max-w-lg rounded-t-2xl p-5 space-y-4 safe-bottom"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Record Payment</h3>
              <button onClick={() => setShowPaymentForm(false)} className="text-sm text-purple-500">Cancel</button>
            </div>

            {/* Label selector */}
            <div className="flex gap-2">
              {paymentLabels.map(l => (
                <button
                  key={l}
                  onClick={() => setPayLabel(l)}
                  className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
                  style={{
                    backgroundColor: payLabel === l ? 'rgba(168,85,247,0.2)' : 'var(--bg-base)',
                    color: payLabel === l ? '#a855f7' : 'var(--text-secondary)',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Amount</label>
              <input
                type="text"
                inputMode="decimal"
                value={payAmount ? Number(payAmount).toLocaleString() : ''}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9.]/g, '')
                  setPayAmount(raw)
                }}
                placeholder="0"
                className="w-full text-2xl font-bold py-2 px-3 rounded-lg border-0 outline-none"
                style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
                autoFocus
              />
            </div>

            {/* Method */}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Method</label>
              <select
                value={payMethod}
                onChange={e => setPayMethod(e.target.value as PaymentMethod | '')}
                className="w-full py-2 px-3 rounded-lg border-0 outline-none text-sm"
                style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
              >
                <option value="">Not specified</option>
                {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Notes (optional)</label>
              <input
                type="text"
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                placeholder="e.g. sent via e-Transfer"
                className="w-full py-2 px-3 rounded-lg border-0 outline-none text-sm"
                style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
              />
            </div>

            <button
              onClick={submitPayment}
              disabled={!payAmount || parseFloat(payAmount) <= 0}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: '#a855f7' }}
            >
              Record {payLabel} {payAmount ? `(${formatCurrency(parseFloat(payAmount))})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* Delete Payment Confirm */}
      <ConfirmDialog
        isOpen={deletePaymentId !== null}
        title="Remove Payment"
        message="Remove this payment record? The associated income transaction will also be removed."
        confirmLabel="Remove"
        onConfirm={confirmDeletePayment}
        onCancel={() => setDeletePaymentId(null)}
      />
    </div>
  )
}
