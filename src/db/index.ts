import Dexie, { type EntityTable } from 'dexie'
import type {
  Client, Booking, Transaction, DayAvailability,
  SafetyContact, SafetyCheck, IncidentLog, ServiceRate, BookingPayment, JournalEntry, ScreeningDoc
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
  journalEntries!: EntityTable<JournalEntry, 'id'>
  screeningDocs!: EntityTable<ScreeningDoc, 'id'>
  meta!: Dexie.Table<{ key: string; value: unknown }, string>

  constructor() {
    super('EscortCRM')

    this.version(1).stores({
      clients: 'id, alias, screeningStatus, riskLevel, isBlocked, isPinned, dateAdded',
      bookings: 'id, clientId, dateTime, status, createdAt, recurrenceRootId',
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
      bookings: 'id, clientId, dateTime, status, createdAt, recurrenceRootId',
      transactions: 'id, bookingId, type, category, date',
      availability: 'id, date',
      safetyContacts: 'id, isPrimary, isActive',
      safetyChecks: 'id, bookingId, status, scheduledTime',
      incidents: 'id, clientId, bookingId, date, severity',
      serviceRates: 'id, sortOrder, isActive',
      payments: 'id, bookingId, label, date',
    })

    // v3: add meta table for migration flags and app state.
    // Replaces localStorage so flags survive across devices and aren't lost
    // when users clear browser storage (which would re-run migrations on their data).
    this.version(3).stores({
      clients: 'id, alias, screeningStatus, riskLevel, isBlocked, isPinned, dateAdded',
      bookings: 'id, clientId, dateTime, status, createdAt, recurrenceRootId',
      transactions: 'id, bookingId, type, category, date',
      availability: 'id, date',
      safetyContacts: 'id, isPrimary, isActive',
      safetyChecks: 'id, bookingId, status, scheduledTime',
      incidents: 'id, clientId, bookingId, date, severity',
      serviceRates: 'id, sortOrder, isActive',
      payments: 'id, bookingId, label, date',
      meta: 'key',
    })

    // v4: rename 'Inquiry' status → 'To Be Confirmed'
    this.version(4).stores({
      clients: 'id, alias, screeningStatus, riskLevel, isBlocked, isPinned, dateAdded',
      bookings: 'id, clientId, dateTime, status, createdAt, recurrenceRootId',
      transactions: 'id, bookingId, type, category, date',
      availability: 'id, date',
      safetyContacts: 'id, isPrimary, isActive',
      safetyChecks: 'id, bookingId, status, scheduledTime',
      incidents: 'id, clientId, bookingId, date, severity',
      serviceRates: 'id, sortOrder, isActive',
      payments: 'id, bookingId, label, date',
      meta: 'key',
    }).upgrade(tx => {
      return tx.table('bookings').toCollection().modify(booking => {
        if (booking.status === 'Inquiry') {
          booking.status = 'To Be Confirmed'
        }
      })
    })

    // v5: rename screening statuses: Pending/Declined → Unscreened
    this.version(5).stores({
      clients: 'id, alias, screeningStatus, riskLevel, isBlocked, isPinned, dateAdded',
      bookings: 'id, clientId, dateTime, status, createdAt, recurrenceRootId',
      transactions: 'id, bookingId, type, category, date',
      availability: 'id, date',
      safetyContacts: 'id, isPrimary, isActive',
      safetyChecks: 'id, bookingId, status, scheduledTime',
      incidents: 'id, clientId, bookingId, date, severity',
      serviceRates: 'id, sortOrder, isActive',
      payments: 'id, bookingId, label, date',
      meta: 'key',
    }).upgrade(tx => {
      return tx.table('clients').toCollection().modify(client => {
        if (client.screeningStatus === 'Pending' || client.screeningStatus === 'Declined') {
          client.screeningStatus = 'Unscreened'
        }
      })
    })

    // v6: rename screening status: Verified → Screened
    this.version(6).stores({
      clients: 'id, alias, screeningStatus, riskLevel, isBlocked, isPinned, dateAdded',
      bookings: 'id, clientId, dateTime, status, createdAt, recurrenceRootId',
      transactions: 'id, bookingId, type, category, date',
      availability: 'id, date',
      safetyContacts: 'id, isPrimary, isActive',
      safetyChecks: 'id, bookingId, status, scheduledTime',
      incidents: 'id, clientId, bookingId, date, severity',
      serviceRates: 'id, sortOrder, isActive',
      payments: 'id, bookingId, label, date',
      meta: 'key',
    }).upgrade(tx => {
      return tx.table('clients').toCollection().modify(client => {
        if (client.screeningStatus === 'Verified') {
          client.screeningStatus = 'Screened'
        }
      })
    })

    // v7: Rename realName → nickname
    this.version(7).stores({
      clients: 'id, alias, screeningStatus, riskLevel, isBlocked, isPinned, dateAdded',
      bookings: 'id, clientId, dateTime, status, createdAt, recurrenceRootId',
      transactions: 'id, bookingId, type, category, date',
      availability: 'id, date',
      safetyContacts: 'id, isPrimary, isActive',
      safetyChecks: 'id, bookingId, status, scheduledTime',
      incidents: 'id, clientId, bookingId, date, severity',
      serviceRates: 'id, sortOrder, isActive',
      payments: 'id, bookingId, label, date',
      meta: 'key',
    }).upgrade(tx => {
      return tx.table('clients').toCollection().modify(client => {
        if (client.realName) {
          client.nickname = client.realName
          delete client.realName
        }
      })
    })

    // v8: Add journal entries table
    this.version(8).stores({
      clients: 'id, alias, screeningStatus, riskLevel, isBlocked, isPinned, dateAdded',
      bookings: 'id, clientId, dateTime, status, createdAt, recurrenceRootId',
      transactions: 'id, bookingId, type, category, date',
      availability: 'id, date',
      safetyContacts: 'id, isPrimary, isActive',
      safetyChecks: 'id, bookingId, status, scheduledTime',
      incidents: 'id, clientId, bookingId, date, severity',
      serviceRates: 'id, sortOrder, isActive',
      payments: 'id, bookingId, label, date',
      journalEntries: 'id, bookingId, clientId, date',
      meta: 'key',
    })

    // v9: Add screening documents table
    this.version(9).stores({
      clients: 'id, alias, screeningStatus, riskLevel, isBlocked, isPinned, dateAdded',
      bookings: 'id, clientId, dateTime, status, createdAt, recurrenceRootId',
      transactions: 'id, bookingId, type, category, date',
      availability: 'id, date',
      safetyContacts: 'id, isPrimary, isActive',
      safetyChecks: 'id, bookingId, status, scheduledTime',
      incidents: 'id, clientId, bookingId, date, severity',
      serviceRates: 'id, sortOrder, isActive',
      payments: 'id, bookingId, label, date',
      journalEntries: 'id, bookingId, clientId, date',
      screeningDocs: 'id, clientId, uploadedAt',
      meta: 'key',
    })
  }
}

