import { useEffect, useRef } from 'react'
import { db, bookingDurationFormatted } from '../db'
import { showAppNotification } from '../utils/showNotification'

/**
 * Booking Reminders using the Web Notifications API.
 * 
 * Fires notifications at:
 * - 8 hours before an incall booking with a linked venue (send directions reminder)
 * - 1 hour before a confirmed/in-progress booking
 * - 15 minutes before a confirmed booking
 * 
 * Also shows birthday reminders once per day (at first check).
 * 
 * Keeps a Set of already-notified IDs, persisted to sessionStorage so a page
 * refresh doesn't re-fire notifications that already fired this session.
 */
export function useBookingReminders(enabled: boolean) {
  const STORAGE_KEY = 'bookingReminders_notified'

  // Seed from sessionStorage so a page refresh doesn't re-fire today's notifications
  const notifiedRef = useRef<Set<string>>((() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      const set = stored ? new Set<string>(JSON.parse(stored)) : new Set<string>()
      // Prune entries older than today (keys contain booking IDs, not dates,
      // but the set naturally stays bounded to current-session bookings)
      if (set.size > 500) {
        const arr = [...set]
        const pruned = new Set(arr.slice(arr.length - 200))
        return pruned
      }
      return set
    } catch {
      return new Set<string>()
    }
  })())

  function addNotified(key: string) {
    notifiedRef.current.add(key)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...notifiedRef.current]))
    } catch {
      // sessionStorage full or unavailable — in-memory Set still prevents duplicates this session
    }
  }
  useEffect(() => {
    if (!enabled) return
    if (!('Notification' in window)) return

    async function checkReminders() {
      if (Notification.permission !== 'granted') return

      try {
      const now = Date.now()
      const bookings = await db.bookings.where('status').anyOf(
        ['Pending Deposit', 'Confirmed', 'In Progress']
      ).toArray()

      // Only load clients referenced by upcoming bookings
      const clientIds = [...new Set(bookings.map(b => b.clientId).filter((id): id is string => !!id))]
      const clients = clientIds.length > 0
        ? await db.clients.where('id').anyOf(clientIds).toArray()
        : []
      const clientMap = Object.fromEntries(clients.map(c => [c.id, c]))

      for (const b of bookings) {
        const start = new Date(b.dateTime).getTime()
        const msBefore = start - now

        const client = b.clientId ? clientMap[b.clientId] : undefined
        const name = client?.alias ?? 'Client'

        // 8 hour reminder — send directions for incall bookings with a venue
        const key8h = `${b.id}-8h-directions`
        if (
          b.locationType === 'Incall' && b.venueId &&
          msBefore > 0 && msBefore <= 8 * 60 * 60_000 &&
          !notifiedRef.current.has(key8h)
        ) {
          addNotified(key8h)
          // Look up venue name
          const venue = await db.incallVenues.get(b.venueId)
          showAppNotification('📍 Send directions to client', {
            body: `${name} — ${venue?.name ?? 'Incall'} · Booking at ${new Date(b.dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
            icon: '/icon-192.png',
            tag: key8h,
          })
        }

        // 1 hour reminder — fires once when booking is within 60 min
        const key1h = `${b.id}-1h`
        if (msBefore > 0 && msBefore <= 60 * 60_000 && !notifiedRef.current.has(key1h)) {
          addNotified(key1h)
          showAppNotification('Booking in 1 hour', {
            body: `${name} — ${bookingDurationFormatted(b.duration)} ${b.locationType}`,
            icon: '/icon-192.png',
            tag: key1h,
          })
        }

        // 15 minute reminder — fires once when booking is within 15 min
        const key15 = `${b.id}-15m`
        if (msBefore > 0 && msBefore <= 15 * 60_000 && !notifiedRef.current.has(key15)) {
          addNotified(key15)
          showAppNotification('Booking in 15 minutes', {
            body: `${name} — ${bookingDurationFormatted(b.duration)} ${b.locationType}`,
            icon: '/icon-192.png',
            tag: key15,
          })
        }
      }

      // Birthday check — once per day (query all clients, not just booking-scoped ones)
      const today = new Date()
      const todayMD = `${today.getMonth()}-${today.getDate()}`
      const birthdayKey = `birthday-${todayMD}`
      if (!notifiedRef.current.has(birthdayKey)) {
        addNotified(birthdayKey)

        const allClients = await db.clients.filter(c => !c.isBlocked).toArray()
        const birthdayClients = allClients.filter(c => {
          if (!c.birthday) return false
          const bday = new Date(c.birthday)
          return `${bday.getMonth()}-${bday.getDate()}` === todayMD
        })

        if (birthdayClients.length > 0) {
          const names = birthdayClients.map(c => c.alias).join(', ')
          showAppNotification('🎂 Birthday today!', {
            body: names,
            icon: '/icon-192.png',
            tag: birthdayKey,
          })
        }
      }
      } catch (err) {
        console.error('Reminder check failed:', err)
      }
    }

    checkReminders()
    const interval = setInterval(checkReminders, 60_000)

    // Also run when the app returns to foreground — background tabs may defer
    // setInterval by minutes, causing reminders to fall outside their windows.
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') checkReminders()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled])
}
