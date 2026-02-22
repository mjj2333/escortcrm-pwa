import { useLiveQuery } from 'dexie-react-hooks'
import { startOfMonth } from 'date-fns'
import { db } from '../db'
import { isActivated } from './Paywall'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FREE TIER LIMITS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const FREE_CLIENT_LIMIT = 5
export const FREE_MONTHLY_BOOKING_LIMIT = 10

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PLAN STATUS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function isPro(): boolean {
  return isActivated()
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ASYNC LIMIT CHECKS (for save handlers)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function getActiveClientCount(): Promise<number> {
  return db.clients.filter(c => !c.isBlocked).count()
}

export async function getMonthlyBookingCount(): Promise<number> {
  const monthStart = startOfMonth(new Date())
  return db.bookings
    .where('createdAt')
    .aboveOrEqual(monthStart)
    .count()
}

export async function canAddClient(): Promise<boolean> {
  if (isPro()) return true
  const count = await getActiveClientCount()
  return count < FREE_CLIENT_LIMIT
}

export async function canAddBooking(): Promise<boolean> {
  if (isPro()) return true
  const count = await getMonthlyBookingCount()
  return count < FREE_MONTHLY_BOOKING_LIMIT
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REACT HOOK — live counts + limits for UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PlanLimits {
  isPro: boolean
  clientCount: number
  clientLimit: number
  canAddClient: boolean
  bookingCount: number
  bookingLimit: number
  canAddBooking: boolean
}

export function usePlanLimits(): PlanLimits {
  const pro = isPro()

  const clientCount = useLiveQuery(
    () => db.clients.filter(c => !c.isBlocked).count(),
    [], 0
  )

  const bookingCount = useLiveQuery(() => {
    const monthStart = startOfMonth(new Date())
    return db.bookings
      .where('createdAt')
      .aboveOrEqual(monthStart)
      .count()
  }, [], 0)

  return {
    isPro: pro,
    clientCount,
    clientLimit: FREE_CLIENT_LIMIT,
    canAddClient: pro || clientCount < FREE_CLIENT_LIMIT,
    bookingCount,
    bookingLimit: FREE_MONTHLY_BOOKING_LIMIT,
    canAddBooking: pro || bookingCount < FREE_MONTHLY_BOOKING_LIMIT,
  }
}
