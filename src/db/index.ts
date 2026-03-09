import Dexie, { type EntityTable } from 'dexie'
import { lsKey } from '../hooks/useSettings'
import type {
  Client, Booking, Transaction, DayAvailability,
  SafetyContact, SafetyCheck, IncidentLog, ServiceRate, BookingPayment, JournalEntry, ScreeningDoc,
  IncallVenue, VenueDoc, ChecklistItem, Tour
} from '../types'
import type { PaymentLabel, PaymentMethod, ScreeningStatus } from '../types'

class CompanionDatabase extends Dexie {
  clients!: EntityTable<Client, 'id'>
  bookings!: EntityTable<Booking, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  availability!: EntityTable<DayAvailability, 'id'>
  safetyContacts!: EntityTable<SafetyContact, 'id'>
  safetyChecks!: EntityTable<SafetyCheck, 'id'>
  incidents!: EntityTable<IncidentLog, 'id'>
  serviceRates!: EntityTable<ServiceRate, 'id'>
  payments!: EntityTable<BookingPayment, 'id'>
  journalEntries!: EntityTable<JournalEntry, 'id'>
  screeningDocs!: EntityTable<ScreeningDoc, 'id'>
  incallVenues!: EntityTable<IncallVenue, 'id'>
  venueDocs!: EntityTable<VenueDoc, 'id'>
  bookingChecklist!: EntityTable<ChecklistItem, 'id'>
  tours!: EntityTable<Tour, 'id'>
  meta!: Dexie.Table<{ key: string; value: unknown }, string>

  constructor() {
    super('Companion')

    this.version(1).stores({
      clients: 'id, alias, screeningStatus, riskLevel, isBlocked, isPinned, dateAdded',
      bookings: 'id, clientId, dateTime, status, createdAt, recurrenceRootId, tourId, parentBookingId',
      transactions: 'id, bookingId, type, category, date, tourId',
      availability: 'id, date',
      safetyContacts: 'id, isPrimary, isActive',
      safetyChecks: 'id, bookingId, status, scheduledTime',
      incidents: 'id, clientId, bookingId, date, severity',
      serviceRates: 'id, sortOrder, isActive',
      payments: 'id, bookingId, label, date',
      journalEntries: 'id, bookingId, clientId, date, entryType',
      screeningDocs: 'id, clientId, uploadedAt',
      incallVenues: 'id, city, isFavorite, isArchived, createdAt',
      venueDocs: 'id, venueId, uploadedAt',
      bookingChecklist: 'id, bookingId, sortOrder',
      tours: 'id, city, startDate, isArchived',
      meta: 'key',
    })
  }
}

export const db = new CompanionDatabase()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIELD ENCRYPTION HOOKS
// Transparently encrypt on write and decrypt on read.
// Only active when the master key is in memory (after PIN unlock).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  SENSITIVE_FIELDS,
  isFieldEncryptionReady,
  shouldBypassHooks,
  encryptFieldSync,
  decryptRecordSync,
} from './fieldCrypto'

for (const [tableName, fields] of Object.entries(SENSITIVE_FIELDS)) {
  const table = (db as any)[tableName] as Dexie.Table | undefined
  if (!table) continue

  // Decrypt after reading
  table.hook('reading', (obj: any) => {
    if (!isFieldEncryptionReady() || shouldBypassHooks()) return obj
    return decryptRecordSync(tableName, obj)
  })

  // Encrypt before creating
  table.hook('creating', function (_primKey: unknown, obj: any) {
    if (!isFieldEncryptionReady() || shouldBypassHooks()) return
    for (const f of fields) {
      if (typeof obj[f] === 'string') {
        obj[f] = encryptFieldSync(obj[f])
      }
    }
  })

  // Encrypt modified fields before updating
  table.hook('updating', function (mods: any) {
    if (!isFieldEncryptionReady() || shouldBypassHooks()) return
    const extra: Record<string, unknown> = {}
    let has = false
    for (const f of fields) {
      if (f in mods && typeof mods[f] === 'string' && mods[f] !== '') {
        extra[f] = encryptFieldSync(mods[f] as string)
        has = true
      }
    }
    return has ? extra : undefined
  })
}

// Helper: generate UUID
export function newId(): string {
  // crypto.randomUUID() not available in all browsers (e.g. older Samsung Internet)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback: generate a UUID v4 using crypto.getRandomValues (not Math.random)
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
  return [...bytes].map((b, i) =>
    ([4, 6, 8, 10].includes(i) ? '-' : '') + b.toString(16).padStart(2, '0')
  ).join('')
}

