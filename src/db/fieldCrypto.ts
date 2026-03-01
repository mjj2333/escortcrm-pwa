// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Field-level encryption for IndexedDB at-rest protection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Uses tweetnacl (XSalsa20-Poly1305) for SYNCHRONOUS encrypt/decrypt
// so we can hook into Dexie's synchronous reading/creating/updating hooks.
// Web Crypto PBKDF2 is used only once (at unlock) for key derivation.
//
// Master key architecture:
//   • A random 32-byte master key is generated once on first PIN setup.
//   • It's wrapped (encrypted) by a PBKDF2-derived key from the user's PIN
//     and stored in the Dexie `meta` table.
//   • On unlock, PBKDF2 derives the PIN key → unwraps the master key → cached in memory.
//   • PIN changes only re-wrap the master key (no data re-encryption).
//   • Disabling PIN decrypts all records first, then deletes the master key.
//
// Encrypted field format:  enc:{base64( nonce || ciphertext )}
// The "enc:" prefix distinguishes encrypted from plaintext values.

import type naclType from 'tweetnacl'
let nacl: typeof naclType

// ── Sensitive fields per table ─────────────────────────────────────────
// `alias` excluded: it's indexed for sorting and is typically a pseudonym.

export const SENSITIVE_FIELDS: Record<string, string[]> = {
  clients: [
    'nickname', 'phone', 'email', 'telegram', 'signal', 'whatsapp',
    'address', 'notes', 'preferences',
    'boundaries', 'referenceSource', 'verificationNotes',
  ],
  bookings: ['locationAddress', 'locationNotes', 'notes', 'cancellationReason'],
  safetyContacts: ['name', 'phone', 'relationship'],
  incidents: ['description', 'actionTaken'],
  transactions: ['notes'],
  payments: ['notes'],
  journalEntries: ['notes', 'timingNotes'],
  incallVenues: [
    'address', 'directions', 'contactName', 'contactPhone', 'contactEmail',
    'accessNotes', 'bookingNotes', 'notes',
  ],
}

// ── Module state (memory-only) ─────────────────────────────────────────

let _key: Uint8Array | null = null   // 32-byte nacl secretbox key
let _bypassHooks = false              // skip hooks during migration

export function isFieldEncryptionReady(): boolean {
  return _key !== null
}

/** True when migration is in progress — hooks should pass through. */
export function shouldBypassHooks(): boolean {
  return _bypassHooks
}

export function clearFieldEncryption(): void {
  if (_key) _key.fill(0)
  _key = null
}

// ── Helpers ────────────────────────────────────────────────────────────

const ENC_PREFIX = 'enc:'

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)))
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ── Synchronous field encrypt / decrypt (tweetnacl) ────────────────────

/** Encrypt a string → "enc:{base64}" (synchronous). */
export function encryptFieldSync(value: string | undefined | null): string | undefined | null {
  if (value == null || value === '' || !_key) return value
  if (typeof value === 'string' && value.startsWith(ENC_PREFIX)) return value

  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength) // 24 bytes
  const msgBytes = encoder.encode(value)
  const sealed = nacl.secretbox(msgBytes, nonce, _key)

  // Combine nonce + ciphertext
  const combined = new Uint8Array(nonce.length + sealed.length)
  combined.set(nonce, 0)
  combined.set(sealed, nonce.length)
  return ENC_PREFIX + toBase64(combined)
}

/** Decrypt a field value (synchronous). Non-encrypted values pass through. */
export function decryptFieldSync(value: string | undefined | null): string | undefined | null {
  if (value == null || value === '' || !_key) return value
  if (typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) return value

  try {
    const combined = fromBase64(value.slice(ENC_PREFIX.length))
    const nonce = combined.slice(0, nacl.secretbox.nonceLength)
    const sealed = combined.slice(nacl.secretbox.nonceLength)
    const opened = nacl.secretbox.open(sealed, nonce, _key)
    if (!opened) {
      console.warn('[fieldCrypto] Authentication failed — wrong key or tampered data')
      return value
    }
    return decoder.decode(opened)
  } catch {
    console.warn('[fieldCrypto] Decryption error, returning as-is')
    return value
  }
}

// ── Record-level helpers (for Dexie hooks) ─────────────────────────────

/** Encrypt sensitive fields in a record (synchronous, for creating/updating hooks). */
export function encryptRecordSync<T extends Record<string, unknown>>(
  tableName: string, record: T,
): T {
  const fields = SENSITIVE_FIELDS[tableName]
  if (!fields || !_key) return record
  const clone = { ...record }
  for (const f of fields) {
    if (f in clone && typeof clone[f] === 'string') {
      (clone as any)[f] = encryptFieldSync(clone[f] as string)
    }
  }
  return clone
}

/** Decrypt sensitive fields in a record (synchronous, for reading hook). */
export function decryptRecordSync<T extends Record<string, unknown>>(
  tableName: string, record: T,
): T {
  if (!record) return record
  const fields = SENSITIVE_FIELDS[tableName]
  if (!fields || !_key) return record
  const clone = { ...record }
  for (const f of fields) {
    if (f in clone && typeof clone[f] === 'string') {
      (clone as any)[f] = decryptFieldSync(clone[f] as string)
    }
  }
  return clone
}

// ── Key derivation (async — only called once at unlock) ────────────────

const PBKDF2_ITERATIONS = 200_000

async function derivePinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

