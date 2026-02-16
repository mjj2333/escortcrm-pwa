import { useEffect } from 'react'
import { addWeeks, addMonths } from 'date-fns'
import { db, createBooking } from '../db'

/**
 * Auto-advance booking statuses based on time:
 * - Confirmed → In Progress: when booking dateTime has passed
 * - In Progress → Completed: 5 minutes after scheduled end time (dateTime + duration)
 *
 * Also spawns the next occurrence of recurring bookings when one completes.
 *
 * Runs every 60 seconds.
 */
export function useAutoStatusTransitions() {
  useEffect(() => {
    async function checkAndUpdate() {
      const now = Date.now()
      const bookings = await db.bookings.toArray()

      for (const b of bookings) {
        const startTime = new Date(b.dateTime).getTime()
        const endTime = startTime + b.duration * 60_000
        const fiveAfterEnd = endTime + 5 * 60_000

        if (b.status === 'Confirmed' && now >= startTime) {
          await db.bookings.update(b.id, { status: 'In Progress' })
        } else if (b.status === 'In Progress' && now >= fiveAfterEnd) {
          await db.bookings.update(b.id, {
            status: 'Completed',
            completedAt: new Date(),
          })
        }

        // Spawn next recurring booking if this one completed
        if (b.status === 'Completed' && b.recurrence && b.recurrence !== 'none') {
          const existingChild = bookings.find(child => child.parentBookingId === b.id)
          if (!existingChild) {
            const currentDate = new Date(b.dateTime)
            let nextDate: Date
            switch (b.recurrence) {
              case 'weekly': nextDate = addWeeks(currentDate, 1); break
              case 'biweekly': nextDate = addWeeks(currentDate, 2); break
              case 'monthly': nextDate = addMonths(currentDate, 1); break
              default: continue
            }

            const nextBooking = createBooking({
              clientId: b.clientId,
              dateTime: nextDate,
              duration: b.duration,
              locationType: b.locationType,
              locationAddress: b.locationAddress,
              locationNotes: b.locationNotes,
              status: 'Confirmed',
              baseRate: b.baseRate,
              extras: b.extras,
              travelFee: b.travelFee,
              depositAmount: b.depositAmount,
              paymentMethod: b.paymentMethod,
              requiresSafetyCheck: b.requiresSafetyCheck,
              safetyCheckMinutesAfter: b.safetyCheckMinutesAfter,
              safetyContactId: b.safetyContactId,
              recurrence: b.recurrence,
              parentBookingId: b.id,
            })
            await db.bookings.add(nextBooking)
          }
        }
      }
    }

    checkAndUpdate()
    const interval = setInterval(checkAndUpdate, 60_000)
    return () => clearInterval(interval)
  }, [])
}
