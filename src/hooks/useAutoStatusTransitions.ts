import { useEffect } from 'react'
import { addWeeks, addMonths, addMinutes } from 'date-fns'
import { db, createBooking, completeBookingPayment, newId } from '../db'
import { isPro, canAddBooking } from '../components/planLimits'
import { showAppNotification } from '../utils/showNotification'
import { lsKey } from './useSettings'

function isStealthEnabled(): boolean {
  try { return JSON.parse(localStorage.getItem(lsKey('stealthEnabled')) ?? 'false') } catch { return false }
}

function sendCompletionNotification(clientAlias: string, durationMin: number) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    const alias = isStealthEnabled() ? 'Client' : clientAlias
    showAppNotification('Session completed', {
      body: isPro()
        ? `${alias} · ${durationMin} min — tap to add session notes`
        : `${alias} · ${durationMin} min`,
      icon: '/icon-192.png',
      tag: 'session-complete',
    })
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
    // Track which safety checks have already fired an overdue notification this session.
    // Persisted to sessionStorage so reopening the app doesn't re-spam the same alerts.
    const OVERDUE_KEY = 'safetyOverdue_notified'
    const overdueNotified: Set<string> = (() => {
      try {
        const stored = sessionStorage.getItem(OVERDUE_KEY)
        return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>()
      } catch { return new Set<string>() }
    })()
    function markOverdueNotified(key: string) {
      overdueNotified.add(key)
      try { sessionStorage.setItem(OVERDUE_KEY, JSON.stringify([...overdueNotified])) } catch {}
    }

    async function checkAndUpdate() {
      if (running) return
      running = true
      try {
        const now = Date.now()
        // Status transitions only need active bookings; recurring spawning also needs terminal statuses
        const activeBookings = await db.bookings.where('status').anyOf([
          'Pending Deposit', 'Confirmed', 'In Progress'
        ]).toArray()
        const terminalForRecurrence = await db.bookings.where('status').anyOf([
          'Completed', 'Cancelled', 'No Show'
        ]).filter(b => !!b.recurrence && b.recurrence !== 'none').toArray()
        const bookings = [...activeBookings, ...terminalForRecurrence]

      // Pre-build set of booking IDs that already have recurring children
      // Query only bookings with recurrenceRootId (indexed) to avoid full-table scan
      const recurringBookings = await db.bookings.where('recurrenceRootId').notEqual('').toArray()
      const parentIdsWithChildren = new Set<string>(
        recurringBookings.map(c => c.parentBookingId).filter((id): id is string => !!id)
      )

      for (const b of bookings) {
        const startTime = new Date(b.dateTime).getTime()
        const endTime = startTime + b.duration * 60_000
        const fiveAfterEnd = endTime + 5 * 60_000

        // Pending Deposit → Confirmed when deposit is fully received
        if (b.status === 'Pending Deposit' && (b.depositReceived || b.depositAmount === 0)) {
          await db.transaction('rw', db.bookings, async () => {
            const current = await db.bookings.get(b.id)
            if (!current || current.status !== 'Pending Deposit') return
            await db.bookings.update(b.id, { status: 'Confirmed', confirmedAt: new Date() })
          })
          continue
        }

        if (b.status === 'Confirmed' && now >= startTime) {
          await db.transaction('rw', [db.bookings, db.safetyChecks], async () => {
            // Re-check status to avoid race with manual transition or another tab
            const current = await db.bookings.get(b.id)
            if (!current || current.status !== 'Confirmed') return
            await db.bookings.update(b.id, { status: 'In Progress' })

            // Create safety check if required — use fresh `current` fields
            if (current.requiresSafetyCheck) {
              const existing = await db.safetyChecks.where('bookingId').equals(b.id).first()
              if (!existing) {
                const sessionStart = Math.max(new Date(current.dateTime).getTime(), Date.now())
                const checkTime = addMinutes(new Date(sessionStart), current.safetyCheckMinutesAfter || 15)
                await db.safetyChecks.add({
                  id: newId(),
                  bookingId: b.id,
                  safetyContactId: current.safetyContactId,
                  scheduledTime: checkTime,
                  bufferMinutes: 15,
                  status: 'pending',
                })
              }
            }
          })
        } else if (b.status === 'In Progress' && now >= fiveAfterEnd) {
          let clientAlias = 'Client'
          let didComplete = false
          await db.transaction('rw', [db.bookings, db.payments, db.transactions, db.clients, db.safetyChecks], async () => {
            // Re-check status to avoid race with manual completion
            const current = await db.bookings.get(b.id)
            if (!current || current.status !== 'In Progress') return
            await db.bookings.update(b.id, {
              status: 'Completed',
              completedAt: new Date(),
            })
            didComplete = true
            // Record remaining payment via ledger — use fresh current.clientId
            const client = current.clientId ? await db.clients.get(current.clientId) : undefined
            clientAlias = client?.alias ?? 'Client'
            await completeBookingPayment(current, client?.alias)
            // Update lastSeen
            if (current.clientId) {
              await db.clients.update(current.clientId, { lastSeen: new Date() })
            }
            // Auto-resolve any pending/overdue safety check for this booking
            const pendingCheck = await db.safetyChecks.where('bookingId').equals(b.id)
              .filter(c => c.status === 'pending' || c.status === 'overdue').first()
            if (pendingCheck) {
              await db.safetyChecks.update(pendingCheck.id, { status: 'checkedIn', checkedInAt: new Date() })
            }
          })
          // Nudge to write session notes — only if we actually completed
          if (didComplete) sendCompletionNotification(clientAlias, b.duration)
        }

        // Spawn next recurring booking when this one completes, is cancelled, or is a no-show.
        // Cancelled/No-Show should NOT break the chain — the user still expects next week's booking.
        const effectiveStatus = (await db.bookings.get(b.id))?.status ?? b.status
        const shouldSpawn = (effectiveStatus === 'Completed' || effectiveStatus === 'Cancelled' || effectiveStatus === 'No Show')
          && b.recurrence && b.recurrence !== 'none'
        if (shouldSpawn) {
          if (!parentIdsWithChildren.has(b.id)) {
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

            // Don't spawn bookings in the past (e.g. recurrence added to an old completed booking)
            if (nextDate.getTime() < Date.now() - 24 * 60 * 60_000) continue

            // Use a transaction to guard against multi-tab double-spawning
            await db.transaction('rw', db.bookings, async () => {
              // Re-check inside the transaction that no child was created by another tab
              const existingChild = await db.bookings.where('parentBookingId').equals(b.id).first()
              if (existingChild) return

              // Re-read parent fresh to avoid stale financial/config fields
              const fresh = await db.bookings.get(b.id)
              if (!fresh) return

              const needsDeposit = (fresh.depositAmount ?? 0) > 0
              const nextBooking = createBooking({
                clientId: fresh.clientId,
                dateTime: nextDate,
                duration: fresh.duration,
                locationType: fresh.locationType,
                locationAddress: fresh.locationAddress,
                locationNotes: fresh.locationNotes,
                venueId: fresh.venueId,
                status: needsDeposit ? 'Pending Deposit' : 'Confirmed',
                confirmedAt: needsDeposit ? undefined : new Date(),
                baseRate: fresh.baseRate,
                extras: fresh.extras,
                travelFee: fresh.travelFee,
                depositAmount: fresh.depositAmount,
                depositMethod: fresh.depositMethod,
                paymentMethod: fresh.paymentMethod,
                tourId: undefined,
                notes: fresh.notes,
                requiresSafetyCheck: fresh.requiresSafetyCheck,
                safetyCheckMinutesAfter: fresh.safetyCheckMinutesAfter,
                safetyContactId: fresh.safetyContactId,
                recurrence: fresh.recurrence,
                parentBookingId: fresh.id,
                recurrenceRootId: fresh.recurrenceRootId ?? fresh.id,
              })
              await db.bookings.add(nextBooking)
            })
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
          // Re-read to ensure check hasn't been resolved since the query
          const fresh = await db.safetyChecks.get(check.id)
          if (!fresh || fresh.status !== 'pending') continue
          markOverdueNotified(`remind-${check.id}`)
          if ('Notification' in window && Notification.permission === 'granted') {
            const booking = await db.bookings.get(check.bookingId)
            const client = booking?.clientId ? await db.clients.get(booking.clientId) : undefined
            showAppNotification('⏰ Safety check-in due soon', {
              body: client?.alias && !isStealthEnabled()
                ? `${client.alias} — Check in now to confirm you're safe.`
                : 'Your safety check-in is due. Open the app to check in.',
              icon: '/icon-192.png',
              tag: `safety-remind-${check.id}`,
            })
          }
        }

        if (now >= deadline) {
          let transitioned = false
          await db.transaction('rw', db.safetyChecks, async () => {
            const fresh = await db.safetyChecks.get(check.id)
            if (!fresh || fresh.status !== 'pending') return
            await db.safetyChecks.update(check.id, { status: 'overdue' })
            transitioned = true
          })
          if (!transitioned) continue
          // Fire an urgent notification — this is safety-critical
          if (!overdueNotified.has(check.id) && 'Notification' in window && Notification.permission === 'granted') {
            markOverdueNotified(check.id)
            const booking = await db.bookings.get(check.bookingId)
            const client = booking?.clientId ? await db.clients.get(booking.clientId) : undefined
            showAppNotification('🚨 Safety check-in OVERDUE', {
              body: client?.alias && !isStealthEnabled()
                ? `${client.alias} — You missed your check-in. Open the app to check in or send an alert.`
                : 'You missed your safety check-in. Open the app to check in or send an alert.',
              icon: '/icon-192.png',
              tag: `safety-overdue-${check.id}`,
              requireInteraction: true,
            })
          }
        }
      }
      } catch (err) {
        console.error('Auto-status check failed:', err)
      } finally {
        running = false
      }
    }

    checkAndUpdate()
    const interval = setInterval(checkAndUpdate, 60_000)

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
