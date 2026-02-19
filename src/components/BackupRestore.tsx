import { useState, useRef } from 'react'
import {
  Download, Upload, X, CheckCircle, AlertCircle, Lock, Unlock, Database
} from 'lucide-react'
import { db } from '../db'
import { ConfirmDialog } from './ConfirmDialog'

interface BackupRestoreProps {
  isOpen: boolean
  onClose: () => void
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRYPTO HELPERS (AES-GCM via Web Crypto API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100_000, hash: 'SHA-256' },
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
  return btoa(String.fromCharCode(...combined))
}

async function decryptData(encoded: string, password: string): Promise<string> {
  const combined = new Uint8Array(atob(encoded).split('').map(c => c.charCodeAt(0)))
  const salt = combined.slice(0, 16)
  const iv = combined.slice(16, 28)
  const ciphertext = combined.slice(28)
  const key = await deriveKey(password, salt)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(decrypted)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BACKUP / RESTORE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
  }
}

async function createBackup(): Promise<BackupPayload> {
  return {
    version: 1,
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
    },
  }
}

async function restoreBackup(payload: BackupPayload): Promise<{ total: number }> {
  let total = 0

  // Clear all tables first
  await db.clients.clear()
  await db.bookings.clear()
  await db.transactions.clear()
  await db.availability.clear()
  await db.safetyContacts.clear()
  await db.safetyChecks.clear()
  await db.incidents.clear()
  await db.serviceRates.clear()

  const t = payload.tables
  if (t.clients?.length) { await db.clients.bulkAdd(t.clients as any); total += t.clients.length }
  if (t.bookings?.length) { await db.bookings.bulkAdd(t.bookings as any); total += t.bookings.length }
  if (t.transactions?.length) { await db.transactions.bulkAdd(t.transactions as any); total += t.transactions.length }
  if (t.availability?.length) { await db.availability.bulkAdd(t.availability as any); total += t.availability.length }
  if (t.safetyContacts?.length) { await db.safetyContacts.bulkAdd(t.safetyContacts as any); total += t.safetyContacts.length }
  if (t.safetyChecks?.length) { await db.safetyChecks.bulkAdd(t.safetyChecks as any); total += t.safetyChecks.length }
  if (t.incidents?.length) { await db.incidents.bulkAdd(t.incidents as any); total += t.incidents.length }
  if (t.serviceRates?.length) { await db.serviceRates.bulkAdd(t.serviceRates as any); total += t.serviceRates.length }

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
  URL.revokeObjectURL(url)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function BackupRestoreModal({ isOpen, onClose }: BackupRestoreProps) {
  const [password, setPassword] = useState('')
  const [useEncryption, setUseEncryption] = useState(true)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [working, setWorking] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
        downloadFile(wrapper, `escortcrm-backup-${date}.enc.json`)
        setStatus({ type: 'success', msg: `Encrypted backup saved — ${totalRecords} records` })
      } else {
        const date = new Date().toISOString().split('T')[0]
        downloadFile(json, `escortcrm-backup-${date}.json`)
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

      const result = await restoreBackup(parsed as BackupPayload)
      setStatus({ type: 'success', msg: `Restored ${result.total} records from backup` })
    } catch (err) {
      setStatus({ type: 'error', msg: `Restore failed: ${(err as Error).message}` })
    }

    setWorking(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
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
          <button onClick={onClose} className="p-1" style={{ color: 'var(--text-secondary)' }}>
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
              Includes all clients, bookings, finances, availability, safety data, and settings
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
