import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Edit, Clock, MapPin,
  CheckCircle, XCircle, UserX, RotateCcw, Shield,
  ChevronRight, Trash2, Plus, DollarSign
} from 'lucide-react'
import { format } from 'date-fns'
import { db, formatCurrency, bookingTotal, bookingDurationFormatted, bookingEndTime, completeBookingPayment, recordBookingPayment, removeBookingPayment } from '../../db'
import { StatusBadge } from '../../components/StatusBadge'
import { ScreeningStatusBar } from '../../components/ScreeningStatusBar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Card } from '../../components/Card'
import { BookingEditor } from './BookingEditor'
import { showToast } from '../../components/Toast'
import { bookingStatusColors } from '../../types'
import type { Booking, BookingStatus, PaymentMethod, PaymentLabel } from '../../types'

const paymentMethods: PaymentMethod[] = ['Cash', 'e-Transfer', 'Crypto', 'Venmo', 'Cash App', 'Zelle', 'Gift Card', 'Other']
const paymentLabels: PaymentLabel[] = ['Deposit', 'Payment', 'Tip', 'Adjustment']

interface BookingDetailProps {
  bookingId: string
  onBack: () => void
  onOpenClient: (clientId: string) => void
}

// Status progression map
const nextStatus: Partial<Record<BookingStatus, BookingStatus>> = {
  'Inquiry': 'Screening',
  'Screening': 'Pending Deposit',
  'Pending Deposit': 'Confirmed',
  'Confirmed': 'In Progress',
  'In Progress': 'Completed',
}

export function BookingDetail({ bookingId, onBack, onOpenClient }: BookingDetailProps) {
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
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod | ''>('')
  const [payLabel, setPayLabel] = useState<PaymentLabel>('Payment')
  const [payNotes, setPayNotes] = useState('')
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null)

  if (!booking) return null

  const total = bookingTotal(booking)
  const endTime = bookingEndTime(booking)
  const isTerminal = ['Completed', 'Cancelled', 'No Show'].includes(booking.status)
  const next = nextStatus[booking.status]

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
  }

  async function markNoShow() {
    await db.bookings.update(bookingId, {
      status: 'No Show' as BookingStatus,
      cancelledAt: new Date(),
    })
    // Update client risk
    if (booking!.clientId) {
      const clientBookings = await db.bookings.where('clientId').equals(booking!.clientId).toArray()
      const noShows = clientBookings.filter(b => b.status === 'No Show').length
      const currentClient = await db.clients.get(booking!.clientId)
      if (currentClient) {
        let riskLevel = currentClient.riskLevel
        if (noShows >= 2) riskLevel = 'High Risk'
        else if (noShows >= 1 && (riskLevel === 'Unknown' || riskLevel === 'Low Risk')) riskLevel = 'Medium Risk'
        await db.clients.update(booking!.clientId, { riskLevel })
      }
    }
    setConfirmAction(null)
  }

  async function cancelBooking(reason?: string) {
    await db.bookings.update(bookingId, {
      status: 'Cancelled' as BookingStatus,
      cancelledAt: new Date(),
      cancellationReason: reason?.trim() || undefined,
    })
    setConfirmAction(null)
  }

  async function deleteBooking() {
    // Delete associated payments, transactions, and safety checks
    await db.payments.where('bookingId').equals(bookingId).delete()
    await db.transactions.where('bookingId').equals(bookingId).delete()
    await db.safetyChecks.where('bookingId').equals(bookingId).delete()
    await db.bookings.delete(bookingId)
    setConfirmAction(null)
    onBack()
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
          {!isTerminal && (
            <button onClick={() => setShowEditor(true)} className="p-2 text-purple-500">
              <Edit size={18} />
            </button>
          )}
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
                  {client.realName ?? client.alias}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {client.preferredContact} · {client.screeningStatus}
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
        <Card>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Details</p>
          <div className="space-y-3">
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
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{booking.locationType}</p>
                {booking.locationAddress && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{booking.locationAddress}</p>
                )}
                {booking.locationNotes && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{booking.locationNotes}</p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Pricing Breakdown */}
        <Card>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Pricing</p>
          <div className="space-y-2">
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
        </Card>

        {/* Payment Ledger */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Payments</p>
            <div className="flex items-center gap-2">
              {!isFullyPaid && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-500">
                  {formatCurrency(balance)} due
                </span>
              )}
              {isFullyPaid && totalPaid > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-500">
                  Paid in full
                </span>
              )}
            </div>
          </div>

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
        </Card>

        {/* Client Screening — quick toggle */}
        {client && (
          <Card>
            <ScreeningStatusBar
              value={client.screeningStatus}
              onChange={async (status) => {
                await db.clients.update(client.id, { screeningStatus: status })
              }}
              compact
            />
          </Card>
        )}

        {/* Safety */}
        {booking.requiresSafetyCheck && (
          <Card>
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-purple-500" />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Safety check-in enabled
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {booking.safetyCheckMinutesAfter}min after start
            </p>
          </Card>
        )}

        {/* Notes */}
        {booking.notes && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Notes</p>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{booking.notes}</p>
          </Card>
        )}

        {/* Cancellation info */}
        {booking.status === 'Cancelled' && (
          <Card>
            <div className="flex items-center gap-2 text-red-500 mb-1">
              <XCircle size={16} />
              <span className="text-sm font-medium">Cancelled</span>
            </div>
            {booking.cancelledAt && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {format(new Date(booking.cancelledAt), 'MMM d, yyyy · h:mm a')}
              </p>
            )}
            {booking.cancellationReason && (
              <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>{booking.cancellationReason}</p>
            )}
          </Card>
        )}

        {/* Actions */}
        <Card>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Actions</p>

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
        </Card>

        {/* Timestamps */}
        <Card>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Timeline</p>
          <div className="space-y-1.5">
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
        </Card>
      </div>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={confirmAction === 'noshow'}
        title="Mark as No-Show"
        message="Mark this booking as a no-show? This may increase the client's risk level."
        confirmLabel="No-Show"
        onConfirm={markNoShow}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        isOpen={confirmAction === 'cancel'}
        title="Cancel Booking"
        message="Are you sure you want to cancel this booking?"
        confirmLabel="Cancel Booking"
        inputPlaceholder="Cancellation reason (optional)"
        onConfirm={(reason) => cancelBooking(reason)}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        isOpen={confirmAction === 'delete'}
        title="Delete Booking"
        message="Permanently delete this booking? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={deleteBooking}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Editors */}
      <BookingEditor isOpen={showEditor} onClose={() => setShowEditor(false)} booking={booking} />
      <BookingEditor isOpen={showRebook} onClose={() => setShowRebook(false)} rebookFrom={booking} />

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
                type="number"
                inputMode="decimal"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
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