export const db = new EscortCRMDatabase()

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
    status: data.status ?? 'To Be Confirmed',
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
  return new Date(b.dateTime) > new Date() && b.status !== 'Cancelled' && b.status !== 'Completed' && b.status !== 'No Show'
}

// Helper: currency setting
export const CURRENCY_KEY = 'currency'
export const DEFAULT_CURRENCY = 'USD'

export function getCurrency(): string {
  try { return localStorage.getItem(CURRENCY_KEY) || DEFAULT_CURRENCY } catch { return DEFAULT_CURRENCY }
}

// Helper: format currency — reads currency from localStorage, locale from browser
export function formatCurrency(amount: number): string {
  const currency = getCurrency()
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
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
      paymentId,
      amount: opts.amount,
      type: 'income',
      category: opts.label === 'Tip' ? 'tip' : 'booking',
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
  return paymentId
}

/** Remove a payment record and its corresponding income transaction. */
export async function removeBookingPayment(paymentId: string): Promise<void> {
  const payment = await db.payments.get(paymentId)
  if (!payment) return
  await db.payments.delete(paymentId)
  // Find and remove the matching income transaction — prefer direct paymentId link, fall back to amount match for legacy data
  const txns = await db.transactions.where('bookingId').equals(payment.bookingId).toArray()
  const matching = txns.find(t => t.paymentId === paymentId)
    ?? txns.find(t => t.type === 'income' && Math.abs(t.amount - payment.amount) < 0.01)
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
      await db.bookings.update(payment.bookingId, {
        depositReceived: totalDeposits >= booking.depositAmount,
      })
    }
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
  const migrated = await db.meta.get('paymentsLedgerMigrated')
  if (migrated) return
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
  await db.meta.put({ key: 'paymentsLedgerMigrated', value: '1' })
}
