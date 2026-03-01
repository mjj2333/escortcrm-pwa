import { db } from '../db'
import { lsKey } from '../hooks/useSettings'

export const SAMPLE_DATA_KEY = 'companion_sample_data'
export const SAMPLE_DATA_EVENT = 'sample-data-change'

export function isSampleDataActive(): boolean {
  return localStorage.getItem(SAMPLE_DATA_KEY) === 'active'
}

export function markSampleDataCleared(): void {
  localStorage.setItem(SAMPLE_DATA_KEY, 'cleared')
}

export function hasSampleDataBeenOffered(): boolean {
  return localStorage.getItem(SAMPLE_DATA_KEY) !== null
}

/**
 * Remove only sample data from the database, preserving user-added records.
 */
export async function clearSampleData(): Promise<void> {
  const raw = localStorage.getItem('companion_sample_ids')
  const ids: Record<string, string[]> = raw ? JSON.parse(raw) : {}

  await db.transaction('rw',
    [db.clients, db.bookings, db.transactions, db.safetyContacts, db.safetyChecks,
     db.incidents, db.serviceRates, db.availability, db.payments, db.incallVenues, db.journalEntries],
    async () => {
      if (ids.clients?.length) await db.clients.bulkDelete(ids.clients)
      if (ids.bookings?.length) await db.bookings.bulkDelete(ids.bookings)
      if (ids.transactions?.length) await db.transactions.bulkDelete(ids.transactions)
      if (ids.safetyContacts?.length) await db.safetyContacts.bulkDelete(ids.safetyContacts)
      if (ids.safetyChecks?.length) await db.safetyChecks.bulkDelete(ids.safetyChecks)
      if (ids.incidents?.length) await db.incidents.bulkDelete(ids.incidents)
      if (ids.serviceRates?.length) await db.serviceRates.bulkDelete(ids.serviceRates)
      if (ids.availability?.length) await db.availability.bulkDelete(ids.availability)
      if (ids.payments?.length) await db.payments.bulkDelete(ids.payments)
      if (ids.incallVenues?.length) await db.incallVenues.bulkDelete(ids.incallVenues)
      if (ids.journalEntries?.length) await db.journalEntries.bulkDelete(ids.journalEntries)
    }
  )

  // Only clear profile keys that were set by sample data and still match defaults
  const sampleDefaults: Record<string, unknown> = {
    profileWorkingName: 'Valentina Rose',
    profileWorkEmail: 'valentina@protonmail.com',
    profileWorkPhone: '(555) 800-7777',
    profileWebsite: 'https://valentinarose.com',
    profileTagline: 'Refined companionship for discerning gentlemen',
    profileSetupDone: true,
  }

  const profileKeysRaw = localStorage.getItem('companion_sample_profile_keys')
  const profileKeys: string[] = profileKeysRaw ? JSON.parse(profileKeysRaw) : []

  function clearLS(key: string, defaultValue: unknown) {
    const prefixedKey = lsKey(key)
    localStorage.removeItem(prefixedKey)
    window.dispatchEvent(new CustomEvent('ls-sync', { detail: { key: prefixedKey, value: defaultValue } }))
  }

  for (const key of profileKeys) {
    if (key in sampleDefaults) {
      // Only clear if user hasn't customized it
      const current = localStorage.getItem(lsKey(key))
      if (current !== null) {
        try {
          const parsed = JSON.parse(current)
          if (parsed !== sampleDefaults[key]) continue // user changed it, keep it
        } catch { /* not JSON, clear it */ }
      }
    }
    const defaults: Record<string, unknown> = {
      profileWorkingName: '', profileWorkEmail: '', profileWorkPhone: '',
      profileWebsite: '', profileTagline: '', profileSetupDone: false,
      defaultDepositType: 'percent', defaultDepositPercentage: 25,
      defaultDepositFlat: 0, currency: 'USD', introTemplate: '', directionsTemplate: '',
    }
    clearLS(key, defaults[key] ?? '')
  }

  localStorage.removeItem('companion_sample_ids')
  localStorage.removeItem('companion_sample_profile_keys')

  markSampleDataCleared()
  window.dispatchEvent(new Event(SAMPLE_DATA_EVENT))
}
