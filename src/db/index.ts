import Dexie, { type EntityTable } from 'dexie'
import type {
  Client, Booking, Transaction, DayAvailability,
  SafetyContact, SafetyCheck, IncidentLog, ServiceRate, BookingPayment
} from '../types'
import type { PaymentLabel, PaymentMethod } from '../types'

class EscortCRMDatabase extends Dexie {
  clients!: EntityTable<Client, 'id'>
  bookings!: EntityTable<Booking, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  availability!: EntityTable<DayAvailability, 'id'>
  safetyContacts!: EntityTable<SafetyContact, 'id'>
  safetyChecks!: EntityTable<SafetyCheck, 'id'>
  incidents!: EntityTable<IncidentLog, 'id'>
  serviceRates!: EntityTable<ServiceRate, 'id'>
  payments!: EntityTable<BookingPayment, 'id'>

  constructor() {
    super('EscortCRM')

    this.version(1).stores({
      clients: 'id, alias, screeningStatus, riskLevel, isBlocked, isPinned, dateAdded',
      bookings: 'id, clientId, dateTime, status, createdAt',
      transactions: 'id, bookingId, type, category, date',
      availability: 'id, date',
      safetyContacts: 'id, isPrimary, isActive',
      safetyChecks: 'id, bookingId, status, scheduledTime',
      incidents: 'id, clientId, bookingId, date, severity',
      serviceRates: 'id, sortOrder, isActive',
    })

    // v2: add payments ledger table
    this.version(2).stores({
      clients: 'id, alias, screeningStatus, riskLevel, isBlocked, isPinned, dateAdded',
      bookings: 'id, clientId, dateTime, status, createdAt',
      transactions: 'id, bookingId, type, category, date',
      availability: 'id, date',
      safetyContacts: 'id, isPrimary, isActive',
      safetyChecks: 'id, bookingId, status, scheduledTime',
      incidents: 'id, clientId, bookingId, date, severity',
      serviceRates: 'id, sortOrder, isActive',
      payments: 'id, bookingId, label, date',
    })
  }
}

export const db = new EscortCRMDatabase()

