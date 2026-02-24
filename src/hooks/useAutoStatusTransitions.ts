import { useEffect } from 'react'
import { addWeeks, addMonths, addMinutes } from 'date-fns'
import { db, createBooking, completeBookingPayment, newId } from '../db'
import { isPro } from '../components/planLimits'

function sendCompletionNotification(clientAlias: string, durationMin: number) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification('Session completed', {
      body: isPro()
        ? `${clientAlias} · ${durationMin} min — tap to add session notes`
        : `${clientAlias} · ${durationMin} min`,
      icon: '/icon-192.png',
      tag: 'session-complete',
    })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission()
  }
}

/**
 * Auto-advance booking statuses based on time:
 * - Confirmed → In Progress: when booking dateTime has passed
 * - In Progress → Completed: 5 minutes after scheduled end time (dateTime + duration)
 *
 * Also:
 * - Spawns the next occurrence of recurring bookings when one completes
 * - Creates safety check-ins when bookings go In Progress (if requiresSafetyCheck)
 * - Auto-transitions pending safety checks → overdue when scheduledTime + buffer has passed
 *
 * Runs every 60 seconds AND immediately whenever the user returns to the app
 * (via the visibilitychange event), so statuses catch up instantly after a long absence.
 */
export function useAutoStatusTransitions() {
  useEffect(() => {
    let running = false

    async function checkAndUpdate() {
      if (running) return
      running = true
      try {
        const now = Date.now()
        const bookings = await db.bookings.toArray()

      for (const b of bookings) {
        const startTime = new Date(b.dateTime).getTime()
        const endTime = startTime + b.duration * 60_000
        const fiveAfterEnd = endTime + 5 * 60_000

        // Screening → Pending Deposit / Confirmed when client becomes Screened
        if (b.status === 'Screening' && b.clientId) {
          const client = await db.clients.get(b.clientId)
          if (client?.screeningStatus === 'Screened') {
            const nextStatus = (b.depositAmount ?? 0) > 0 && !b.depositReceived
              ? 'Pending Deposit' : 'Confirmed'
            await db.bookings.update(b.id, {
              status: nextStatus,
              ...(nextStatus === 'Confirmed' ? { confirmedAt: new Date() } : {}),
            })
            continue
          }
        }

        if (b.status === 'Confirmed' && now >= startTime) {
          await db.bookings.update(b.id, { status: 'In Progress' })

          // Create safety check if required
          if (b.requiresSafetyCheck) {
            const existing = await db.safetyChecks.where('bookingId').equals(b.id).first()
            if (!existing) {
              const checkTime = addMinutes(new Date(b.dateTime), b.safetyCheckMinutesAfter || 15)
              await db.safetyChecks.add({
                id: newId(),
                bookingId: b.id,
                safetyContactId: b.safetyContactId,
                scheduledTime: checkTime,
                bufferMinutes: 15,
                status: 'pending',
              })
            }
          }
        } else if (b.status === 'In Progress' && now >= fiveAfterEnd) {
          await db.bookings.update(b.id, {
            status: 'Completed',
            completedAt: new Date(),
          })
          // Record remaining payment via ledger
          const client = b.clientId ? await db.clients.get(b.clientId) : undefined
          await completeBookingPayment(b, client?.alias)
          // Update lastSeen
          if (b.clientId) {
            await db.clients.update(b.clientId, { lastSeen: new Date() })
          }
          // Nudge to write session notes
          sendCompletionNotification(client?.alias ?? 'Client', b.duration)
        }

        // Spawn next recurring booking if this one completed
        if (b.status === 'Completed' && b.recurrence && b.recurrence !== 'none') {
          const existingChild = bookings.find(child => child.parentBookingId === b.id)
          if (!existingChild) {
            // Only auto-create if client is still screened
            const recurClient = b.clientId ? await db.clients.get(b.clientId) : null
            if (recurClient && recurClient.screeningStatus !== 'Screened') continue

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
              confirmedAt: new Date(),
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
              recurrenceRootId: b.recurrenceRootId ?? b.id,
            })
            await db.bookings.add(nextBooking)
          }
        }
      }

      // Auto-transition pending safety checks → overdue
      const pendingChecks = await db.safetyChecks.where('status').equals('pending').toArray()
      for (const check of pendingChecks) {
        const deadline = new Date(check.scheduledTime).getTime() + check.bufferMinutes * 60_000
        if (now >= deadline) {
          await db.safetyChecks.update(check.id, { status: 'overdue' })
        }
      }
      } finally {
        running = false
      }
    }

    checkAndUpdate()
    const interval = setInterval(checkAndUpdate, 60_000)

    // Request notification permission early so journal reminders work
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    // Also run immediately when the user returns to the app (tab/window becomes visible).
    // Without this, statuses only catch up on the next 60s tick, so a booking that
    // ended while the app was in the background would stay "In Progress" until the
    // next interval fires — which could be nearly a minute after the user opens it.
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') checkAndUpdate()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])
}