// ── Master key wrap / unwrap ───────────────────────────────────────────

interface WrappedKeyMeta {
  key: string
  value: { wrappedKey: string; salt: string }
}

async function wrapAndStore(pin: string, rawKey: Uint8Array): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const pinKey = await derivePinKey(pin, salt)

  // Import raw key as extractable CryptoKey for AES-KW wrapping
  const extractable = await crypto.subtle.importKey(
    'raw', rawKey.buffer as ArrayBuffer, 'AES-GCM', true, ['encrypt', 'decrypt'],
  )
  const wrapped = await crypto.subtle.wrapKey('raw', extractable, pinKey, 'AES-KW')

  // Dynamic import to avoid circular dependency with db/index.ts
  const { db } = await import('./index')
  await db.meta.put({
    key: 'field_encryption_key',
    value: { wrappedKey: toBase64(new Uint8Array(wrapped)), salt: toBase64(salt) },
  })
}

async function unwrapFromStore(pin: string): Promise<Uint8Array> {
  const { db } = await import('./index')
  const record = await db.meta.get('field_encryption_key') as WrappedKeyMeta | undefined
  if (!record?.value?.wrappedKey || !record?.value?.salt) {
    throw new Error('No encryption key found in database')
  }

  const pinKey = await derivePinKey(pin, fromBase64(record.value.salt))

  const extractable = await crypto.subtle.unwrapKey(
    'raw',
    fromBase64(record.value.wrappedKey).buffer as ArrayBuffer,
    pinKey,
    'AES-KW',
    'AES-GCM',
    true,
    ['encrypt', 'decrypt'],
  )

  const raw = await crypto.subtle.exportKey('raw', extractable)
  return new Uint8Array(raw)
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Initialize field encryption on PIN unlock.
 * - Wrapped key exists → unwrap (returning user).
 * - No key → first-time: generate + encrypt existing data.
 */
export async function initFieldEncryption(pin: string): Promise<void> {
  if (!nacl) nacl = (await import('tweetnacl')).default
  const { db } = await import('./index')
  const record = await db.meta.get('field_encryption_key')
  if (record?.value) {
    _key = await unwrapFromStore(pin)
  } else {
    _key = nacl.randomBytes(32)
    await wrapAndStore(pin, _key)
    await migrateAllToEncrypted()
  }
  // Versioned re-encrypt: pick up newly added sensitive fields for existing users
  // Bump this number whenever SENSITIVE_FIELDS is expanded.
  const ENCRYPT_SCHEMA_VERSION = 2
  const currentVersion = await db.meta.get('encrypt_schema_version')
  if (!currentVersion || (currentVersion.value as number) < ENCRYPT_SCHEMA_VERSION) {
    await migrateAllToEncrypted()
    await db.meta.put({ key: 'encrypt_schema_version', value: ENCRYPT_SCHEMA_VERSION })
  }
}

/**
 * Re-wrap master key with a new PIN (on PIN change).
 * No data re-encryption needed.
 */
export async function reWrapMasterKey(newPin: string): Promise<void> {
  if (!_key) throw new Error('Encryption not initialized')
  await wrapAndStore(newPin, _key)
}

/**
 * Disable encryption: decrypt all data → remove key → clear memory.
 */
export async function disableFieldEncryption(): Promise<void> {
  if (_key) {
    await migrateAllToPlaintext()
  }
  const { db } = await import('./index')
  await db.meta.delete('field_encryption_key')
  clearFieldEncryption()
}

// ── Migration helpers ──────────────────────────────────────────────────

const ENCRYPTED_TABLES = Object.keys(SENSITIVE_FIELDS)

async function migrateAllToEncrypted(): Promise<void> {
  if (!_key) return
  _bypassHooks = true
  try {
    const { db } = await import('./index')

    for (const tableName of ENCRYPTED_TABLES) {
      const table = (db as any)[tableName]
      if (!table) continue
      const fields = SENSITIVE_FIELDS[tableName]

      // Wrap each table's migration in a transaction for atomicity
      await db.transaction('rw', table, async () => {
        const records: any[] = await table.toArray()
        for (const record of records) {
          const updates: Record<string, string> = {}
          let changed = false
          for (const f of fields) {
            const v = record[f]
            if (typeof v === 'string' && v !== '' && !v.startsWith(ENC_PREFIX)) {
              updates[f] = encryptFieldSync(v) as string
              changed = true
            }
          }
          if (changed) await table.update(record.id, updates)
        }
      })
    }
  } finally {
    _bypassHooks = false
  }
}

async function migrateAllToPlaintext(): Promise<void> {
  if (!_key) return
  _bypassHooks = true
  try {
    const { db } = await import('./index')

    for (const tableName of ENCRYPTED_TABLES) {
      const table = (db as any)[tableName]
      if (!table) continue
      const fields = SENSITIVE_FIELDS[tableName]

      // Wrap each table's migration in a transaction for atomicity
      await db.transaction('rw', table, async () => {
        const records: any[] = await table.toArray()
        for (const record of records) {
          const updates: Record<string, string> = {}
          let changed = false
          for (const f of fields) {
            const v = record[f]
            if (typeof v === 'string' && v.startsWith(ENC_PREFIX)) {
              updates[f] = decryptFieldSync(v) as string
              changed = true
            }
          }
          if (changed) await table.update(record.id, updates)
        }
      })
    }
  } finally {
    _bypassHooks = false
  }
}
