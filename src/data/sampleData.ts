import { db, newId } from '../db'
import type {
  Client, Booking, Transaction, SafetyContact, SafetyCheck,
  ServiceRate, DayAvailability, BookingPayment, IncallVenue,
  IncidentLog, JournalEntry
} from '../types'

const SAMPLE_DATA_KEY = 'companion_sample_data'
export const SAMPLE_DATA_EVENT = 'sample-data-change'

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
 * Seed the database with realistic sample data showcasing every feature.
 * All dates are relative to "now" so the data always looks fresh.
 */
export async function seedSampleData(): Promise<void> {
  const existingClients = await db.clients.count()
  if (existingClients > 0) return
  if (localStorage.getItem(SAMPLE_DATA_KEY) === 'cleared') return

  const now = new Date()
  const daysAgo = (n: number, hour = 0) => {
    const d = new Date(now.getTime() - n * 86400000)
    if (hour) d.setHours(hour, 0, 0, 0)
    return d
  }
  const hoursFromNow = (n: number) => new Date(now.getTime() + n * 3600000)
  const daysFromNow = (n: number, hour = 0) => {
    const d = new Date(now.getTime() + n * 86400000)
    if (hour) d.setHours(hour, 0, 0, 0)
    return d
  }

  // ═══════════════════════════════════════════════════════════
  // IDs
  // ═══════════════════════════════════════════════════════════

  // Clients
  const cJames     = newId()
  const cSophia    = newId()
  const cMThompson = newId()
  const cRick      = newId()
  const cDavid     = newId()
  const cEthan     = newId()
  const cLiam      = newId()
  const cOliver    = newId()
  const cBlocked   = newId()

  // Venues
  const vDowntown  = newId()
  const vMidtown   = newId()
  const vAirbnb    = newId()
  const vHotel     = newId()
  const vArchived  = newId()

  // Bookings
  const bJames1  = newId()
  const bJames2  = newId()
  const bJames3  = newId()
  const bSophia1 = newId()
  const bSophia2 = newId()
  const bMT1     = newId()
  const bRick1   = newId()
  const bDavid1  = newId()
  const bDavid2  = newId()
  const bEthan1  = newId()
  const bLiam1   = newId()
  const bLiam2   = newId()
  const bLiam3   = newId()

  // Safety contacts
  const safetyAlly = newId()
  const safetyKim  = newId()

  // ═══════════════════════════════════════════════════════════
  // PROFILE (localStorage)
  // ═══════════════════════════════════════════════════════════
  // useLocalStorage stores values via JSON.stringify, so sample data must match.
  // We also dispatch ls-sync events so already-mounted useLocalStorage hooks
  // pick up the new values (ProfilePage is always in the DOM).
  function setLS(key: string, value: unknown) {
    const json = JSON.stringify(value)
    localStorage.setItem(key, json)
    window.dispatchEvent(new CustomEvent('ls-sync', { detail: { key, value } }))
  }
  setLS('profileWorkingName', 'Valentina Rose')
  setLS('profileWorkEmail', 'valentina@protonmail.com')
  setLS('profileWorkPhone', '(555) 800-7777')
  setLS('profileWebsite', 'https://valentinarose.com')
  setLS('profileTagline', 'Refined companionship for discerning gentlemen')
  setLS('profileSetupDone', true)
  setLS('defaultDepositType', 'percent')
  setLS('defaultDepositPercentage', 25)
  setLS('defaultDepositFlat', 0)
  setLS('currency', 'USD')
  setLS('introTemplate',
    'Hi {client}! Thank you for your inquiry. ✨\n\nMy name is {name}. Here is some information about my services:\n\n{rates}\n\nA deposit of {deposit} is required to confirm a booking.\n\nYou can learn more at {website} or reach me at {email}.\n\nLooking forward to hearing from you!\n\n— {name}'
  )
  setLS('directionsTemplate',
    'Hi! Here are the directions to our meeting:\n\n📍 {address}\n\n{directions}\n\nSee you soon!\n— {name}'
  )

  // ═══════════════════════════════════════════════════════════
  // CLIENTS (9)
  // ═══════════════════════════════════════════════════════════
  const clients: Client[] = [
    {
      id: cJames,
      alias: 'James W.',
      nickname: 'Jamie',
      phone: '(555) 234-5678',
      email: 'james.w@email.com',
      preferredContact: 'Text',
      secondaryContact: 'Email',
      screeningStatus: 'Screened',
      screeningMethod: 'Provider Reference',
      riskLevel: 'Low Risk',
      isBlocked: false,
      notes: 'Always punctual. Prefers evening appointments. Allergic to strong perfumes.',
      preferences: 'Quiet conversation, wine, soft jazz music',
      boundaries: '',
      referenceSource: 'Referred by another provider (Aria)',
      verificationNotes: 'ID verified — James Whitfield. Two provider references confirmed (Aria, Scarlett).',
      dateAdded: daysAgo(90),
      lastSeen: daysAgo(5),
      clientSince: daysAgo(90),
      birthday: new Date(1985, 6, 15),
      tags: [
        { id: '1', name: 'Regular', color: '#22c55e' },
        { id: '2', name: 'Verified', color: '#3b82f6' },
        { id: '6', name: 'Generous', color: '#f59e0b' },
      ],
      isPinned: true,
      requiresSafetyCheck: false,
    },
    {
      id: cSophia,
      alias: 'Sophia M.',
      phone: '(555) 312-9900',
      telegram: '@sophia_m_private',
      preferredContact: 'Telegram',
      secondaryContact: 'Phone',
      screeningStatus: 'Screened',
      screeningMethod: 'LinkedIn',
      riskLevel: 'Low Risk',
      isBlocked: false,
      notes: 'VP at a tech startup. Very private — never use real name in messages.',
      preferences: 'Fine dining, intellectual conversation, spa-like ambiance',
      boundaries: 'No photos ever. No social media mentions.',
      referenceSource: 'Private referral network',
      verificationNotes: 'LinkedIn verified — VP of Engineering at a Series B startup.',
      dateAdded: daysAgo(60),
      lastSeen: daysAgo(21),
      clientSince: daysAgo(60),
      tags: [
        { id: '7', name: 'VIP', color: '#a855f7' },
        { id: '2', name: 'Verified', color: '#3b82f6' },
      ],
      isPinned: true,
      requiresSafetyCheck: false,
    },
    {
      id: cMThompson,
      alias: 'M. Thompson',
      email: 'mthompson.inquiry@gmail.com',
      preferredContact: 'Email',
      screeningStatus: 'In Progress',
      riskLevel: 'Unknown',
      isBlocked: false,
      notes: 'New inquiry via website. Sent screening form, waiting on response.',
      preferences: '',
      boundaries: '',
      referenceSource: 'Online ad — Tryst',
      dateAdded: daysAgo(2),
      tags: [{ id: '3', name: 'New', color: '#a855f7' }],
      isPinned: false,
      requiresSafetyCheck: true,
    },
    {
      id: cRick,
      alias: 'Rick D.',
      phone: '(555) 999-0000',
      preferredContact: 'Phone',
      screeningStatus: 'Screened',
      screeningMethod: 'ID',
      riskLevel: 'High Risk',
      isBlocked: false,
      notes: '⚠️ Showed up intoxicated once. Proceeded but set firm boundary. One more incident and he\'s blocked.',
      preferences: '',
      boundaries: 'No alcohol at appointments. Will not see if intoxicated. No GFE.',
      referenceSource: 'Eros ad',
      verificationNotes: 'Government ID verified. Real name: Richard Donovan.',
      dateAdded: daysAgo(45),
      lastSeen: daysAgo(14),
      tags: [{ id: '4', name: 'Caution', color: '#ef4444' }],
      isPinned: false,
      requiresSafetyCheck: true,
    },
    {
      id: cDavid,
      alias: 'David K.',
      signal: '+15551234567',
      whatsapp: '+15551234567',
      preferredContact: 'Signal',
      secondaryContact: 'WhatsApp',
      screeningStatus: 'Screened',
      screeningMethod: 'Employment',
      riskLevel: 'Low Risk',
      isBlocked: false,
      notes: 'Management consultant. Travels frequently. Sees me every 2-3 weeks when in town.',
      preferences: 'Dinner beforehand. Enjoys Thai and Italian.',
      boundaries: '',
      referenceSource: 'P411',
      verificationNotes: 'P411 verified, 5+ OKs. Senior consultant at McKinsey.',
      dateAdded: daysAgo(120),
      lastSeen: daysAgo(10),
      clientSince: daysAgo(120),
      birthday: new Date(1978, 2, 22),
      tags: [
        { id: '5', name: 'Traveler', color: '#f59e0b' },
        { id: '2', name: 'Verified', color: '#3b82f6' },
        { id: '6', name: 'Generous', color: '#f59e0b' },
      ],
      isPinned: false,
      requiresSafetyCheck: true,
    },
    {
      id: cEthan,
      alias: 'Ethan R.',
      email: 'ethan.r.private@protonmail.com',
      telegram: '@ethan_r',
      preferredContact: 'Email',
      secondaryContact: 'Telegram',
      screeningStatus: 'Screened',
      screeningMethod: 'Phone',
      riskLevel: 'Low Risk',
      isBlocked: false,
      notes: 'Virtual-only client. Lives out of state. Very respectful.',
      preferences: 'Video calls, lingerie, conversation-heavy sessions',
      boundaries: 'No screenshots, no recording. Virtual only.',
      referenceSource: 'Twitter DM',
      dateAdded: daysAgo(30),
      lastSeen: daysAgo(7),
      tags: [{ id: '8', name: 'Virtual', color: '#06b6d4' }],
      isPinned: false,
      requiresSafetyCheck: false,
    },
    {
      id: cLiam,
      alias: 'Liam P.',
      phone: '(555) 777-3333',
      preferredContact: 'Text',
      screeningStatus: 'Screened',
      screeningMethod: 'Deposit',
      riskLevel: 'Medium Risk',
      isBlocked: false,
      notes: 'History of cancelling and one no-show. Gave another chance after apology and no-show fee. Higher deposit required.',
      preferences: '',
      boundaries: '',
      referenceSource: 'Tryst',
      verificationNotes: 'Screened via deposit only. No ID on file.',
      dateAdded: daysAgo(40),
      lastSeen: daysAgo(25),
      tags: [{ id: '9', name: 'Flaky', color: '#f97316' }],
      isPinned: false,
      requiresSafetyCheck: true,
    },
    {
      id: cOliver,
      alias: 'Oliver',
      phone: '(555) 222-8888',
      preferredContact: 'Text',
      screeningStatus: 'Unscreened',
      riskLevel: 'Unknown',
      isBlocked: false,
      notes: 'Texted asking about rates. Hasn\'t responded to screening request yet.',
      preferences: '',
      boundaries: '',
      referenceSource: 'Unknown — cold text',
      dateAdded: daysAgo(1),
      tags: [{ id: '3', name: 'New', color: '#a855f7' }],
      isPinned: false,
      requiresSafetyCheck: true,
    },
    {
      id: cBlocked,
      alias: 'Craig B.',
      phone: '(555) 666-0000',
      preferredContact: 'Phone',
      screeningStatus: 'Screened',
      screeningMethod: 'ID',
      riskLevel: 'High Risk',
      isBlocked: true,
      notes: '🚫 BLOCKED. Became aggressive when asked to leave. Alert sent to provider network.',
      preferences: '',
      boundaries: '',
      referenceSource: 'Leolist',
      verificationNotes: 'ID on file. Shared with trusted provider network as safety warning.',
      dateAdded: daysAgo(75),
      lastSeen: daysAgo(60),
      tags: [{ id: '10', name: 'Blacklisted', color: '#dc2626' }],
      isPinned: false,
      requiresSafetyCheck: true,
    },
  ]

  // ═══════════════════════════════════════════════════════════
  // INCALL VENUES (5 — 4 active, 1 archived)
  // ═══════════════════════════════════════════════════════════
  const venues: IncallVenue[] = [
    {
      id: vDowntown,
      name: 'The Palisade',
      venueType: 'Apartment',
      city: 'Downtown',
      address: '1200 Bay St, Unit 2205',
      directions: 'Enter through the main lobby. Elevator to 22nd floor, turn left. Unit 2205 at end of hall.',
      accessMethod: 'Code',
      accessNotes: 'Lobby code: 2205#. Unit door: same code.',
      costPerDay: 120,
      costNotes: 'Monthly lease — $3,600/mo.',
      hotelFriendly: true,
      notes: 'Primary incall. Great views, very private. Parking in P2 — $15/day.',
      isFavorite: true,
      isArchived: false,
      createdAt: daysAgo(80),
      updatedAt: daysAgo(5),
    },
    {
      id: vMidtown,
      name: 'Midtown Studio',
      venueType: 'Studio',
      city: 'Midtown',
      address: '455 King St W, Suite 8B',
      directions: 'Side entrance off the alley (blue door). Buzzer 8B. Walk up to 2nd floor.',
      accessMethod: 'Lockbox',
      accessNotes: 'Lockbox on blue door handle. Code: 7734.',
      costPerDay: 80,
      notes: 'Backup location. Smaller but cozy. Good for shorter sessions.',
      isFavorite: false,
      isArchived: false,
      createdAt: daysAgo(60),
      updatedAt: daysAgo(30),
    },
    {
      id: vAirbnb,
      name: 'Lakeview Retreat',
      venueType: 'Airbnb',
      city: 'Lakeshore',
      address: '88 Queens Quay W, Unit 1404',
      directions: 'Main entrance faces the lake. Tell concierge you\'re visiting Unit 1404.',
      contactName: 'Host: Maria L.',
      contactPhone: '(555) 444-9999',
      accessMethod: 'App',
      accessNotes: 'Airbnb app self check-in. Keypad code sent 24h before.',
      bookingApp: 'Airbnb',
      bookingNotes: 'Book under personal account. 2-night minimum. ~$189/night.',
      costPerDay: 189,
      hotelFriendly: true,
      notes: 'Gorgeous lake views. Use for special occasions or dinner dates.',
      isFavorite: true,
      isArchived: false,
      createdAt: daysAgo(45),
      updatedAt: daysAgo(20),
    },
    {
      id: vHotel,
      name: 'The Ritz-Carlton',
      venueType: 'Hotel',
      city: 'Downtown',
      address: '181 Wellington St W',
      directions: 'Main entrance on Wellington. Room number provided day-of.',
      contactPhone: '(555) 300-1000',
      accessMethod: 'Front Desk',
      accessNotes: 'Book under personal name. Request high floor, king bed.',
      bookingApp: 'Hotels.com',
      bookingNotes: 'Use points when available. Otherwise ~$350/night.',
      costPerDay: 350,
      hotelFriendly: true,
      notes: 'VIP clients only. Ultra-discreet staff.',
      isFavorite: false,
      isArchived: false,
      createdAt: daysAgo(40),
      updatedAt: daysAgo(40),
    },
    {
      id: vArchived,
      name: 'Old Studio (Queen E)',
      venueType: 'Studio',
      city: 'East End',
      address: '921 Queen St E, Rear Unit',
      directions: 'Walk down the driveway past the main house. Rear unit on the left.',
      accessMethod: 'Key Handoff',
      accessNotes: 'Had issues with noise complaints.',
      costPerDay: 60,
      notes: 'Discontinued — too many issues with neighbors. Lease ended.',
      isFavorite: false,
      isArchived: true,
      createdAt: daysAgo(150),
      updatedAt: daysAgo(90),
    },
  ]

  // ═══════════════════════════════════════════════════════════
  // BOOKINGS (13)
  // ═══════════════════════════════════════════════════════════
  const bookings: Booking[] = [
    // ── James: weekly regular ──
    {
      id: bJames1, clientId: cJames,
      dateTime: daysAgo(12, 19), duration: 120,
      locationType: 'Incall', venueId: vDowntown,
      status: 'Completed', baseRate: 600, extras: 0, travelFee: 0,
      depositAmount: 150, depositReceived: true, depositMethod: 'e-Transfer',
      paymentMethod: 'Cash', paymentReceived: true,
      notes: '', createdAt: daysAgo(15), confirmedAt: daysAgo(13), completedAt: daysAgo(12),
      requiresSafetyCheck: false, safetyCheckMinutesAfter: 15,
      recurrence: 'weekly',
    },
    {
      id: bJames2, clientId: cJames,
      dateTime: daysAgo(5, 19), duration: 120,
      locationType: 'Incall', venueId: vDowntown,
      status: 'Completed', baseRate: 600, extras: 0, travelFee: 0,
      depositAmount: 150, depositReceived: true, depositMethod: 'e-Transfer',
      paymentMethod: 'Cash', paymentReceived: true,
      notes: 'Brought a nice bottle of wine.', createdAt: daysAgo(12), confirmedAt: daysAgo(6), completedAt: daysAgo(5),
      requiresSafetyCheck: false, safetyCheckMinutesAfter: 15,
      recurrence: 'weekly', parentBookingId: bJames1, recurrenceRootId: bJames1,
    },
    {
      id: bJames3, clientId: cJames,
      dateTime: hoursFromNow(26), duration: 120,
      locationType: 'Incall', venueId: vDowntown,
      status: 'Confirmed', baseRate: 600, extras: 0, travelFee: 0,
      depositAmount: 150, depositReceived: true, depositMethod: 'e-Transfer',
      paymentReceived: false, notes: '',
      createdAt: daysAgo(5), confirmedAt: daysAgo(4),
      requiresSafetyCheck: false, safetyCheckMinutesAfter: 15,
      recurrence: 'weekly', parentBookingId: bJames2, recurrenceRootId: bJames1,
    },

    // ── Sophia: dinner date ──
    {
      id: bSophia1, clientId: cSophia,
      dateTime: daysAgo(21, 18), duration: 180,
      locationType: 'Incall', venueId: vAirbnb,
      status: 'Completed', baseRate: 900, extras: 200, travelFee: 0,
      depositAmount: 275, depositReceived: true, depositMethod: 'e-Transfer',
      paymentMethod: 'e-Transfer', paymentReceived: true,
      notes: 'Dinner at Canoe, then back to the Lakeview.',
      createdAt: daysAgo(28), confirmedAt: daysAgo(23), completedAt: daysAgo(21),
      requiresSafetyCheck: false, safetyCheckMinutesAfter: 15, recurrence: 'none',
    },
    {
      id: bSophia2, clientId: cSophia,
      dateTime: daysFromNow(5, 18), duration: 180,
      locationType: 'Incall', venueId: vAirbnb,
      status: 'Confirmed', baseRate: 900, extras: 200, travelFee: 0,
      depositAmount: 275, depositReceived: true, depositMethod: 'e-Transfer',
      paymentReceived: false, notes: 'She requested the Lakeview again.',
      createdAt: daysAgo(7), confirmedAt: daysAgo(5),
      requiresSafetyCheck: false, safetyCheckMinutesAfter: 15, recurrence: 'none',
    },

    // ── M. Thompson: new lead ──
    {
      id: bMT1, clientId: cMThompson,
      dateTime: daysFromNow(4, 20), duration: 60,
      locationType: 'Incall',
      status: 'To Be Confirmed', baseRate: 400, extras: 0, travelFee: 0,
      depositAmount: 100, depositReceived: false, paymentReceived: false,
      notes: 'Pending screening. Will confirm venue once screening passes.',
      createdAt: daysAgo(1),
      requiresSafetyCheck: true, safetyCheckMinutesAfter: 15, recurrence: 'none',
    },

    // ── Rick: flagged ──
    {
      id: bRick1, clientId: cRick,
      dateTime: daysAgo(14, 21), duration: 60,
      locationType: 'Incall', venueId: vMidtown,
      status: 'Completed', baseRate: 400, extras: 0, travelFee: 0,
      depositAmount: 100, depositReceived: true, depositMethod: 'Cash',
      paymentMethod: 'Cash', paymentReceived: true,
      notes: 'Arrived sober. Session went fine.',
      createdAt: daysAgo(17), confirmedAt: daysAgo(15), completedAt: daysAgo(14),
      requiresSafetyCheck: true, safetyCheckMinutesAfter: 15, recurrence: 'none',
    },

    // ── David: business traveler ──
    {
      id: bDavid1, clientId: cDavid,
      dateTime: daysAgo(10, 18), duration: 180,
      locationType: 'Outcall', locationAddress: 'Shangri-La Hotel, Suite 3201',
      status: 'Completed', baseRate: 900, extras: 200, travelFee: 50,
      depositAmount: 250, depositReceived: true, depositMethod: 'Cash App',
      paymentMethod: 'Cash', paymentReceived: true,
      notes: 'Dinner at Pai, then his suite. Left a generous tip.',
      createdAt: daysAgo(14), confirmedAt: daysAgo(12), completedAt: daysAgo(10),
      requiresSafetyCheck: true, safetyCheckMinutesAfter: 15, recurrence: 'none',
    },
    {
      id: bDavid2, clientId: cDavid,
      dateTime: daysFromNow(8, 18), duration: 180,
      locationType: 'Outcall', locationAddress: 'Hotel TBD',
      status: 'Pending Deposit', baseRate: 900, extras: 200, travelFee: 50,
      depositAmount: 250, depositReceived: false, depositMethod: 'Cash App',
      paymentReceived: false, notes: 'Tentatively in town. Waiting on deposit.',
      createdAt: daysAgo(3),
      requiresSafetyCheck: true, safetyCheckMinutesAfter: 15, recurrence: 'none',
    },

    // ── Ethan: virtual ──
    {
      id: bEthan1, clientId: cEthan,
      dateTime: daysAgo(7, 21), duration: 60,
      locationType: 'Virtual',
      status: 'Completed', baseRate: 250, extras: 0, travelFee: 0,
      depositAmount: 250, depositReceived: true, depositMethod: 'Crypto',
      paymentReceived: true, notes: 'Video call via Signal. Relaxed and fun.',
      createdAt: daysAgo(10), confirmedAt: daysAgo(8), completedAt: daysAgo(7),
      requiresSafetyCheck: false, safetyCheckMinutesAfter: 15, recurrence: 'biweekly',
    },

    // ── Liam: flaky history ──
    {
      id: bLiam1, clientId: cLiam,
      dateTime: daysAgo(30, 20), duration: 60,
      locationType: 'Incall', venueId: vDowntown,
      status: 'Cancelled', baseRate: 400, extras: 0, travelFee: 0,
      depositAmount: 100, depositReceived: true, depositMethod: 'e-Transfer',
      paymentReceived: false, notes: 'Cancelled 2 hours before.',
      createdAt: daysAgo(35), confirmedAt: daysAgo(32), cancelledAt: daysAgo(30),
      cancelledBy: 'client', cancellationReason: 'Something came up', depositOutcome: 'forfeited',
      requiresSafetyCheck: true, safetyCheckMinutesAfter: 15, recurrence: 'none',
    },
    {
      id: bLiam2, clientId: cLiam,
      dateTime: daysAgo(25, 20), duration: 60,
      locationType: 'Incall', venueId: vDowntown,
      status: 'No Show', baseRate: 400, extras: 0, travelFee: 0,
      depositAmount: 100, depositReceived: true, depositMethod: 'e-Transfer',
      paymentReceived: false, notes: 'No show, no message. $200 no-show fee charged.',
      createdAt: daysAgo(28), confirmedAt: daysAgo(26), cancelledAt: daysAgo(25),
      cancelledBy: 'client', depositOutcome: 'forfeited',
      requiresSafetyCheck: true, safetyCheckMinutesAfter: 15, recurrence: 'none',
    },
    {
      id: bLiam3, clientId: cLiam,
      dateTime: daysFromNow(3, 20), duration: 60,
      locationType: 'Incall', venueId: vDowntown,
      status: 'Confirmed', baseRate: 400, extras: 0, travelFee: 0,
      depositAmount: 200, depositReceived: true, depositMethod: 'e-Transfer',
      paymentReceived: false, notes: 'Another chance. Higher deposit. If he flakes, he\'s done.',
      createdAt: daysAgo(5), confirmedAt: daysAgo(3),
      requiresSafetyCheck: true, safetyCheckMinutesAfter: 15, recurrence: 'none',
    },
  ]

  // ═══════════════════════════════════════════════════════════
  // PAYMENT LEDGER
  // ═══════════════════════════════════════════════════════════
  const payments: BookingPayment[] = [
    { id: newId(), bookingId: bJames1, amount: 150, method: 'e-Transfer', label: 'Deposit', date: daysAgo(13) },
    { id: newId(), bookingId: bJames1, amount: 450, method: 'Cash', label: 'Payment', date: daysAgo(12) },
    { id: newId(), bookingId: bJames2, amount: 150, method: 'e-Transfer', label: 'Deposit', date: daysAgo(6) },
    { id: newId(), bookingId: bJames2, amount: 450, method: 'Cash', label: 'Payment', date: daysAgo(5) },
    { id: newId(), bookingId: bJames3, amount: 150, method: 'e-Transfer', label: 'Deposit', date: daysAgo(3) },
    { id: newId(), bookingId: bSophia1, amount: 275, method: 'e-Transfer', label: 'Deposit', date: daysAgo(23) },
    { id: newId(), bookingId: bSophia1, amount: 825, method: 'e-Transfer', label: 'Payment', date: daysAgo(21) },
    { id: newId(), bookingId: bSophia2, amount: 275, method: 'e-Transfer', label: 'Deposit', date: daysAgo(4) },
    { id: newId(), bookingId: bRick1, amount: 100, method: 'Cash', label: 'Deposit', date: daysAgo(14) },
    { id: newId(), bookingId: bRick1, amount: 300, method: 'Cash', label: 'Payment', date: daysAgo(14) },
    { id: newId(), bookingId: bDavid1, amount: 250, method: 'Cash App', label: 'Deposit', date: daysAgo(12) },
    { id: newId(), bookingId: bDavid1, amount: 900, method: 'Cash', label: 'Payment', date: daysAgo(10) },
    { id: newId(), bookingId: bDavid1, amount: 150, method: 'Cash', label: 'Tip', date: daysAgo(10), notes: 'Very generous' },
    { id: newId(), bookingId: bEthan1, amount: 250, method: 'Crypto', label: 'Deposit', date: daysAgo(8) },
    { id: newId(), bookingId: bLiam1, amount: 100, method: 'e-Transfer', label: 'Deposit', date: daysAgo(32) },
    { id: newId(), bookingId: bLiam2, amount: 100, method: 'e-Transfer', label: 'Deposit', date: daysAgo(26) },
    { id: newId(), bookingId: bLiam2, amount: 200, method: 'e-Transfer', label: 'Cancellation Fee', date: daysAgo(24), notes: 'No-show fee' },
    { id: newId(), bookingId: bLiam3, amount: 200, method: 'e-Transfer', label: 'Deposit', date: daysAgo(3) },
  ]

  // ═══════════════════════════════════════════════════════════
  // TRANSACTIONS
  // ═══════════════════════════════════════════════════════════
  const transactions: Transaction[] = [
    // Income
    { id: newId(), bookingId: bJames1, amount: 150, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(13), notes: 'Deposit' },
    { id: newId(), bookingId: bJames1, amount: 450, type: 'income', category: 'booking', paymentMethod: 'Cash', date: daysAgo(12), notes: 'Balance' },
    { id: newId(), bookingId: bJames2, amount: 150, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(6), notes: 'Deposit' },
    { id: newId(), bookingId: bJames2, amount: 450, type: 'income', category: 'booking', paymentMethod: 'Cash', date: daysAgo(5), notes: 'Balance' },
    { id: newId(), bookingId: bJames3, amount: 150, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(3), notes: 'Deposit' },
    { id: newId(), bookingId: bSophia1, amount: 275, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(23), notes: 'Deposit' },
    { id: newId(), bookingId: bSophia1, amount: 825, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(21), notes: 'Balance' },
    { id: newId(), bookingId: bSophia2, amount: 275, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(4), notes: 'Deposit' },
    { id: newId(), bookingId: bRick1, amount: 400, type: 'income', category: 'booking', paymentMethod: 'Cash', date: daysAgo(14), notes: 'Full payment at door' },
    { id: newId(), bookingId: bDavid1, amount: 250, type: 'income', category: 'booking', paymentMethod: 'Cash App', date: daysAgo(12), notes: 'Deposit' },
    { id: newId(), bookingId: bDavid1, amount: 900, type: 'income', category: 'booking', paymentMethod: 'Cash', date: daysAgo(10), notes: 'Balance' },
    { id: newId(), bookingId: bDavid1, amount: 150, type: 'income', category: 'tip', paymentMethod: 'Cash', date: daysAgo(10), notes: 'Generous tip' },
    { id: newId(), bookingId: bEthan1, amount: 250, type: 'income', category: 'booking', paymentMethod: 'Crypto', date: daysAgo(8), notes: 'Prepaid virtual' },
    { id: newId(), bookingId: bLiam1, amount: 100, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(32), notes: 'Forfeited deposit' },
    { id: newId(), bookingId: bLiam2, amount: 100, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(26), notes: 'Forfeited deposit' },
    { id: newId(), bookingId: bLiam2, amount: 200, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(24), notes: 'No-show fee' },
    { id: newId(), bookingId: bLiam3, amount: 200, type: 'income', category: 'booking', paymentMethod: 'e-Transfer', date: daysAgo(3), notes: 'Deposit' },

    // Expenses (diverse categories)
    { id: newId(), amount: 3600, type: 'expense', category: 'rent', date: daysAgo(15), notes: 'Monthly lease — The Palisade' },
    { id: newId(), amount: 189, type: 'expense', category: 'rent', date: daysAgo(22), notes: 'Airbnb — Lakeview, 1 night' },
    { id: newId(), amount: 120, type: 'expense', category: 'advertising', date: daysAgo(10), notes: 'Tryst premium listing — monthly' },
    { id: newId(), amount: 45, type: 'expense', category: 'advertising', date: daysAgo(10), notes: 'Eros ad renewal' },
    { id: newId(), amount: 95, type: 'expense', category: 'clothing', date: daysAgo(8), notes: 'New lingerie — Agent Provocateur' },
    { id: newId(), amount: 250, type: 'expense', category: 'clothing', date: daysAgo(25), notes: 'New dress for dinner dates' },
    { id: newId(), amount: 55, type: 'expense', category: 'supplies', date: daysAgo(6), notes: 'Candles, massage oil, condoms' },
    { id: newId(), amount: 60, type: 'expense', category: 'supplies', date: daysAgo(3), notes: 'Wine & snacks for sessions' },
    { id: newId(), amount: 180, type: 'expense', category: 'health', date: daysAgo(20), notes: 'STI panel — quarterly screening' },
    { id: newId(), amount: 85, type: 'expense', category: 'phone', date: daysAgo(15), notes: 'Work phone bill — monthly' },
    { id: newId(), amount: 40, type: 'expense', category: 'travel', date: daysAgo(10), notes: 'Uber to Shangri-La for David' },
    { id: newId(), amount: 75, type: 'expense', category: 'other', date: daysAgo(18), notes: 'Nail appointment' },
  ]

  // ═══════════════════════════════════════════════════════════
  // SAFETY
  // ═══════════════════════════════════════════════════════════
  const safetyContacts: SafetyContact[] = [
    { id: safetyAlly, name: 'Ally ✨', phone: '(555) 111-2222', relationship: 'Trusted provider friend', isPrimary: true, isActive: true },
    { id: safetyKim, name: 'Kim', phone: '(555) 333-4444', relationship: 'Close friend (civilian)', isPrimary: false, isActive: true },
  ]

  const safetyChecks: SafetyCheck[] = [
    {
      id: newId(), bookingId: bRick1, safetyContactId: safetyAlly,
      scheduledTime: new Date(daysAgo(14, 21).getTime() + 15 * 60000),
      bufferMinutes: 10, status: 'checkedIn',
      checkedInAt: new Date(daysAgo(14, 21).getTime() + 12 * 60000),
    },
    {
      id: newId(), bookingId: bDavid1, safetyContactId: safetyAlly,
      scheduledTime: new Date(daysAgo(10, 18).getTime() + 15 * 60000),
      bufferMinutes: 10, status: 'checkedIn',
      checkedInAt: new Date(daysAgo(10, 18).getTime() + 20 * 60000),
    },
  ]

  // ═══════════════════════════════════════════════════════════
  // INCIDENTS
  // ═══════════════════════════════════════════════════════════
  const incidents: IncidentLog[] = [
    {
      id: newId(), clientId: cRick, date: daysAgo(45), severity: 'high',
      description: 'Client arrived visibly intoxicated. Slurred speech, unsteady on feet.',
      actionTaken: 'Proceeded with clear boundaries. Informed client this cannot happen again. Documented and shared with Ally.',
    },
    {
      id: newId(), clientId: cBlocked, date: daysAgo(60), severity: 'critical',
      description: 'Client became verbally aggressive when asked to respect a boundary. Raised voice, used intimidating language. Refused to leave for several minutes.',
      actionTaken: 'Remained calm. Texted Ally safety code. Client eventually left. Permanently blocked. Alert sent to local provider network.',
    },
  ]

  // ═══════════════════════════════════════════════════════════
  // JOURNAL ENTRIES
  // ═══════════════════════════════════════════════════════════
  const journalEntries: JournalEntry[] = [
    {
      id: newId(), bookingId: bJames2, clientId: cJames, date: daysAgo(5),
      notes: 'Another lovely evening with James. He brought a really nice Malbec. We talked about his trip to Portugal. Session was relaxed and unhurried. He mentioned wanting to try the dinner date format next time.',
      tags: ['Regular', 'Great Chemistry', 'Relaxed', 'Respectful'],
      actualDuration: 130, timingNotes: 'Ran about 10 min over — didn\'t mind',
      createdAt: daysAgo(5), updatedAt: daysAgo(5),
    },
    {
      id: newId(), bookingId: bSophia1, clientId: cSophia, date: daysAgo(21),
      notes: 'Dinner at Canoe was incredible. She ordered for us both — impeccable taste. The Lakeview condo was perfect. She left a very generous tip via e-Transfer the next morning. Definitely my favorite client.',
      tags: ['Great Chemistry', 'Generous', 'Relaxed'],
      actualDuration: 200, timingNotes: 'Dinner ran long. About 3.5hrs total.',
      createdAt: daysAgo(21), updatedAt: daysAgo(21),
    },
    {
      id: newId(), bookingId: bRick1, clientId: cRick, date: daysAgo(14),
      notes: 'Rick was sober this time. Session went fine. He was respectful of the boundaries we discussed. Still on watch but cautiously optimistic.',
      tags: ['Respectful'],
      actualDuration: 55, timingNotes: 'Left a few min early',
      createdAt: daysAgo(14), updatedAt: daysAgo(14),
    },
    {
      id: newId(), bookingId: bDavid1, clientId: cDavid, date: daysAgo(10),
      notes: 'David is always a highlight. Dinner at Pai was fun — we both love Thai food. His suite was gorgeous. Left $150 cash tip. Already looking forward to his next visit.',
      tags: ['Great Chemistry', 'Generous', 'Relaxed', 'Regular'],
      actualDuration: 190, timingNotes: 'Went a bit over. No issue.',
      createdAt: daysAgo(10), updatedAt: daysAgo(10),
    },
    {
      id: newId(), bookingId: bEthan1, clientId: cEthan, date: daysAgo(7),
      notes: 'Virtual session via Signal. Ethan is always fun and creative. Easy to talk to. The biweekly schedule works well for both of us.',
      tags: ['Regular', 'Relaxed', 'New Experience'],
      actualDuration: 65, timingNotes: 'Ran a couple minutes over',
      createdAt: daysAgo(7), updatedAt: daysAgo(7),
    },
  ]

  // ═══════════════════════════════════════════════════════════
  // SERVICE RATES
  // ═══════════════════════════════════════════════════════════
  const serviceRates: ServiceRate[] = [
    { id: newId(), name: 'Quick Visit', duration: 30, rate: 250, isActive: true, sortOrder: 0 },
    { id: newId(), name: 'Standard', duration: 60, rate: 400, isActive: true, sortOrder: 1 },
    { id: newId(), name: 'Extended', duration: 120, rate: 600, isActive: true, sortOrder: 2 },
    { id: newId(), name: 'Dinner Date', duration: 180, rate: 900, isActive: true, sortOrder: 3 },
    { id: newId(), name: 'Half Day', duration: 360, rate: 1800, isActive: true, sortOrder: 4 },
    { id: newId(), name: 'Overnight', duration: 600, rate: 2500, isActive: true, sortOrder: 5 },
    { id: newId(), name: 'Virtual Session', duration: 60, rate: 250, isActive: true, sortOrder: 6 },
  ]

  // ═══════════════════════════════════════════════════════════
  // AVAILABILITY (9 days)
  // ═══════════════════════════════════════════════════════════
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayMs = 86400000
  const availability: DayAvailability[] = [
    { id: newId(), date: todayStart, status: 'Available', startTime: '12:00', endTime: '22:00', notes: 'Afternoon through evening' },
    { id: newId(), date: new Date(todayStart.getTime() + 1 * dayMs), status: 'Available', startTime: '18:00', endTime: '23:00', notes: 'Evening only — James at 7pm' },
    { id: newId(), date: new Date(todayStart.getTime() + 2 * dayMs), status: 'Off', notes: 'Personal day' },
    { id: newId(), date: new Date(todayStart.getTime() + 3 * dayMs), status: 'Available', startTime: '10:00', endTime: '22:00', notes: 'Liam at 8pm' },
    { id: newId(), date: new Date(todayStart.getTime() + 4 * dayMs), status: 'Limited', startTime: '14:00', endTime: '18:00', notes: 'Morning appointment. M. Thompson if screening clears.' },
    { id: newId(), date: new Date(todayStart.getTime() + 5 * dayMs), status: 'Available', startTime: '10:00', endTime: '23:00', notes: 'Sophia dinner at 6pm' },
    { id: newId(), date: new Date(todayStart.getTime() + 6 * dayMs), status: 'Available', startTime: '12:00', endTime: '22:00' },
    { id: newId(), date: new Date(todayStart.getTime() + 7 * dayMs), status: 'Off', notes: 'Weekend off' },
    { id: newId(), date: new Date(todayStart.getTime() + 8 * dayMs), status: 'Available', startTime: '10:00', endTime: '22:00', notes: 'David outcall at 6pm (if confirmed)' },
  ]

  // ═══════════════════════════════════════════════════════════
  // WRITE TO DB
  // ═══════════════════════════════════════════════════════════
  await db.transaction('rw',
    [db.clients, db.bookings, db.transactions, db.safetyContacts, db.safetyChecks,
     db.incidents, db.serviceRates, db.availability, db.payments, db.incallVenues, db.journalEntries],
    async () => {
      await db.clients.bulkAdd(clients)
      await db.bookings.bulkAdd(bookings)
      await db.transactions.bulkAdd(transactions)
      await db.safetyContacts.bulkAdd(safetyContacts)
      await db.safetyChecks.bulkAdd(safetyChecks)
      await db.incidents.bulkAdd(incidents)
      await db.serviceRates.bulkAdd(serviceRates)
      await db.availability.bulkAdd(availability)
      await db.payments.bulkAdd(payments)
      await db.incallVenues.bulkAdd(venues)
      await db.journalEntries.bulkAdd(journalEntries)
    }
  )

  localStorage.setItem(SAMPLE_DATA_KEY, 'active')
  window.dispatchEvent(new Event(SAMPLE_DATA_EVENT))
}

