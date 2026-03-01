import { startOfDay } from 'date-fns'
import { db, newId } from '../db'
import type { DayAvailability, TimeSlot } from '../types'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIME SLOT HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Format "14:00" → "2:00 PM" */
export function formatTime12(time: string): string {
  const [hStr, mStr] = time.split(':')
  let h = parseInt(hStr)
  const m = mStr
  const ampm = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m} ${ampm}`
}

/** Convert "HH:MM" → minutes since midnight */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Convert Date to "HH:MM" string */
function dateToTimeStr(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/** Add minutes to a "HH:MM" string → "HH:MM" */
function addMinutesToTime(time: string, minutes: number): string {
  const total = timeToMinutes(time) + minutes
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/** Snap a time string down to the nearest half hour */
function snapToHalfHour(time: string, roundUp = false): string {
  const mins = timeToMinutes(time)
  const snapped = Math.min(roundUp ? Math.ceil(mins / 30) * 30 : Math.floor(mins / 30) * 30, 1439)
  const h = Math.floor(snapped / 60) % 24
  const m = snapped % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFLICT CHECKING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface AvailabilityConflict {
  hasConflict: boolean
  reason: string
  dayStatus?: string
  dayAvail?: DayAvailability
  isDoubleBook?: boolean  // true if conflict is with another booking, not availability
}

/**
 * Check if a booking at the given date/time conflicts with availability OR existing bookings.
 * Pass excludeBookingId when editing an existing booking to avoid self-conflict.
 */
export async function checkBookingConflict(
  bookingDateTime: Date,
  durationMinutes: number,
  excludeBookingId?: string
): Promise<AvailabilityConflict> {
  // 1. Check for overlapping bookings first
  const bookingStartMs = bookingDateTime.getTime()
  const bookingEndMs = bookingStartMs + durationMinutes * 60000

  const allBookings = await db.bookings.toArray()
  const overlapping = allBookings.find(b => {
    if (b.id === excludeBookingId) return false
    if (b.status === 'Cancelled' || b.status === 'No Show') return false
    const bStart = new Date(b.dateTime).getTime()
    const bEnd = bStart + b.duration * 60000
    return bookingStartMs < bEnd && bookingEndMs > bStart
  })

  if (overlapping) {
    const overlapTime = new Date(overlapping.dateTime)
    const timeStr = formatTime12(dateToTimeStr(overlapTime))
    return {
      hasConflict: true,
      reason: `This overlaps with an existing booking at ${timeStr}.`,
      isDoubleBook: true,
    }
  }

  // 2. Check availability
  const dayStart = startOfDay(bookingDateTime)
  const avail = await db.availability.where('date').equals(dayStart).first()

  // No availability set = no conflict
  if (!avail) return { hasConflict: false, reason: '' }

  const bookingStart = dateToTimeStr(bookingDateTime)
  const bStartMins = timeToMinutes(bookingStart)
  const bEndMins = bStartMins + durationMinutes

  switch (avail.status) {
    case 'Off':
      return {
        hasConflict: true,
        reason: 'This day is marked as a Day Off.',
        dayStatus: 'Off',
        dayAvail: avail,
      }

    case 'Busy':
      return {
        hasConflict: true,
        reason: 'This day is marked as Busy.',
        dayStatus: 'Busy',
        dayAvail: avail,
      }

    case 'Limited': {
      // Check if booking falls within any open slot
      // If booking crosses midnight (bEndMins > 1440), only check the same-day portion
      const effectiveEndMins = Math.min(bEndMins, 1440)
      const openSlots = avail.openSlots ?? []
      const inOpenSlot = openSlots.some(slot => {
        const slotStart = timeToMinutes(slot.start)
        const slotEnd = timeToMinutes(slot.end)
        return bStartMins >= slotStart && effectiveEndMins <= slotEnd
      })
      if (!inOpenSlot) {
        return {
          hasConflict: true,
          reason: 'This time is outside your open availability windows.',
          dayStatus: 'Limited',
          dayAvail: avail,
        }
      }
      return { hasConflict: false, reason: '' }
    }

    case 'Available': {
      // Check if booking falls within working hours
      // If booking crosses midnight (bEndMins > 1440), only check the same-day portion
      if (avail.startTime && avail.endTime) {
        const availStart = timeToMinutes(avail.startTime)
        const availEnd = timeToMinutes(avail.endTime)
        const effectiveEndMins = Math.min(bEndMins, 1440)
        if (bStartMins < availStart || effectiveEndMins > availEnd) {
          return {
            hasConflict: true,
            reason: `This booking falls outside your available hours (${formatTime12(avail.startTime)} – ${formatTime12(avail.endTime)}).`,
            dayStatus: 'Available',
            dayAvail: avail,
          }
        }
      }
      return { hasConflict: false, reason: '' }
    }

    default:
      return { hasConflict: false, reason: '' }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTO-ADJUST AVAILABILITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * After a user confirms a booking on a blocked day, adjust availability:
 * - Off/Busy → change to Limited, add booking time as open slot
 * - Limited → add booking time as another open slot
 */
export async function adjustAvailabilityForBooking(
  bookingDateTime: Date,
  durationMinutes: number,
  bookingId?: string
): Promise<void> {
  const dayStart = startOfDay(bookingDateTime)
  const bookingStart = dateToTimeStr(bookingDateTime)
  const bookingStartMins = timeToMinutes(bookingStart)
  const bookingEndMins = bookingStartMins + durationMinutes

  // If booking crosses midnight, clamp the slot to end-of-day
  const clampedEnd = bookingEndMins >= 1440
    ? '23:59'
    : addMinutesToTime(bookingStart, durationMinutes)

  // Snap to half-hour boundaries for cleanliness
  const slotStart = snapToHalfHour(bookingStart)
  const slotEnd = bookingEndMins >= 1440 ? '23:59' : snapToHalfHour(clampedEnd, true)

  const newSlot: TimeSlot = {
    start: slotStart,
    end: slotEnd,
    bookingId,
  }

  const existing = await db.availability.where('date').equals(dayStart).first()

  if (existing) {
    const currentSlots = existing.openSlots ?? []

    // Merge overlapping slots
    const merged = mergeSlots([...currentSlots, newSlot])

    await db.availability.update(existing.id, {
      status: 'Limited',
      openSlots: merged,
    })
  } else {
    // No availability record — create Limited with this slot
    await db.availability.put({
      id: newId(),
      date: dayStart,
      status: 'Limited',
      openSlots: [newSlot],
    })
  }
}

/** Merge overlapping or adjacent time slots */
function mergeSlots(slots: TimeSlot[]): TimeSlot[] {
  if (slots.length <= 1) return slots

  const sorted = [...slots].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
  const merged: TimeSlot[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const curr = sorted[i]
    if (timeToMinutes(curr.start) <= timeToMinutes(last.end)) {
      // Overlapping or adjacent — extend
      if (timeToMinutes(curr.end) > timeToMinutes(last.end)) {
        last.end = curr.end
      }
    } else {
      merged.push(curr)
    }
  }

  return merged
}