// Helper: create a new client with defaults
export function createClient(data: Partial<Client> & { alias: string }): Client {
  return {
    id: newId(),
    alias: data.alias,
    nickname: data.nickname,
    phone: data.phone,
    email: data.email,
    telegram: data.telegram,
    signal: data.signal,
    whatsapp: data.whatsapp,
    address: data.address,
    preferredContact: data.preferredContact ?? 'Text',
    secondaryContact: data.secondaryContact,
    screeningStatus: data.screeningStatus ?? 'Unscreened',
    screeningMethod: data.screeningMethod,
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
    venueId: data.venueId,
    status: data.status ?? 'Pending Deposit',
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
    recurrenceRootId: data.recurrenceRootId ?? data.parentBookingId,
    tourId: data.tourId,
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
    tourId: data.tourId,
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

export function isUpcoming(b: Booking, now?: Date): boolean {
  if (b.status === 'Cancelled' || b.status === 'Completed' || b.status === 'No Show') return false
  const n = now ?? new Date()
  // Future bookings are always upcoming
  if (new Date(b.dateTime) > n) return true
  // Active bookings whose time just passed stay visible until auto-transition fires
  if (b.status === 'Confirmed' || b.status === 'Pending Deposit' || b.status === 'In Progress') return true
  return false
}

/**
 * When a client's screening status changes FROM Screened to something else,
 * downgrade their future confirmed bookings back to "Pending Deposit".
 * This prevents confirmed bookings for unscreened clients.
 */
export async function downgradeBookingsOnUnscreen(
  clientId: string,
  oldStatus: ScreeningStatus,
  newStatus: ScreeningStatus,
): Promise<number> {
  if (oldStatus !== 'Screened' || newStatus === 'Screened') return 0
  const bookings = await db.bookings.where('clientId').equals(clientId).toArray()
  const toDowngrade = bookings.filter(b =>
    b.status === 'Confirmed' && new Date(b.dateTime) > new Date()
  )
  for (const b of toDowngrade) {
    await db.bookings.update(b.id, { status: 'Pending Deposit', confirmedAt: undefined })
  }
  return toDowngrade.length
}

/**
 * When a client becomes Screened, advance their "Pending Deposit" bookings
 * to "Confirmed" if no deposit is required (or already received).
 */
export async function advanceBookingsOnScreen(
  clientId: string,
  oldStatus: ScreeningStatus,
  newStatus: ScreeningStatus,
): Promise<number> {
  if (newStatus !== 'Screened' || oldStatus === 'Screened') return 0
  const bookings = await db.bookings.where('clientId').equals(clientId).toArray()
  const now = new Date()
  const toAdvance = bookings.filter(b =>
    b.status === 'Pending Deposit' && new Date(b.dateTime) > now
    && ((b.depositAmount ?? 0) === 0 || b.depositReceived)
  )
  for (const b of toAdvance) {
    await db.bookings.update(b.id, {
      status: 'Confirmed',
      confirmedAt: new Date(),
    })
  }
  return toAdvance.length
}

// Helper: currency setting
export const CURRENCY_KEY = 'currency'
export const DEFAULT_CURRENCY = 'CAD'

export function getCurrency(): string {
  try {
    const raw = localStorage.getItem(lsKey(CURRENCY_KEY))
    if (!raw) return DEFAULT_CURRENCY
    // useLocalStorage stores values with JSON.stringify, so we need to parse
    try { return JSON.parse(raw) } catch { return raw }
  } catch { return DEFAULT_CURRENCY }
}

// Helper: format currency — reads currency from localStorage, locale from browser
export function formatCurrency(amount: number): string {
  const currency = getCurrency()
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return '$' + amount.toLocaleString()
  }
}

export function formatNumber(n: number): string {
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
  return new Intl.NumberFormat(locale).format(n)
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
}): Promise<string | null> {
  let paymentId: string | null = null
  await db.transaction('rw', [db.payments, db.transactions, db.bookings], async () => {
    // Clamp non-tip/non-cancellation payments to remaining balance
    let amount = opts.amount
    if (opts.label !== 'Tip' && opts.label !== 'Cancellation Fee') {
      const bk = await db.bookings.get(opts.bookingId)
      if (bk) {
        const remaining = opts.label === 'Deposit'
          ? bk.depositAmount - (await db.payments.where('bookingId').equals(opts.bookingId).filter(p => p.label === 'Deposit').toArray()).reduce((s, p) => s + p.amount, 0)
          : bookingTotal(bk) - await getBookingTotalPaid(opts.bookingId)
        if (remaining <= 0) return  // paymentId stays null — caller can check
        amount = Math.min(amount, remaining)
      }
    }

    paymentId = newId()
    await db.payments.add({
      id: paymentId,
      bookingId: opts.bookingId,
      amount,
      method: opts.method,
      label: opts.label,
      date: new Date(),
      notes: opts.notes,
    })
    // Create matching income transaction
    if (amount > 0) {
      const bkForTour = await db.bookings.get(opts.bookingId)
      await db.transactions.add({
        id: newId(),
        bookingId: opts.bookingId,
        paymentId,
        tourId: bkForTour?.tourId,
        amount,
        type: 'income',
        category: opts.label === 'Tip' ? 'tip' : opts.label === 'Cancellation Fee' ? 'cancellation' : 'booking',
        paymentMethod: opts.method,
        date: new Date(),
        notes: opts.label === 'Cancellation Fee'
          ? `Cancellation fee — ${opts.clientAlias ?? 'client'}`
          : `${opts.label} — ${opts.clientAlias ?? 'client'}`,
      })
    }
    // Sync convenience booleans
    const booking = await db.bookings.get(opts.bookingId)
    if (booking) {
      if (opts.label === 'Deposit') {
        // Only mark deposit as received when total deposit payments cover the full deposit amount
        const depositPayments = await db.payments
          .where('bookingId').equals(opts.bookingId)
          .filter(p => p.label === 'Deposit')
          .toArray()
        const totalDeposits = depositPayments.reduce((sum, p) => sum + p.amount, 0)
        await db.bookings.update(opts.bookingId, {
          depositReceived: totalDeposits >= booking.depositAmount,
        })
      }
      const paid = await getBookingTotalPaid(opts.bookingId)
      if (paid >= bookingTotal(booking)) {
        await db.bookings.update(opts.bookingId, { paymentReceived: true })
      }
    }
  })
  return paymentId
}

