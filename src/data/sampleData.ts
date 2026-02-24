import { db, newId } from '../db'
import type {
  Client, Booking, Transaction, SafetyContact,
  ServiceRate, DayAvailability, BookingPayment
} from '../types'

const SAMPLE_DATA_KEY = 'companion_sample_data'

export function isSampleDataActive(): boolean {
  return localStorage.getItem(SAMPLE_DATA_KEY) === 'active'
}

export function markSampleDataCleared(): void {
  localStorage.setItem(SAMPLE_DATA_KEY, 'cleared')
}

export function hasSampleDataBeenOffered(): boolean {
  return localStorage.getItem(SAMPLE_DATA_KEY) !== null
}

/**
 * Seed the database with realistic sample data.
 * All dates are relative to "now" so the data always looks fresh.
 */
export async function seedSampleData(): Promise<void> {
  // Don't seed if user already has data or already cleared samples
  const existingClients = await db.clients.count()
  if (existingClients > 0) return
  if (localStorage.getItem(SAMPLE_DATA_KEY) === 'cleared') return

  const now = new Date()
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000)
  const hoursFromNow = (n: number) => new Date(now.getTime() + n * 3600000)
  const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000)

  // ═══ IDs (stable so we can reference across tables) ═══
  const clientA = newId() // "The Regular" — verified, completed bookings
  const clientB = newId() // "The New Lead" — being screened, upcoming booking
  const clientC = newId() // "The Flagged One" — high risk
  const clientD = newId() // "The Traveler" — occasional outcall

  const bookingA1 = newId() // completed
  const bookingA2 = newId() // upcoming confirmed
  const bookingB1 = newId() // screening stage
  const bookingD1 = newId() // completed last week

  const safetyContactId = newId()

  // ═══ CLIENTS ═══
  const clients: Client[] = [
    {
      id: clientA,
      alias: 'James W.',
      phone: '(555) 234-5678',
      preferredContact: 'Text',
      screeningStatus: 'Screened',
      riskLevel: 'Low Risk',
      isBlocked: false,
      notes: 'Always punctual. Prefers evening appointments.',
      preferences: 'Quiet conversation, wine',
      boundaries: '',
      referenceSource: 'Referred by another provider',
      verificationNotes: 'ID verified, two provider references confirmed',
      dateAdded: daysAgo(45),
      lastSeen: daysAgo(5),
      clientSince: daysAgo(45),
      tags: [{ id: '1', name: 'Regular', color: '#22c55e' }, { id: '2', name: 'Verified', color: '#3b82f6' }],
      isPinned: true,
      requiresSafetyCheck: false,
    },
    {
      id: clientB,
      alias: 'M. Thompson',
      email: 'example@email.com',
      preferredContact: 'Email',
      screeningStatus: 'In Progress',
      riskLevel: 'Unknown',
      isBlocked: false,
      notes: 'New inquiry. Says he found me through my ad. Waiting on screening info.',
      preferences: '',
      boundaries: '',
      referenceSource: 'Online ad',
      dateAdded: daysAgo(2),
      tags: [{ id: '3', name: 'New', color: '#a855f7' }],
      isPinned: false,
      requiresSafetyCheck: true,
    },
    {
      id: clientC,
      alias: 'Rick D.',
      phone: '(555) 999-0000',
      preferredContact: 'Phone',
      screeningStatus: 'Screened',
      riskLevel: 'High Risk',
      isBlocked: false,
      notes: '⚠️ Showed up intoxicated last time. Proceeded but set firm boundary. Monitor closely.',
      preferences: '',
      boundaries: 'No alcohol at appointments. Will not see if intoxicated.',
      dateAdded: daysAgo(30),
      lastSeen: daysAgo(14),
      tags: [{ id: '4', name: 'Caution', color: '#ef4444' }],
      isPinned: false,
      requiresSafetyCheck: true,
    },
    {
      id: clientD,
      alias: 'David K.',
      phone: '(555) 456-7890',
      preferredContact: 'Signal',
      screeningStatus: 'Screened',
      riskLevel: 'Low Risk',
      isBlocked: false,
      notes: 'Business traveler. Sees me when he\'s in town every few weeks.',
      preferences: 'Dinner beforehand when possible',
      boundaries: '',
      referenceSource: 'P411',
      verificationNotes: 'P411 verified, 3+ OKs',
      dateAdded: daysAgo(60),
      lastSeen: daysAgo(8),
      clientSince: daysAgo(60),
      tags: [{ id: '5', name: 'Traveler', color: '#f59e0b' }, { id: '2', name: 'Verified', color: '#3b82f6' }],
      isPinned: false,
      requiresSafetyCheck: true,
    },
  ]

  // ═══ BOOKINGS ═══
  const bookings: Booking[] = [
    {
      // Completed last week — James (the regular)
      id: bookingA1,
      clientId: clientA,
      dateTime: daysAgo(5),
      duration: 120,
      locationType: 'Incall',
      status: 'Completed',
      baseRate: 600,
      extras: 0,
      travelFee: 0,
      depositAmount: 150,
      depositReceived: true,
      depositMethod: 'e-Transfer',
      paymentMethod: 'Cash',
      paymentReceived: true,
      notes: 'Great session, rebooked for next week.',
      createdAt: daysAgo(8),
      confirmedAt: daysAgo(6),
      completedAt: daysAgo(5),
      requiresSafetyCheck: false,
      safetyCheckMinutesAfter: 15,
      recurrence: 'none',
    },
    {
      // Upcoming tomorrow — James again
      id: bookingA2,
      clientId: clientA,
      dateTime: hoursFromNow(26),
      duration: 120,
      locationType: 'Incall',
      status: 'Confirmed',
      baseRate: 600,
      extras: 0,
      travelFee: 0,
      depositAmount: 150,
      depositReceived: true,
      depositMethod: 'e-Transfer',
      paymentMethod: undefined,
      paymentReceived: false,
      notes: '',
      createdAt: daysAgo(3),
      confirmedAt: daysAgo(2),
      requiresSafetyCheck: false,
      safetyCheckMinutesAfter: 15,
      recurrence: 'weekly',
    },
    {
      // New lead screening — M. Thompson
      id: bookingB1,
      clientId: clientB,
      dateTime: daysFromNow(3),
      duration: 60,
      locationType: 'Incall',
      status: 'To Be Confirmed',
      baseRate: 400,
      extras: 0,
      travelFee: 0,
      depositAmount: 100,
      depositReceived: false,
      paymentReceived: false,
      notes: 'Pending screening verification before confirming.',
      createdAt: daysAgo(1),
      requiresSafetyCheck: true,
      safetyCheckMinutesAfter: 15,
      recurrence: 'none',
    },
    {
      // Completed last week — David (the traveler)
      id: bookingD1,
      clientId: clientD,
      dateTime: daysAgo(8),
      duration: 180,
      locationType: 'Outcall',
      locationAddress: 'Hotel — downtown',
      status: 'Completed',
      baseRate: 900,
      extras: 200,
      travelFee: 50,
      depositAmount: 200,
      depositReceived: true,
      depositMethod: 'Cash App',
      paymentMethod: 'Cash',
      paymentReceived: true,
      notes: 'Dinner at Canoe, then back to his hotel. Lovely evening.',
      createdAt: daysAgo(12),
      confirmedAt: daysAgo(10),
      completedAt: daysAgo(8),
      requiresSafetyCheck: true,
      safetyCheckMinutesAfter: 15,
      recurrence: 'none',
    },
  ]

  // ═══ TRANSACTIONS ═══
  const transactions: Transaction[] = [
    // Income from James's completed booking (deposit 150 + balance 450 = 600 total)
    { id: newId(), bookingId: bookingA1, amount: 150, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(6), notes: 'Deposit' },
    { id: newId(), bookingId: bookingA1, amount: 450, type: 'income', category: 'booking', paymentMethod: 'Cash', date: daysAgo(5), notes: 'Balance payment' },
    // Deposit received for James's upcoming booking
    { id: newId(), bookingId: bookingA2, amount: 150, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(2), notes: 'Deposit' },
    // Income from David's outcall (deposit 200 + balance 950 + tip 100 = 1250 total)
    { id: newId(), bookingId: bookingD1, amount: 200, type: 'income', category: 'booking', paymentMethod: 'Cash App', date: daysAgo(10), notes: 'Deposit' },
    { id: newId(), bookingId: bookingD1, amount: 950, type: 'income', category: 'booking', paymentMethod: 'Cash', date: daysAgo(8), notes: 'Balance payment' },
    { id: newId(), bookingId: bookingD1, amount: 100, type: 'income', category: 'tip', paymentMethod: 'Cash', date: daysAgo(8), notes: 'Generous tip' },
    // Expenses
    { id: newId(), amount: 85, type: 'expense', category: 'clothing', date: daysAgo(7), notes: 'New set from La Vie en Rose', paymentMethod: undefined },
    { id: newId(), amount: 40, type: 'expense', category: 'supplies', date: daysAgo(4), notes: 'Candles, massage oil', paymentMethod: undefined },
    { id: newId(), amount: 120, type: 'expense', category: 'advertising', date: daysAgo(10), notes: 'Monthly ad renewal', paymentMethod: undefined },
  ]

  // ═══ PAYMENT LEDGER ═══
  const payments: BookingPayment[] = [
    // James completed booking — deposit + balance
    { id: newId(), bookingId: bookingA1, amount: 150, method: 'e-Transfer', label: 'Deposit', date: daysAgo(6) },
    { id: newId(), bookingId: bookingA1, amount: 450, method: 'Cash', label: 'Payment', date: daysAgo(5) },
    // James upcoming — deposit received, balance outstanding
    { id: newId(), bookingId: bookingA2, amount: 150, method: 'e-Transfer', label: 'Deposit', date: daysAgo(2) },
    // David completed — full payment + tip
    { id: newId(), bookingId: bookingD1, amount: 200, method: 'Cash App', label: 'Deposit', date: daysAgo(10) },
    { id: newId(), bookingId: bookingD1, amount: 950, method: 'Cash', label: 'Payment', date: daysAgo(8) },
    { id: newId(), bookingId: bookingD1, amount: 100, method: 'Cash', label: 'Tip', date: daysAgo(8), notes: 'Generous tip' },
    // M. Thompson — no payments yet (screening stage)
  ]

  // ═══ SAFETY CONTACT ═══
  const safetyContacts: SafetyContact[] = [
    {
      id: safetyContactId,
      name: 'Ally ✨',
      phone: '(555) 111-2222',
      relationship: 'Trusted friend',
      isPrimary: true,
      isActive: true,
    },
  ]

  // ═══ SERVICE RATES ═══
  const serviceRates: ServiceRate[] = [
    { id: newId(), name: 'Quick Visit', duration: 30, rate: 250, isActive: true, sortOrder: 0 },
    { id: newId(), name: 'Standard', duration: 60, rate: 400, isActive: true, sortOrder: 1 },
    { id: newId(), name: 'Extended', duration: 120, rate: 600, isActive: true, sortOrder: 2 },
    { id: newId(), name: 'Dinner Date', duration: 180, rate: 900, isActive: true, sortOrder: 3 },
    { id: newId(), name: 'Overnight', duration: 600, rate: 2500, isActive: true, sortOrder: 4 },
  ]

  // ═══ TODAY'S AVAILABILITY ═══
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const availability: DayAvailability[] = [
    {
      id: newId(),
      date: todayStart,
      status: 'Available',
      startTime: '12:00',
      endTime: '22:00',
      notes: 'Available afternoon through evening',
    },
  ]

  // ═══ WRITE TO DB ═══
  await db.transaction('rw',
    [db.clients, db.bookings, db.transactions, db.safetyContacts, db.serviceRates, db.availability, db.payments],
    async () => {
      await db.clients.bulkAdd(clients)
      await db.bookings.bulkAdd(bookings)
      await db.transactions.bulkAdd(transactions)
      await db.safetyContacts.bulkAdd(safetyContacts)
      await db.serviceRates.bulkAdd(serviceRates)
      await db.availability.bulkAdd(availability)
      await db.payments.bulkAdd(payments)
    }
  )

  localStorage.setItem(SAMPLE_DATA_KEY, 'active')
}

/**
 * Remove all sample data from the database.
 */
export async function clearSampleData(): Promise<void> {
  await db.transaction('rw',
    [db.clients, db.bookings, db.transactions, db.safetyContacts, db.safetyChecks, db.incidents, db.serviceRates, db.availability, db.payments],
    async () => {
      await db.clients.clear()
      await db.bookings.clear()
      await db.transactions.clear()
      await db.safetyContacts.clear()
      await db.safetyChecks.clear()
      await db.incidents.clear()
      await db.serviceRates.clear()
      await db.availability.clear()
      await db.payments.clear()
    }
  )
  markSampleDataCleared()
}
