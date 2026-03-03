import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft, Edit, Archive, ArchiveRestore, MapPin, Calendar, ChevronRight
} from 'lucide-react'
import { fmtShortDate, fmtMediumDate } from '../../utils/dateFormat'
import { db, formatCurrency, bookingTotal } from '../../db'
import { Card } from '../../components/Card'
import { StatusBadge } from '../../components/StatusBadge'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { showToast } from '../../components/Toast'
import { TourEditor } from './TourEditor'
import { bookingStatusColors } from '../../types'

interface TourDetailProps {
  tourId: string
  onBack: () => void
  onOpenBooking?: (bookingId: string) => void
}

export function TourDetail({ tourId, onBack, onOpenBooking }: TourDetailProps) {
  const tour = useLiveQuery(() => db.tours.get(tourId), [tourId])
  const bookings = useLiveQuery(
    () => db.bookings.where('tourId').equals(tourId).toArray(),
    [tourId]
  ) ?? []
  const transactions = useLiveQuery(
    () => db.transactions.where('tourId').equals(tourId).toArray(),
    [tourId]
  ) ?? []
  const clients = useLiveQuery(() => db.clients.toArray()) ?? []

  const [showEditor, setShowEditor] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)

  // Allow Dexie time to resolve before showing "not found"
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), 300)
    return () => clearTimeout(timer)
  }, [])

  const clientMap = new Map(clients.map(c => [c.id, c]))

  if (!tour) {
    if (!settled) return null
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p style={{ color: 'var(--text-secondary)' }}>Tour not found.</p>
        <button onClick={onBack} className="mt-4 text-purple-500 text-sm font-medium">Go back</button>
      </div>
    )
  }

  // Compute profitability — deduplicate booking income already counted via transactions
  const bookingIds = new Set(bookings.map(b => b.id))
  const nonBookingIncome = transactions
    .filter(t => t.type === 'income' && (!t.bookingId || !bookingIds.has(t.bookingId)))
    .reduce((s, t) => s + t.amount, 0)
  const bookingIncome = bookings.filter(b => b.status === 'Completed').reduce((s, b) => s + bookingTotal(b), 0)
  const income = bookingIncome + nonBookingIncome
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const net = income - expenses

  const sortedBookings = [...bookings].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
  const incomeTransactions = transactions.filter(t => t.type === 'income' && (!t.bookingId || !bookingIds.has(t.bookingId)))
  const expenseTransactions = transactions.filter(t => t.type === 'expense')

  async function handleArchiveToggle() {
    await db.tours.update(tourId, { isArchived: !tour!.isArchived, updatedAt: new Date() })
    showToast(tour!.isArchived ? 'Tour restored' : 'Tour archived')
    setShowArchiveConfirm(false)
  }

  return (
    <div className="pb-24" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl header-frosted"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between px-4 h-12 max-w-lg mx-auto">
          <button onClick={onBack} className="flex items-center gap-1 text-purple-500">
            <ArrowLeft size={18} />
            <span className="text-sm">Back</span>
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowArchiveConfirm(true)} aria-label={tour.isArchived ? 'Restore tour' : 'Archive tour'}
              className="p-2" style={{ color: 'var(--text-secondary)' }}>
              {tour.isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
            </button>
            <button onClick={() => setShowEditor(true)} aria-label="Edit tour" className="p-2 text-purple-500">
              <Edit size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Tour info */}
        <div className="text-center py-2">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{tour.name}</h2>
          <div className="flex items-center justify-center gap-2 mt-1">
            <MapPin size={13} style={{ color: 'var(--text-secondary)' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{tour.city}</span>
          </div>
          <div className="flex items-center justify-center gap-2 mt-1">
            <Calendar size={13} style={{ color: 'var(--text-secondary)' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {fmtShortDate(new Date(tour.startDate))} — {fmtShortDate(new Date(tour.endDate))}
            </span>
          </div>
          {tour.isArchived && (
            <span className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(107,114,128,0.15)', color: '#6b7280' }}>
              Archived
            </span>
          )}
        </div>

        {/* Profitability card */}
        <Card>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Income</p>
              <p className="text-lg font-bold text-green-500">{formatCurrency(income)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Expenses</p>
              <p className="text-lg font-bold text-red-500">{formatCurrency(expenses)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Net</p>
              <p className={`text-lg font-bold ${net >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {net >= 0 ? '+' : ''}{formatCurrency(net)}
              </p>
            </div>
          </div>
          {income > 0 && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-secondary)' }}>Profit margin</span>
                <span className={`font-semibold ${net >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {Math.round((net / income) * 100)}%
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Tour notes */}
        {tour.notes && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Notes</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{tour.notes}</p>
          </Card>
        )}

        {/* Bookings */}
        <Card>
          <p className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-secondary)' }}>
            Bookings {sortedBookings.length > 0 && `(${sortedBookings.length})`}
          </p>
          {sortedBookings.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              No bookings assigned to this tour yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {sortedBookings.map(b => {
                const client = b.clientId ? clientMap.get(b.clientId) : undefined
                return (
                  <button key={b.id}
                    onClick={() => onOpenBooking?.(b.id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left active:opacity-70"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {client?.alias ?? 'No client'}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {fmtMediumDate(new Date(b.dateTime))} · {b.duration}m
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge text={b.status} color={bookingStatusColors[b.status]} />
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {formatCurrency(bookingTotal(b))}
                      </span>
                      <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {/* Expenses */}
        {expenseTransactions.length > 0 && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-secondary)' }}>
              Expenses ({expenseTransactions.length})
            </p>
            <div className="space-y-1.5">
              {expenseTransactions.map(t => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {t.notes || t.category}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {fmtMediumDate(new Date(t.date))} · {t.category}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-red-500">-{formatCurrency(t.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Non-booking income */}
        {incomeTransactions.length > 0 && (
          <Card>
            <p className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-secondary)' }}>
              Other Income ({incomeTransactions.length})
            </p>
            <div className="space-y-1.5">
              {incomeTransactions.map(t => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                      {t.notes || t.category}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {fmtMediumDate(new Date(t.date))}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-green-500">+{formatCurrency(t.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Modals */}
      <TourEditor isOpen={showEditor} onClose={() => setShowEditor(false)} tour={tour} />
      <ConfirmDialog
        isOpen={showArchiveConfirm}
        onCancel={() => setShowArchiveConfirm(false)}
        onConfirm={handleArchiveToggle}
        title={tour.isArchived ? 'Restore Tour' : 'Archive Tour'}
        message={tour.isArchived ? 'This tour will be visible again in your tours list.' : 'This tour will be hidden from your active tours list.'}
        confirmLabel={tour.isArchived ? 'Restore' : 'Archive'}
      />
    </div>
  )
}
