// Types ported from Swift data models

export type ContactMethod = 'Phone' | 'Text' | 'Email' | 'Telegram' | 'Signal' | 'WhatsApp' | 'Other'
export type ScreeningStatus = 'Unscreened' | 'In Progress' | 'Screened'
export type ScreeningMethod = 'ID' | 'LinkedIn' | 'Provider Reference' | 'Employment' | 'Phone' | 'Deposit' | 'Other'
export type RiskLevel = 'Unknown' | 'Low Risk' | 'Medium Risk' | 'High Risk'
export type BookingStatus = 'To Be Confirmed' | 'Screening' | 'Pending Deposit' | 'Confirmed' | 'In Progress' | 'Completed' | 'Cancelled' | 'No Show'
export type LocationType = 'Incall' | 'Outcall' | 'Travel' | 'Virtual'
export type PaymentMethod = 'Cash' | 'e-Transfer' | 'Crypto' | 'Venmo' | 'Cash App' | 'Zelle' | 'Gift Card' | 'Other'
export type TransactionType = 'income' | 'expense'
export type TransactionCategory = 'booking' | 'tip' | 'gift' | 'supplies' | 'travel' | 'advertising' | 'clothing' | 'health' | 'rent' | 'phone' | 'other'
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
