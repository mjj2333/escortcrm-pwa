import { differenceInDays } from 'date-fns'
import type { Client, Booking } from '../types'

export interface FollowUpInfo {
  clientId: string
  daysSinceLastSeen: number
  avgIntervalDays: number
  daysOverdue: number
}

/**
 * Compute the typical visit interval for a single client from their completed bookings.
 * Returns null if fewer than 2 completed bookings (can't determine a pattern).
 */
export function computeClientInterval(
  completedBookings: Booking[],
  lastSeen: Date | undefined,
  now: Date,
): { avgIntervalDays: number; daysSinceLastSeen: number; daysOverdue: number } | null {
  if (completedBookings.length < 2) return null

  const sorted = [...completedBookings]
    .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())

  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const gap = differenceInDays(new Date(sorted[i].dateTime), new Date(sorted[i - 1].dateTime))
    if (gap > 0) intervals.push(gap)
  }

  if (intervals.length === 0) return null

  // Median interval
  intervals.sort((a, b) => a - b)
  const mid = Math.floor(intervals.length / 2)
  const avgIntervalDays = intervals.length % 2 === 0
    ? Math.round((intervals[mid - 1] + intervals[mid]) / 2)
    : intervals[mid]

  const daysSinceLastSeen = lastSeen
    ? differenceInDays(now, new Date(lastSeen))
    : differenceInDays(now, new Date(sorted[sorted.length - 1].dateTime))

  return {
    avgIntervalDays,
    daysSinceLastSeen,
    daysOverdue: daysSinceLastSeen - avgIntervalDays,
  }
}

/**
 * Compute follow-up reminders for all clients.
 * Returns only overdue clients (daysOverdue > 0), sorted by most overdue first.
 */
export function computeFollowUps(
  clients: Client[],
  bookings: Booking[],
  now: Date,
): FollowUpInfo[] {
  // Index bookings by clientId
  const bookingsByClient = new Map<string, Booking[]>()
  for (const b of bookings) {
    if (!b.clientId) continue
    const arr = bookingsByClient.get(b.clientId)
    if (arr) arr.push(b)
    else bookingsByClient.set(b.clientId, [b])
  }

  const results: FollowUpInfo[] = []

  for (const client of clients) {
    if (client.isBlocked) continue

    const clientBookings = bookingsByClient.get(client.id) ?? []
    const completed = clientBookings.filter(b => b.status === 'Completed')

    // Skip if client already has an upcoming/active booking
    const hasUpcoming = clientBookings.some(b =>
      b.status !== 'Completed' && b.status !== 'Cancelled' && b.status !== 'No Show'
    )
    if (hasUpcoming) continue

    const info = computeClientInterval(completed, client.lastSeen, now)
    if (!info || info.daysOverdue <= 0) continue

    results.push({
      clientId: client.id,
      daysSinceLastSeen: info.daysSinceLastSeen,
      avgIntervalDays: info.avgIntervalDays,
      daysOverdue: info.daysOverdue,
    })
  }

  return results.sort((a, b) => b.daysOverdue - a.daysOverdue)
}