/**
 * Remove all sample data from the database.
 */
export async function clearSampleData(): Promise<void> {
  await db.transaction('rw',
    [db.clients, db.bookings, db.transactions, db.safetyContacts, db.safetyChecks,
     db.incidents, db.serviceRates, db.availability, db.payments, db.incallVenues, db.journalEntries],
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
      await db.incallVenues.clear()
      await db.journalEntries.clear()
    }
  )

  // Clear profile localStorage and notify mounted hooks
  function clearLS(key: string, defaultValue: unknown) {
    localStorage.removeItem(key)
    window.dispatchEvent(new CustomEvent('ls-sync', { detail: { key, value: defaultValue } }))
  }
  clearLS('profileWorkingName', '')
  clearLS('profileWorkEmail', '')
  clearLS('profileWorkPhone', '')
  clearLS('profileWebsite', '')
  clearLS('profileTagline', '')
  clearLS('profileSetupDone', false)
  clearLS('defaultDepositType', 'percent')
  clearLS('defaultDepositPercentage', 25)
  clearLS('defaultDepositFlat', 0)
  clearLS('currency', 'USD')
  clearLS('introTemplate', '')
  clearLS('directionsTemplate', '')

  markSampleDataCleared()
  window.dispatchEvent(new Event(SAMPLE_DATA_EVENT))
}
