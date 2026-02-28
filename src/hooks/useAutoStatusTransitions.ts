import { useEffect } from 'react'
import { addWeeks, addMonths, addMinutes } from 'date-fns'
import { db, createBooking, completeBookingPayment, newId } from '../db'
import { isPro, canAddBooking } from '../components/planLimits'

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
 * - Pending Deposit → Confirmed: when depositReceived becomes true
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
    // Track which safety checks have already fired an overdue notification this session
    const overdueNotified = new Set<string>()

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

        // Pending Deposit → Confirmed when deposit is fully received
        if (b.status === 'Pending Deposit' && b.depositReceived) {
          await db.bookings.update(b.id, { status: 'Confirmed', confirmedAt: new Date() })
          continue
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
          const existingChild = await db.bookings.filter(child => child.parentBookingId === b.id).first()
          if (!existingChild) {
            // Only auto-create if client still exists and is screened
            const recurClient = b.clientId ? await db.clients.get(b.clientId) : null
            if (!recurClient) continue // client was deleted
            if (recurClient.screeningStatus !== 'Screened') continue

            // Respect free plan booking limit
            if (!await canAddBooking()) continue

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
              venueId: b.venueId,
              status: 'Confirmed',
              confirmedAt: new Date(),
              baseRate: b.baseRate,
              extras: b.extras,
              travelFee: b.travelFee,
              depositAmount: b.depositAmount,
              depositMethod: b.depositMethod,
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
        const fiveBeforeDeadline = deadline - 5 * 60_000

        // Nudge: 5 minutes before the grace period expires
        if (now >= fiveBeforeDeadline && now < deadline && !overdueNotified.has(`remind-${check.id}`)) {
          overdueNotified.add(`remind-${check.id}`)
          if ('Notification' in window && Notification.permission === 'granted') {
            const booking = bookings.find(b => b.id === check.bookingId)
            const client = booking?.clientId ? await db.clients.get(booking.clientId) : undefined
            new Notification('⏰ Safety check-in due soon', {
              body: client?.alias
                ? `${client.alias} — Check in now to confirm you're safe.`
                : 'Your safety check-in is due. Open the app to check in.',
              icon: '/icon-192.png',
              tag: `safety-remind-${check.id}`,
            })
          }
        }

        if (now >= deadline) {
          await db.safetyChecks.update(check.id, { status: 'overdue' })
          // Fire an urgent notification — this is safety-critical
          if (!overdueNotified.has(check.id) && 'Notification' in window && Notification.permission === 'granted') {
            overdueNotified.add(check.id)
            const booking = bookings.find(b => b.id === check.bookingId)
            const client = booking?.clientId ? await db.clients.get(booking.clientId) : undefined
            new Notification('🚨 Safety check-in OVERDUE', {
              body: client?.alias
                ? `${client.alias} — You missed your check-in. Open the app to check in or send an alert.`
                : 'You missed your safety check-in. Open the app to check in or send an alert.',
              icon: '/icon-192.png',
              tag: `safety-overdue-${check.id}`,
              requireInteraction: true,
            })
          }
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
