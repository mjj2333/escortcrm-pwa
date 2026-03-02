import { useState, useRef, useEffect } from 'react'
import {
  Download, Upload, X, CheckCircle, AlertCircle, Lock, Unlock, Database, FileSpreadsheet
} from 'lucide-react'
import { db } from '../db'
import { ConfirmDialog } from './ConfirmDialog'
import { recordBackupTimestamp } from '../hooks/useBackupReminder'
import { lsKey } from '../hooks/useSettings'

interface BackupRestoreProps {
  isOpen: boolean
  onClose: () => void
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRYPTO HELPERS (AES-GCM via Web Crypto API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function deriveKey(password: string, salt: Uint8Array, iterations = 200_000): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptData(data: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(data))
  // Combine salt + iv + ciphertext, encode as base64
  const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(encrypted).length)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(encrypted), salt.length + iv.length)
  // NOTE: Do NOT use btoa(String.fromCharCode(...combined)) — spreading a large
  // Uint8Array as function arguments will exceed the JS call stack limit on any
  // backup with substantial data (typically > ~50k records).
  let binary = ''
  combined.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

async function decryptData(encoded: string, password: string): Promise<string> {
  const binary = atob(encoded)
  const combined = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i)
  const salt = combined.slice(0, 16)
  const iv = combined.slice(16, 28)
  const ciphertext = combined.slice(28)
  // Try current iteration count first (200k), fall back to legacy (100k)
  try {
    const key = await deriveKey(password, salt, 200_000)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return new TextDecoder().decode(decrypted)
  } catch {
    const key = await deriveKey(password, salt, 100_000)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return new TextDecoder().decode(decrypted)
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BACKUP / RESTORE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Bump this when adding new tables or making breaking schema changes.
// Backups from a NEWER version than this will be rejected to prevent
// silent data loss (future tables/fields would be silently dropped).
// Backups from OLDER versions are fine — missing tables are just empty.
const CURRENT_BACKUP_VERSION = 3

interface BackupPayload {
  version: number
  created: string
  tables: {
    clients: unknown[]
    bookings: unknown[]
    transactions: unknown[]
    availability: unknown[]
    safetyContacts: unknown[]
    safetyChecks: unknown[]
    incidents: unknown[]
    serviceRates: unknown[]
    payments?: unknown[]
    journalEntries?: unknown[]
    incallVenues?: unknown[]
    // screeningDocs and venueDocs have Blob data — encoded as base64
    screeningDocs?: unknown[]
    venueDocs?: unknown[]
    bookingChecklist?: unknown[]
  }
  // Profile & settings from localStorage
  profile?: Record<string, string>
}

// ── Blob ↔ Base64 helpers ──────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:…;base64, prefix
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(b64: string, mimeType: string): Blob {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

// localStorage keys to include in backup
const PROFILE_LS_KEYS = [
  'profileWorkingName', 'profileWorkEmail', 'profileWorkPhone',
  'profileWebsite', 'profileTagline', 'profileSetupDone',
  'defaultDepositType', 'defaultDepositPercentage', 'defaultDepositFlat',
  'currency', 'introTemplate', 'directionsTemplate',
  'taxRate', 'setAsideRate',
  'goalWeekly', 'goalMonthly', 'goalQuarterly', 'goalYearly',
  'darkMode', 'oledBlack', 'remindersEnabled',
  'financeCards_v2', 'financeHintDismissed',
  'defaultChecklistItems', 'stealthEnabled',
]

export async function createBackup(): Promise<BackupPayload> {
  // Serialize screeningDocs (Blob → base64)
  const rawScreeningDocs = await db.screeningDocs.toArray()
  const screeningDocs = await Promise.all(rawScreeningDocs.map(async doc => ({
    ...doc,
    data: await blobToBase64(doc.data),
    _blobMime: doc.mimeType,
  })))

  // Serialize venueDocs (Blob → base64)
  const rawVenueDocs = await db.venueDocs.toArray()
  const venueDocs = await Promise.all(rawVenueDocs.map(async doc => ({
    ...doc,
    data: await blobToBase64(doc.data),
    _blobMime: doc.mimeType,
  })))

  // Snapshot localStorage profile settings
  const profile: Record<string, string> = {}
  for (const key of PROFILE_LS_KEYS) {
    const val = localStorage.getItem(lsKey(key))
    if (val !== null) profile[key] = val
  }

  return {
    version: CURRENT_BACKUP_VERSION,
    created: new Date().toISOString(),
    tables: {
      clients: await db.clients.toArray(),
      bookings: await db.bookings.toArray(),
      transactions: await db.transactions.toArray(),
      availability: await db.availability.toArray(),
      safetyContacts: await db.safetyContacts.toArray(),
      safetyChecks: await db.safetyChecks.toArray(),
      incidents: await db.incidents.toArray(),
      serviceRates: await db.serviceRates.toArray(),
      payments: await db.payments.toArray(),
      journalEntries: await db.journalEntries.toArray(),
      incallVenues: await db.incallVenues.toArray(),
      screeningDocs,
      venueDocs,
      bookingChecklist: await db.bookingChecklist.toArray(),
    },
    profile,
  }
}

async function restoreBackup(payload: BackupPayload): Promise<{ total: number }> {
  let total = 0

  // ─── Validate record shapes before touching the database ────────────
  // Every record in every table must have an 'id' field at minimum.
  // Key tables also check for their most critical required fields so a
  // malformed or crafted backup can't inject broken records.
  const requiredFields: Record<string, string[]> = {
    clients:        ['id', 'alias'],
    bookings:       ['id'],
    transactions:   ['id', 'amount'],
    availability:   ['id', 'date'],
    safetyContacts: ['id', 'name'],
    safetyChecks:   ['id'],
    incidents:      ['id'],
    serviceRates:   ['id'],
    payments:       ['id', 'bookingId'],
    journalEntries: ['id', 'bookingId', 'clientId'],
    incallVenues:   ['id', 'name'],
    screeningDocs:  ['id', 'clientId'],
    venueDocs:      ['id', 'venueId'],
    bookingChecklist: ['id', 'bookingId'],
  }

  const t = payload.tables
  for (const [tableName, records] of Object.entries(t)) {
    if (!Array.isArray(records) || records.length === 0) continue
    const fields = requiredFields[tableName] ?? ['id']
    for (const record of records) {
      if (!record || typeof record !== 'object') {
        throw new Error(`Invalid record in "${tableName}": not an object`)
      }
      const rec = record as Record<string, unknown>
      for (const field of fields) {
        if (!(field in rec) || rec[field] === undefined || rec[field] === null) {
          throw new Error(`Invalid record in "${tableName}": missing required field "${field}"`)
        }
      }
      // id must be a string — numeric ids cause silent IndexedDB query mismatches
      if (typeof rec.id !== 'string') {
        rec.id = String(rec.id)
      }
    }
  }

  // ─── Reconstitute Date objects from ISO strings ──────────────────────
  // JSON.stringify converts Dates to ISO strings; JSON.parse leaves them
  // as strings. IndexedDB indexes distinguish types, so string dates break
  // every .where() and .orderBy() on date-indexed fields.
  const dateFields: Record<string, string[]> = {
    clients:        ['dateAdded', 'lastSeen', 'birthday', 'clientSince'],
    bookings:       ['dateTime', 'createdAt', 'confirmedAt', 'completedAt', 'cancelledAt'],
    transactions:   ['date'],
    availability:   ['date'],
    safetyChecks:   ['scheduledTime', 'checkedInAt'],
    incidents:      ['date'],
    payments:       ['date'],
    journalEntries: ['date', 'createdAt', 'updatedAt'],
    incallVenues:   ['createdAt', 'updatedAt'],
    screeningDocs:  ['uploadedAt'],
    venueDocs:      ['uploadedAt'],
    bookingChecklist: ['createdAt'],
  }

  for (const [tableName, fields] of Object.entries(dateFields)) {
    const records = (t as Record<string, unknown[]>)[tableName]
    if (!Array.isArray(records)) continue
    for (const record of records) {
      const rec = record as Record<string, unknown>
      for (const f of fields) {
        if (typeof rec[f] === 'string') {
          const d = new Date(rec[f] as string)
          if (!isNaN(d.getTime())) rec[f] = d
        }
      }
    }
  }

  // ─── Reconstitute Blobs from base64 ─────────────────────────────────
  if (Array.isArray(t.screeningDocs)) {
    for (const rec of t.screeningDocs) {
      const r = rec as Record<string, unknown>
      if (typeof r.data === 'string' && r.data.length > 0) {
        r.data = base64ToBlob(r.data as string, (r._blobMime as string) || (r.mimeType as string) || 'application/octet-stream')
      }
      delete r._blobMime
    }
  }
  if (Array.isArray(t.venueDocs)) {
    for (const rec of t.venueDocs) {
      const r = rec as Record<string, unknown>
      if (typeof r.data === 'string' && r.data.length > 0) {
        r.data = base64ToBlob(r.data as string, (r._blobMime as string) || (r.mimeType as string) || 'application/octet-stream')
      }
      delete r._blobMime
    }
  }

  // Clear all tables and restore data atomically
  await db.transaction('rw',
    [db.clients, db.bookings, db.transactions, db.availability, db.safetyContacts,
     db.safetyChecks, db.incidents, db.serviceRates, db.payments, db.journalEntries,
     db.incallVenues, db.screeningDocs, db.venueDocs, db.bookingChecklist],
    async () => {
      await db.clients.clear()
      await db.bookings.clear()
      await db.transactions.clear()
      await db.availability.clear()
      await db.safetyContacts.clear()
      await db.safetyChecks.clear()
      await db.incidents.clear()
      await db.serviceRates.clear()
      await db.payments.clear()
      await db.journalEntries.clear()
      await db.incallVenues.clear()
      await db.screeningDocs.clear()
      await db.venueDocs.clear()
      await db.bookingChecklist.clear()

      if (t.clients?.length)          { await db.clients.bulkAdd(t.clients as any); total += t.clients.length }
      if (t.bookings?.length)         { await db.bookings.bulkAdd(t.bookings as any); total += t.bookings.length }
      if (t.transactions?.length)     { await db.transactions.bulkAdd(t.transactions as any); total += t.transactions.length }
      if (t.availability?.length)     { await db.availability.bulkAdd(t.availability as any); total += t.availability.length }
      if (t.safetyContacts?.length)   { await db.safetyContacts.bulkAdd(t.safetyContacts as any); total += t.safetyContacts.length }
      if (t.safetyChecks?.length)     { await db.safetyChecks.bulkAdd(t.safetyChecks as any); total += t.safetyChecks.length }
      if (t.incidents?.length)        { await db.incidents.bulkAdd(t.incidents as any); total += t.incidents.length }
      if (t.serviceRates?.length)     { await db.serviceRates.bulkAdd(t.serviceRates as any); total += t.serviceRates.length }
      if (t.payments?.length)         { await db.payments.bulkAdd(t.payments as any); total += t.payments.length }
      if (t.journalEntries?.length)   { await db.journalEntries.bulkAdd(t.journalEntries as any); total += t.journalEntries.length }
      if (t.incallVenues?.length)     { await db.incallVenues.bulkAdd(t.incallVenues as any); total += t.incallVenues.length }
      if (t.screeningDocs?.length)    { await db.screeningDocs.bulkAdd(t.screeningDocs as any); total += t.screeningDocs.length }
      if (t.venueDocs?.length)        { await db.venueDocs.bulkAdd(t.venueDocs as any); total += t.venueDocs.length }
      if (t.bookingChecklist?.length) { await db.bookingChecklist.bulkAdd(t.bookingChecklist as any); total += t.bookingChecklist.length }
    }
  )

  // ─── Restore localStorage profile settings ──────────────────────────
  if (payload.profile && typeof payload.profile === 'object') {
    for (const [key, val] of Object.entries(payload.profile)) {
      if (typeof val === 'string') {
        localStorage.setItem(lsKey(key), val)
        // Notify mounted useLocalStorage hooks
        try {
          window.dispatchEvent(new CustomEvent('ls-sync', { detail: { key: lsKey(key), value: JSON.parse(val) } }))
        } catch {
          window.dispatchEvent(new CustomEvent('ls-sync', { detail: { key: lsKey(key), value: val } }))
        }
      }
    }
  }

  return { total }
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Delay revoking — Android needs time to start the download
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function BackupRestoreModal({ isOpen, onClose }: BackupRestoreProps) {
  const [password, setPassword] = useState('')
  const [useEncryption, setUseEncryption] = useState(true)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [working, setWorking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function handleBackup() {
    setWorking(true)
    setStatus(null)
    try {
      const payload = await createBackup()
      const json = JSON.stringify(payload, null, 2)

      const totalRecords = Object.values(payload.tables).reduce((sum, arr) => sum + arr.length, 0)

      if (useEncryption && password.trim()) {
        const encrypted = await encryptData(json, password.trim())
        const wrapper = JSON.stringify({ encrypted: true, data: encrypted })
        const date = new Date().toISOString().split('T')[0]
        downloadFile(wrapper, `companion-backup-${date}.enc.json`)
        recordBackupTimestamp()
        setStatus({ type: 'success', msg: `Encrypted backup saved — ${totalRecords} records` })
      } else {
        const date = new Date().toISOString().split('T')[0]
        downloadFile(json, `companion-backup-${date}.json`)
        recordBackupTimestamp()
        setStatus({ type: 'success', msg: `Backup saved — ${totalRecords} records` })
      }
    } catch (err) {
      setStatus({ type: 'error', msg: `Backup failed: ${(err as Error).message}` })
    }
    setWorking(false)
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function confirmRestore() {
    if (!pendingFile) return
    setWorking(true)
    setStatus(null)
    setPendingFile(null)

    try {
      const text = await pendingFile.text()
      let parsed = JSON.parse(text)

      // Check if encrypted
      if (parsed.encrypted) {
        if (!password.trim()) {
          setStatus({ type: 'error', msg: 'This backup is encrypted — enter the password above' })
          setWorking(false)
          return
        }
        try {
          const decrypted = await decryptData(parsed.data, password.trim())
          parsed = JSON.parse(decrypted)
        } catch {
          setStatus({ type: 'error', msg: 'Wrong password or corrupted backup' })
          setWorking(false)
          return
        }
      }

      if (!parsed.version || !parsed.tables) {
        setStatus({ type: 'error', msg: 'Invalid backup file format' })
        setWorking(false)
        return
      }

      // Reject backups from a newer version — they may contain tables or
      // fields this version doesn't know about, causing silent data loss.
      if (parsed.version > CURRENT_BACKUP_VERSION) {
        setStatus({
          type: 'error',
          msg: `This backup is from a newer version of Companion (v${parsed.version}). Please update the app before restoring (current: v${CURRENT_BACKUP_VERSION}).`,
        })
        setWorking(false)
        return
      }

      const result = await restoreBackup(parsed as BackupPayload)
      // Reset migration flag in Dexie so migrateToPaymentLedger() re-runs in case
      // this backup pre-dates the payments ledger (has no payments table).
      await db.meta.delete('paymentsLedgerMigrated')
      setStatus({ type: 'success', msg: `Restored ${result.total} records from backup` })
    } catch (err) {
      setStatus({ type: 'error', msg: `Restore failed: ${(err as Error).message}` })
    }

    setWorking(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--bg-card)', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Database size={18} style={{ color: '#a855f7' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Backup & Restore</h2>
          </div>
          <button onClick={onClose} className="p-2" style={{ color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 60px)' }}>

          {/* Encryption toggle + password */}
          <div
            className="rounded-xl p-3 space-y-3"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <button
              onClick={() => setUseEncryption(!useEncryption)}
              className="flex items-center gap-3 w-full text-left"
            >
              {useEncryption ? (
                <Lock size={16} style={{ color: '#22c55e' }} />
              ) : (
                <Unlock size={16} style={{ color: 'var(--text-secondary)' }} />
              )}
              <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
                Password Protection
              </span>
              <div
                className="w-10 h-6 rounded-full flex items-center px-0.5 transition-colors"
                style={{ backgroundColor: useEncryption ? '#a855f7' : 'var(--border)' }}
              >
                <div
                  className="w-5 h-5 rounded-full bg-white transition-transform"
                  style={{ transform: useEncryption ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </div>
            </button>

            {useEncryption && (
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="w-full text-sm p-2.5 rounded-lg bg-transparent outline-none"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
              />
            )}

            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
              {useEncryption
                ? 'Your backup will be encrypted with AES-256. Remember this password — there is no recovery.'
                : 'Backup will be saved as plain JSON. Anyone with the file can read your data.'}
            </p>
          </div>

          {/* Backup */}
          <div>
            <p className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-secondary)' }}>Create Backup</p>
            <button
              onClick={handleBackup}
              disabled={working || (useEncryption && !password.trim())}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl font-medium text-sm text-white bg-purple-600 active:scale-[0.98] disabled:opacity-40"
            >
              <Download size={18} />
              {working ? 'Creating...' : 'Download Full Backup'}
            </button>
            <p className="text-[10px] text-center mt-2" style={{ color: 'var(--text-secondary)' }}>
              Includes all clients, bookings, finances, venues, journals, safety data, screening docs, and settings
            </p>
          </div>

          {/* Export to Excel */}
          <div>
            <p className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-secondary)' }}>Export to Excel</p>
            <button
              onClick={async () => {
                setExporting(true)
                setStatus(null)
                try {
                  const { exportAllToExcel } = await import('../utils/exportExcel')
                  await exportAllToExcel()
                  setStatus({ type: 'success', msg: 'Excel workbook exported' })
                } catch (err) {
                  setStatus({ type: 'error', msg: `Export failed: ${(err as Error).message}` })
                }
                setExporting(false)
              }}
              disabled={exporting || working}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl font-medium text-sm border active:scale-[0.98] disabled:opacity-40"
              style={{ borderColor: '#22c55e', color: '#22c55e' }}
            >
              <FileSpreadsheet size={18} />
              {exporting ? 'Exporting...' : 'Download .xlsx Workbook'}
            </button>
            <p className="text-[10px] text-center mt-2" style={{ color: 'var(--text-secondary)' }}>
              Multi-sheet Excel file with Clients, Bookings, Income, Expenses, Payments &amp; Incidents
            </p>
          </div>

          {/* Restore */}
          <div>
            <p className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--text-secondary)' }}>Restore from Backup</p>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              onChange={handleRestore}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={working}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed transition-colors active:scale-[0.98]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <Upload size={18} />
              <span className="text-sm font-medium">
                {working ? 'Restoring...' : 'Choose backup file'}
              </span>
            </button>
            <p className="text-[10px] text-center mt-2 text-red-400">
              Warning: Restoring will replace ALL current data
            </p>
            <p className="text-[10px] text-center mt-1" style={{ color: 'var(--text-secondary)' }}>
              If PIN lock is enabled, encrypted fields (contacts, notes) are only readable when restored on the same device. To transfer to a new device, disable PIN lock before backing up.
            </p>
          </div>

          {/* Status */}
          {status && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl text-sm"
              style={{
                backgroundColor: status.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: status.type === 'success' ? '#22c55e' : '#ef4444',
              }}
            >
              {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {status.msg}
            </div>
          )}

          <div className="h-4" />
        </div>
      </div>
    </div>
    <ConfirmDialog
      isOpen={!!pendingFile}
      title="Restore Backup"
      message="This will REPLACE all current data with the backup. This cannot be undone."
      confirmLabel="Replace All Data"
      confirmColor="#f97316"
      onConfirm={confirmRestore}
      onCancel={() => setPendingFile(null)}
    />
    </>
  )
}