// Helper: generate UUID
export function newId(): string {
  // crypto.randomUUID() not available in all browsers (e.g. older Samsung Internet)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback: generate a UUID v4 manually
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Helper: create a new client with defaults
export function createClient(data: Partial<Client> & { alias: string }): Client {
  return {
    id: newId(),
    alias: data.alias,
    realName: data.realName,
    phone: data.phone,
    email: data.email,
    preferredContact: data.preferredContact ?? 'Text',
    screeningStatus: data.screeningStatus ?? 'Pending',
    riskLevel: data.riskLevel ?? 'Unknown',
    isBlocked: false,
    notes: data.notes ?? '',
    preferences: data.preferences ?? '',
    boundaries: data.boundaries ?? '',
    referenceSource: data.referenceSource,
    verificationNotes: data.verificationNotes,
    dateAdded: new Date(),
    lastSeen: data.lastSeen,
    birthday: data.birthday,
    clientSince: data.clientSince,
    tags: data.tags ?? [],
    isPinned: false,
    requiresSafetyCheck: data.requiresSafetyCheck ?? true,
  }
}

// Helper: create a new booking with defaults
export function createBooking(data: Partial<Booking>): Booking {
  return {
    id: newId(),
    clientId: data.clientId,
    dateTime: data.dateTime ?? new Date(),
    duration: data.duration ?? 60,
    locationType: data.locationType ?? 'Incall',
    locationAddress: data.locationAddress,
    locationNotes: data.locationNotes,
    status: data.status ?? 'Inquiry',
    baseRate: data.baseRate ?? 0,
    extras: data.extras ?? 0,
    travelFee: data.travelFee ?? 0,
    depositAmount: data.depositAmount ?? 0,
    depositReceived: data.depositReceived ?? false,
    depositMethod: data.depositMethod,
    paymentMethod: data.paymentMethod,
    paymentReceived: data.paymentReceived ?? false,
    notes: data.notes ?? '',
    createdAt: new Date(),
    confirmedAt: data.confirmedAt,
    completedAt: data.completedAt,
    cancelledAt: data.cancelledAt,
    cancellationReason: data.cancellationReason,
    requiresSafetyCheck: data.requiresSafetyCheck ?? true,
    safetyCheckMinutesAfter: data.safetyCheckMinutesAfter ?? 15,
    safetyContactId: data.safetyContactId,
    recurrence: data.recurrence ?? 'none',
    parentBookingId: data.parentBookingId,
  }
}

// Helper: create a transaction
export function createTransaction(data: Partial<Transaction> & { amount: number; type: 'income' | 'expense' }): Transaction {
  return {
    id: newId(),
    bookingId: data.bookingId,
    amount: data.amount,
    type: data.type,
    category: data.category ?? 'other',
    paymentMethod: data.paymentMethod,
    date: data.date ?? new Date(),
    notes: data.notes ?? '',
  }
}

// Helper: booking computed values
export function bookingTotal(b: Booking): number {
  return b.baseRate + b.extras + b.travelFee
}

export function bookingEndTime(b: Booking): Date {
  return new Date(new Date(b.dateTime).getTime() + b.duration * 60000)
}

export function bookingDurationFormatted(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export function isUpcoming(b: Booking): boolean {
  return new Date(b.dateTime) > new Date() && b.status !== 'Cancelled' && b.status !== 'Completed'
}

// Helper: format currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

// Helper: create income transaction for a completed booking (guards against duplicates)
export async function createBookingIncomeTransaction(booking: Booking, clientAlias?: string): Promise<void> {
  const existing = await db.transactions.where('bookingId').equals(booking.id).first()
  if (existing) return // already recorded
  await db.transactions.add({
    id: newId(),
    bookingId: booking.id,
    amount: bookingTotal(booking),
    type: 'income',
    category: 'booking',
    date: new Date(),
    notes: `Booking with ${clientAlias ?? 'client'}`,
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAYMENT LEDGER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Record a payment against a booking. Also creates an income transaction. */
export async function recordBookingPayment(opts: {
  bookingId: string
  amount: number
  method?: PaymentMethod
  label: PaymentLabel
  clientAlias?: string
  notes?: string
}): Promise<string> {
  const paymentId = newId()
  await db.payments.add({
    id: paymentId,
    bookingId: opts.bookingId,
    amount: opts.amount,
    method: opts.method,
    label: opts.label,
    date: new Date(),
    notes: opts.notes,
  })
  // Create matching income transaction
  if (opts.amount > 0) {
    await db.transactions.add({
      id: newId(),
      bookingId: opts.bookingId,
      amount: opts.amount,
      type: 'income',
      category: opts.label === 'Tip' ? 'tip' : 'booking',
      paymentMethod: opts.method,
      date: new Date(),
      notes: `${opts.label} — ${opts.clientAlias ?? 'client'}`,
    })
  }
  // Sync convenience booleans
  if (opts.label === 'Deposit') {
    await db.bookings.update(opts.bookingId, { depositReceived: true })
  }
  const booking = await db.bookings.get(opts.bookingId)
  if (booking) {
    const paid = await getBookingTotalPaid(opts.bookingId)
    if (paid >= bookingTotal(booking)) {
      await db.bookings.update(opts.bookingId, { paymentReceived: true })
    }
  }
  return paymentId
}

/** Remove a payment record and its corresponding income transaction. */
export async function removeBookingPayment(paymentId: string): Promise<void> {
  const payment = await db.payments.get(paymentId)
  if (!payment) return
  await db.payments.delete(paymentId)
  // Find and remove the matching income transaction (closest match by amount + bookingId)
  const txns = await db.transactions.where('bookingId').equals(payment.bookingId).toArray()
  const matching = txns.find(t => t.type === 'income' && Math.abs(t.amount - payment.amount) < 0.01)
  if (matching) await db.transactions.delete(matching.id)
  // Sync convenience booleans
  if (payment.label === 'Deposit') {
    await db.bookings.update(payment.bookingId, { depositReceived: false })
  }
  const booking = await db.bookings.get(payment.bookingId)
  if (booking) {
    const paid = await getBookingTotalPaid(payment.bookingId)
    if (paid < bookingTotal(booking)) {
      await db.bookings.update(payment.bookingId, { paymentReceived: false })
    }
  }
}

/** Get total paid for a booking from the payment ledger. */
export async function getBookingTotalPaid(bookingId: string): Promise<number> {
  const payments = await db.payments.where('bookingId').equals(bookingId).toArray()
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

/** Complete a booking's payment: record a payment for any remaining balance. */
export async function completeBookingPayment(booking: Booking, clientAlias?: string): Promise<void> {
  const total = bookingTotal(booking)
  const paid = await getBookingTotalPaid(booking.id)
  const remaining = total - paid
  if (remaining > 0) {
    await recordBookingPayment({
      bookingId: booking.id,
      amount: remaining,
      method: booking.paymentMethod,
      label: 'Payment',
      clientAlias,
    })
  }
  await db.bookings.update(booking.id, { paymentReceived: true })
}

/**
 * One-time migration: backfill BookingPayment records from legacy boolean flags
 * so existing completed/deposited bookings show correct balances.
 */
export async function migrateToPaymentLedger(): Promise<void> {
  if (localStorage.getItem('paymentsLedgerMigrated')) return
  const bookings = await db.bookings.toArray()
  for (const b of bookings) {
    const existing = await db.payments.where('bookingId').equals(b.id).count()
    if (existing > 0) continue
    // Deposit received → create deposit payment (no transaction — old system already has it)
    if (b.depositReceived && b.depositAmount > 0) {
      await db.payments.add({
        id: newId(),
        bookingId: b.id,
        amount: b.depositAmount,
        method: b.depositMethod,
        label: 'Deposit',
        date: b.confirmedAt ?? b.createdAt,
      })
    }
    // Payment received → create balance payment for the remainder
    if (b.paymentReceived && (b.status === 'Completed' || b.status === 'In Progress')) {
      const depositPaid = b.depositReceived ? b.depositAmount : 0
      const remaining = bookingTotal(b) - depositPaid
      if (remaining > 0) {
        await db.payments.add({
          id: newId(),
          bookingId: b.id,
          amount: remaining,
          method: b.paymentMethod,
          label: 'Payment',
          date: b.completedAt ?? new Date(),
        })
      }
    }
  }
  localStorage.setItem('paymentsLedgerMigrated', '1')
}
