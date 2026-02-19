import Dexie, { type EntityTable } from 'dexie'
import type {
  Client, Booking, Transaction, DayAvailability,
  SafetyContact, SafetyCheck, IncidentLog, ServiceRate
} from '../types'

class EscortCRMDatabase extends Dexie {
  clients!: EntityTable<Client, 'id'>
  bookings!: EntityTable<Booking, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  availability!: EntityTable<DayAvailability, 'id'>
  safetyContacts!: EntityTable<SafetyContact, 'id'>
  safetyChecks!: EntityTable<SafetyCheck, 'id'>
  incidents!: EntityTable<IncidentLog, 'id'>
  serviceRates!: EntityTable<ServiceRate, 'id'>

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
