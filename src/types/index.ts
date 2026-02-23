// Types ported from Swift data models

export type ContactMethod = 'Phone' | 'Text' | 'Email' | 'Telegram' | 'Signal' | 'WhatsApp' | 'Other'
export type ScreeningStatus = 'Unscreened' | 'In Progress' | 'Screened'
export type ScreeningMethod = 'ID' | 'LinkedIn' | 'Provider Reference' | 'Employment' | 'Phone' | 'Deposit' | 'Other'
export type RiskLevel = 'Unknown' | 'Low Risk' | 'Medium Risk' | 'High Risk'
export type BookingStatus = 'To Be Confirmed' | 'Screening' | 'Pending Deposit' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled' | 'No Show'
export type LocationType = 'Incall' | 'Outcall' | 'Travel' | 'Virtual'
export type PaymentMethod = 'Cash' | 'e-Transfer' | 'Crypto' | 'Venmo' | 'Cash App' | 'Zelle' | 'Gift Card' | 'Other'
export type TransactionType = 'income' | 'expense'
export type TransactionCategory = 'booking' | 'tip' | 'gift' | 'refund' | 'supplies' | 'travel' | 'advertising' | 'clothing' | 'health' | 'rent' | 'phone' | 'other'
export type AvailabilityStatus = 'Available' | 'Limited' | 'Busy' | 'Off'
export type SafetyCheckStatus = 'pending' | 'checkedIn' | 'overdue' | 'alert'
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'
export type PaymentLabel = 'Deposit' | 'Payment' | 'Tip' | 'Adjustment' | 'Cancellation Fee'

export interface ClientTag {
  id: string
  name: string
  color: string
  icon?: string
}

export interface Client {
  id: string
  alias: string
  nickname?: string
  phone?: string
  email?: string
  telegram?: string
  signal?: string
  whatsapp?: string
  address?: string
  preferredContact: ContactMethod
  secondaryContact?: ContactMethod
  screeningStatus: ScreeningStatus
  screeningMethod?: ScreeningMethod
  riskLevel: RiskLevel
  isBlocked: boolean
  notes: string
  preferences: string
  boundaries: string
  referenceSource?: string
  verificationNotes?: string
  dateAdded: Date
  lastSeen?: Date
  birthday?: Date
  clientSince?: Date
  tags: ClientTag[]
  isPinned: boolean
  requiresSafetyCheck: boolean
}

export type RecurrencePattern = 'none' | 'weekly' | 'biweekly' | 'monthly'

export type CancelledBy = 'client' | 'provider'
export type DepositOutcome = 'forfeited' | 'returned' | 'credit'

export interface Booking {
  id: string
  clientId?: string
  dateTime: Date
  duration: number // minutes
  locationType: LocationType
  locationAddress?: string
  locationNotes?: string
  status: BookingStatus
  baseRate: number
  extras: number
  travelFee: number
  depositAmount: number
  depositReceived: boolean
  depositMethod?: PaymentMethod
  paymentMethod?: PaymentMethod
  paymentReceived: boolean
  notes: string
  createdAt: Date
  confirmedAt?: Date
  completedAt?: Date
  cancelledAt?: Date
  cancellationReason?: string
  cancelledBy?: CancelledBy
  depositOutcome?: DepositOutcome
  requiresSafetyCheck: boolean
  safetyCheckMinutesAfter: number
  safetyContactId?: string
  recurrence: RecurrencePattern
  parentBookingId?: string // links to the previous booking in the chain
  recurrenceRootId?: string // links to the very first booking in the chain (enables fast chain queries)
}

export interface Transaction {
  id: string
  bookingId?: string
  paymentId?: string
  amount: number
  type: TransactionType
  category: TransactionCategory
  paymentMethod?: PaymentMethod
  date: Date
  notes: string
}

export interface TimeSlot {
  start: string  // "14:00"
  end: string    // "16:30"
  bookingId?: string  // if auto-created from a booking override
}

export interface DayAvailability {
  id: string
  date: Date
  status: AvailabilityStatus
  startTime?: string // "09:00"
  endTime?: string   // "22:00"
  notes?: string
  openSlots?: TimeSlot[]  // explicit open windows on Busy/Off/Limited days
}

export interface SafetyContact {
  id: string
  name: string
  phone: string
  relationship: string
  isPrimary: boolean
  isActive: boolean
}

export interface SafetyCheck {
  id: string
  bookingId: string
  safetyContactId?: string
  scheduledTime: Date
  bufferMinutes: number
  status: SafetyCheckStatus
  checkedInAt?: Date
}

export interface IncidentLog {
  id: string
  clientId?: string
  bookingId?: string
  date: Date
  severity: IncidentSeverity
  description: string
  actionTaken: string
}

export interface BookingPayment {
  id: string
  bookingId: string
  amount: number
  method?: PaymentMethod
  label: PaymentLabel
  date: Date
  notes?: string
}

export interface ServiceRate {
  id: string
  name: string
  duration: number // minutes
  rate: number
  isActive: boolean
  sortOrder: number
}

export interface ScreeningDoc {
  id: string
  clientId: string
  filename: string
  mimeType: string
  data: Blob
  thumbnailUrl?: string  // object URL, generated at runtime (not stored)
  uploadedAt: Date
}

export type JournalTag = 'Regular' | 'Great Chemistry' | 'New Experience' | 'Boundary Issue' | 'Generous' | 'Difficult' | 'Late' | 'Respectful' | 'Rushed' | 'Relaxed'

export interface JournalEntry {
  id: string
  bookingId: string
  clientId: string
  date: Date
  notes: string
  tags: JournalTag[]
  actualDuration?: number    // minutes — how long it actually went
  timingNotes?: string       // e.g. "arrived 10 min early", "ran 15 min over"
  createdAt: Date
  updatedAt: Date
}

export const journalTagColors: Record<JournalTag, { bg: string; fg: string }> = {
  'Regular': { bg: 'rgba(168,85,247,0.15)', fg: '#a855f7' },
  'Great Chemistry': { bg: 'rgba(34,197,94,0.15)', fg: '#22c55e' },
  'New Experience': { bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6' },
  'Boundary Issue': { bg: 'rgba(239,68,68,0.15)', fg: '#ef4444' },
  'Generous': { bg: 'rgba(34,197,94,0.15)', fg: '#22c55e' },
  'Difficult': { bg: 'rgba(249,115,22,0.15)', fg: '#f97316' },
  'Late': { bg: 'rgba(249,115,22,0.15)', fg: '#f97316' },
  'Respectful': { bg: 'rgba(34,197,94,0.15)', fg: '#22c55e' },
  'Rushed': { bg: 'rgba(249,115,22,0.15)', fg: '#f97316' },
  'Relaxed': { bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6' },
}

// Display helpers

export const screeningStatusColors: Record<ScreeningStatus, string> = {
  'Unscreened': 'orange', 'In Progress': 'blue', 'Screened': 'green'
}

export const riskLevelColors: Record<RiskLevel, string> = {
  'Unknown': 'gray', 'Low Risk': 'green', 'Medium Risk': 'orange', 'High Risk': 'red'
}

export const bookingStatusColors: Record<BookingStatus, string> = {
  'To Be Confirmed': 'purple', 'Screening': 'blue', 'Pending Deposit': 'orange',
  'Confirmed': 'green', 'In Progress': 'teal', 'Completed': 'gray',
  'Cancelled': 'red', 'No Show': 'red'
}

export const availabilityStatusColors: Record<AvailabilityStatus, string> = {
  'Available': 'green', 'Limited': 'orange', 'Busy': 'red', 'Off': 'gray'
}
