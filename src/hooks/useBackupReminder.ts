import { useState, useEffect } from 'react'
import { db } from '../db'

export const LAST_BACKUP_KEY = 'lastBackupAt'
export const BACKUP_REMINDER_INTERVAL_KEY = 'backupReminderIntervalDays'
export const DEFAULT_REMINDER_INTERVAL = 14 // days

/** Records the current timestamp as the last successful backup time. */
export function recordBackupTimestamp() {
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString())
}

/** Returns the number of days since the last backup, or null if never backed up. */
export function daysSinceBackup(): number | null {
  const raw = localStorage.getItem(LAST_BACKUP_KEY)
  if (!raw) return null
  const last = new Date(raw)
  if (isNaN(last.getTime())) return null
  return Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24))
}

/** Returns the configured reminder interval in days, or 0 if reminders are off. */
export function getBackupReminderInterval(): number {
  const raw = localStorage.getItem(BACKUP_REMINDER_INTERVAL_KEY)
  if (!raw) return DEFAULT_REMINDER_INTERVAL
  const n = parseInt(raw, 10)
  return isNaN(n) ? DEFAULT_REMINDER_INTERVAL : n
}

/**
 * Returns true if the user should be reminded to back up.
 * Checks:
 *  - reminder interval is not 0 (disabled)
 *  - interval has elapsed since last backup (or never backed up)
 *  - the DB has real data worth protecting (at least 1 client or booking)
 */
export function useBackupReminder(): { shouldRemind: boolean; daysSince: number | null } {
  const [shouldRemind, setShouldRemind] = useState(false)
  const [days, setDays] = useState<number | null>(null)

  useEffect(() => {
    const interval = getBackupReminderInterval()
    if (interval === 0) return // reminders disabled

    const since = daysSinceBackup()
    setDays(since)

    const isDue = since === null || since >= interval

    if (!isDue) return

    // Only remind if the DB has real data
    Promise.all([db.clients.count(), db.bookings.count()]).then(([clients, bookings]) => {
      if (clients > 0 || bookings > 0) {
        setShouldRemind(true)
      }
    })
  }, [])

  return { shouldRemind, daysSince: days }
}