/** Remove a payment record and its corresponding income transaction. */
export async function removeBookingPayment(paymentId: string): Promise<void> {
  await db.transaction('rw', [db.payments, db.transactions, db.bookings], async () => {
    const payment = await db.payments.get(paymentId)
    if (!payment) return
    await db.payments.delete(paymentId)
    // Find and remove the matching income transaction — prefer direct paymentId link, fall back to amount match for legacy data
    const txns = await db.transactions.where('bookingId').equals(payment.bookingId).toArray()
    const paymentTime = new Date(payment.date).getTime()
    const matching = txns.find(t => t.paymentId === paymentId)
      // Legacy fallback: match by amount, time, and notes pattern to avoid hitting the wrong transaction
      ?? txns.find(t => t.type === 'income' && Math.abs(t.amount - payment.amount) < 0.01
        && Math.abs(new Date(t.date).getTime() - paymentTime) < 5_000
        && (t.notes ?? '').includes(payment.label))
    if (matching) await db.transactions.delete(matching.id)
    // Sync convenience booleans
    if (payment.label === 'Deposit') {
      // Recalculate whether total deposit payments still cover the full deposit amount
      const remainingDeposits = await db.payments
        .where('bookingId').equals(payment.bookingId)
        .filter(p => p.label === 'Deposit')
        .toArray()
      const totalDeposits = remainingDeposits.reduce((sum, p) => sum + p.amount, 0)
      const booking = await db.bookings.get(payment.bookingId)
      if (booking) {
        const depositMet = totalDeposits >= booking.depositAmount
        await db.bookings.update(payment.bookingId, { depositReceived: depositMet })
        // Revert to Pending Deposit if deposit no longer covers the required amount
        if (!depositMet && booking.depositAmount > 0 && booking.status === 'Confirmed') {
          await db.bookings.update(payment.bookingId, { status: 'Pending Deposit', confirmedAt: undefined })
        }
      }
    }
    const booking = await db.bookings.get(payment.bookingId)
    if (booking) {
      const paid = await getBookingTotalPaid(payment.bookingId)
      if (paid < bookingTotal(booking)) {
        await db.bookings.update(payment.bookingId, { paymentReceived: false })
      }
    }
  })
}

/** Get total paid for a booking from the payment ledger. */
export async function getBookingTotalPaid(bookingId: string): Promise<number> {
  const payments = await db.payments.where('bookingId').equals(bookingId).toArray()
  // Exclude Tips and Cancellation Fees — they are not payments toward the booking balance
  return payments.filter(p => p.label !== 'Tip' && p.label !== 'Cancellation Fee').reduce((sum, p) => sum + p.amount, 0)
}

/**
 * Complete a booking's payment: record a payment for any remaining balance.
 *
 * This function does NOT create its own transaction — callers must wrap it in
 * a transaction that includes [db.bookings, db.payments, db.transactions] so
 * the reads and writes are atomic. (recordBookingPayment's inner transaction
 * will participate in the caller's outer transaction.)
 */
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
  } else {
    // No payment needed but ensure the boolean is set
    await db.bookings.update(booking.id, { paymentReceived: true })
  }
}

