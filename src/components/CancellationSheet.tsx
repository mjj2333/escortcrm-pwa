import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, formatCurrency, recordBookingPayment, newId } from '../db'
import { showToast } from './Toast'
import type { Booking, BookingStatus, PaymentMethod, CancelledBy, DepositOutcome } from '../types'

const paymentMethods: PaymentMethod[] = ['Cash', 'e-Transfer', 'Crypto', 'Venmo', 'Cash App', 'Zelle', 'Gift Card', 'Other']

interface CancellationSheetProps {
  booking: Booking | null
  mode: 'cancel' | 'noshow'
  onClose: () => void
}

export function CancellationSheet({ booking, mode, onClose }: CancellationSheetProps) {
  const [cancelledBy, setCancelledBy] = useState<CancelledBy>('client')
  const [cancelReason, setCancelReason] = useState('')
  const [depositOutcome, setDepositOutcome] = useState<DepositOutcome | ''>('')
  const [feeAmount, setFeeAmount] = useState('')
  const [feeMethod, setFeeMethod] = useState<PaymentMethod | ''>('')
  const [saving, setSaving] = useState(false)

  const client = useLiveQuery(
    () => booking?.clientId ? db.clients.get(booking.clientId) : undefined,
    [booking?.clientId]
  )

  const depositPayments = useLiveQuery(
    () => booking ? db.payments.where('bookingId').equals(booking.id).filter(p => p.label === 'Deposit').toArray() : [],
    [booking?.id]
  ) ?? []
  const totalDeposits = depositPayments.reduce((sum, p) => sum + p.amount, 0)

  // Reset state when opened with a new booking
  useEffect(() => {
    if (booking) {
      setCancelledBy('client')
      setCancelReason('')
      setDepositOutcome('')
      setFeeAmount('')
      setFeeMethod('')
    }
  }, [booking?.id, mode])

  // Escape key to close
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])
  useEffect(() => {
    if (booking) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [booking, handleEscape])

  if (!booking) return null

  async function handleConfirm() {
    if (!booking || saving) return
    setSaving(true)
    const fee = parseFloat(feeAmount) || 0
    const method = feeMethod as PaymentMethod | undefined
    const depOut = depositOutcome || undefined

    try {
    await db.transaction('rw', [db.bookings, db.clients, db.payments, db.transactions], async () => {
      if (mode === 'noshow') {
        await db.bookings.update(booking.id, {
          status: 'No Show' as BookingStatus,
          cancelledAt: new Date(),
          cancelledBy: 'client' as CancelledBy,
          depositOutcome: depOut,
        })
        // Escalate client risk
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
      } else {
        await db.bookings.update(booking.id, {
          status: 'Cancelled' as BookingStatus,
          cancelledAt: new Date(),
          cancellationReason: cancelReason.trim() || undefined,
          cancelledBy,
          depositOutcome: depOut,
        })
      }

      if (fee > 0) {
        await recordBookingPayment({
          bookingId: booking.id,
          amount: fee,
          method: method || undefined,
          label: 'Cancellation Fee',
          clientAlias: client?.alias,
          notes: mode === 'noshow'
            ? 'No-show fee'
            : cancelReason.trim() ? `Cancellation fee — ${cancelReason.trim()}` : 'Cancellation fee',
        })
      }

      // Financial adjustments based on deposit outcome
      if (depOut === 'returned' && totalDeposits > 0) {
        // Create an expense transaction to offset the original deposit income
        await db.transactions.add({
          id: newId(),
          bookingId: booking.id,
          amount: totalDeposits,
          type: 'expense',
          category: 'refund',
          date: new Date(),
          notes: `Deposit returned — ${client?.alias ?? 'client'}`,
        })
      } else if (depOut === 'credit' && totalDeposits > 0) {
        // Record the credit so it's visible in financial reporting
        await db.transactions.add({
          id: newId(),
          bookingId: booking.id,
          amount: totalDeposits,
          type: 'expense',
          category: 'refund',
          date: new Date(),
          notes: `Deposit credited to future booking — ${client?.alias ?? 'client'}`,
        })
      }
    })

    showToast(
      mode === 'noshow'
        ? fee > 0 ? `Marked no-show · ${formatCurrency(fee)} fee recorded` : 'Marked as no-show'
        : fee > 0 ? `Booking cancelled · ${formatCurrency(fee)} fee recorded` : 'Booking cancelled'
    )
    onClose()
    } catch (err) {
      showToast(`Failed to ${mode === 'noshow' ? 'mark no-show' : 'cancel booking'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true"
      aria-label={mode === 'noshow' ? 'Mark as No-Show' : 'Cancel Booking'}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-lg rounded-t-2xl p-5 safe-bottom"
        style={{ backgroundColor: 'var(--bg-card)', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            {mode === 'noshow' ? 'Mark as No-Show' : 'Cancel Booking'}
          </h3>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Dismiss
          </button>
        </div>

        {/* Cancelled by (cancel only) */}
        {mode === 'cancel' && (
          <div className="mb-4">
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
              Cancelled by
            </label>
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {(['client', 'provider'] as CancelledBy[]).map(who => (
                <button
                  key={who}
                  aria-pressed={cancelledBy === who}
                  onClick={() => setCancelledBy(who)}
                  className="flex-1 py-2 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: cancelledBy === who ? (who === 'client' ? '#ef4444' : '#f59e0b') : 'transparent',
                    color: cancelledBy === who ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {who === 'client' ? 'Client' : 'Me (Provider)'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reason (cancel only) */}
        {mode === 'cancel' && (
          <div className="mb-4">
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              Reason (optional)
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder={cancelledBy === 'client' ? 'e.g. Client cancelled last minute' : 'e.g. Schedule conflict'}
              className="w-full py-2 px-3 rounded-lg text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '16px' }}
            />
          </div>
        )}

        {/* Deposit outcome */}
        {totalDeposits > 0 && (
          <div
            className="rounded-xl p-4 mb-4"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
              Deposit received: {formatCurrency(totalDeposits)}
            </p>
            <p className="text-[10px] mb-3" style={{ color: 'var(--text-secondary)' }}>
              What happened to the deposit?
            </p>
            <div className="flex gap-2">
              {([
                { value: 'forfeited', label: 'Forfeited', color: '#22c55e' },
                { value: 'returned', label: 'Returned', color: '#f59e0b' },
                { value: 'credit', label: 'Credit', color: '#3b82f6' },
              ] as { value: DepositOutcome; label: string; color: string }[]).map(opt => (
                <button
                  key={opt.value}
                  aria-pressed={depositOutcome === opt.value}
                  onClick={() => setDepositOutcome(prev => prev === opt.value ? '' : opt.value)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: depositOutcome === opt.value ? `${opt.color}20` : 'var(--bg-base)',
                    color: depositOutcome === opt.value ? opt.color : 'var(--text-secondary)',
                    border: depositOutcome === opt.value ? `1px solid ${opt.color}40` : '1px solid var(--border)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'var(--text-secondary)' }}>
              {depositOutcome === 'forfeited' && 'You keep the deposit as compensation.'}
              {depositOutcome === 'returned' && 'Deposit was returned to the client.'}
              {depositOutcome === 'credit' && 'Deposit applied as credit toward a future booking.'}
              {!depositOutcome && 'Select an option, or skip if not applicable.'}
            </p>
          </div>
        )}

        {/* Fee section */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'noshow' ? 'No-show fee (optional)' : 'Cancellation fee (optional)'}
          </p>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Amount</label>
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-base)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={feeAmount}
                  onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); if ((v.match(/\./g) || []).length <= 1) setFeeAmount(v) }}
                  placeholder="0"
                  className="flex-1 bg-transparent text-sm font-bold outline-none"
                  style={{ color: 'var(--text-primary)', fontSize: '16px' }}
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Method</label>
              <select
                value={feeMethod}
                onChange={e => setFeeMethod(e.target.value as PaymentMethod | '')}
                className="w-full py-2 px-3 rounded-lg text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '16px' }}
              >
                <option value="">Any method</option>
                {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {feeAmount && parseFloat(feeAmount) > 0 && (
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Fee will be recorded as income and appear in your finance ledger.
            </p>
          )}
        </div>

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: mode === 'noshow' ? '#ef4444' : '#6b7280' }}
        >
          {mode === 'noshow'
            ? `Mark No-Show${feeAmount && parseFloat(feeAmount) > 0 ? ` · Record ${formatCurrency(parseFloat(feeAmount))} Fee` : ''}`
            : `Cancel Booking${feeAmount && parseFloat(feeAmount) > 0 ? ` · Record ${formatCurrency(parseFloat(feeAmount))} Fee` : ''}`
          }
        </button>
      </div>
    </div>
  )
}
