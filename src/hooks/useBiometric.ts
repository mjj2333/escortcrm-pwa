// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WebAuthn / Platform Authenticator (Face ID, Touch ID, fingerprint)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Architecture:
//   • WebAuthn registers a platform credential (device biometric).
//   • A random AES-256-GCM "wrap key" encrypts the plaintext PIN.
//   • credentialId + encryptedPin + wrapKey are stored in localStorage.
//   • On unlock: WebAuthn assertion proves device identity →
//     decrypt PIN with wrap key → pass PIN to initFieldEncryption.
//
// Security model:
//   This is UI-level protection — the security boundary is same-origin
//   localStorage, as it is for all PWAs. The biometric prevents casual
//   and shoulder-surf access, not a determined attacker with device access.
//   This is the correct and honest value proposition for a PWA auth layer.

import { useState, useEffect } from 'react'
import { lsKey } from './useSettings'

const BIOMETRIC_ENABLED_KEY    = lsKey('biometricEnabled')
const BIOMETRIC_CRED_ID_KEY    = lsKey('biometricCredId')
const BIOMETRIC_ENC_PIN_KEY    = lsKey('biometricEncPin')   // base64 IV+ciphertext
const BIOMETRIC_WRAP_KEY_KEY   = lsKey('biometricWrapKey')  // base64 raw AES key

// ── Helpers ────────────────────────────────────────────────

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)))
}

// ── AES-GCM wrap/unwrap for PIN ────────────────────────────

async function generateWrapKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

async function exportWrapKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return toBase64(raw)
}

async function importWrapKey(b64: string): Promise<CryptoKey> {
  const raw = fromBase64(b64)
  return crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function encryptPin(pin: string, wrapKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, enc.encode(pin))
  // Store iv (12 bytes) + ciphertext
  const combined = new Uint8Array(12 + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), 12)
  return toBase64(combined)
}

async function decryptPin(encB64: string, wrapKey: CryptoKey): Promise<string> {
  const combined = fromBase64(encB64)
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrapKey, ciphertext)
  return new TextDecoder().decode(plain)
}

// ── Public API ─────────────────────────────────────────────

/** Returns true if the device has a platform authenticator (Face ID / Touch ID / fingerprint). */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function isBiometricEnabled(): boolean {
  return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === 'true'
}

/**
 * Register a platform authenticator credential and securely store the PIN
 * so biometric unlock can recover it later.
 *
 * Returns true on success, false if the user cancelled or the device
 * doesn't support platform authenticators.
 */
export async function registerBiometric(plaintextPin: string): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const userId = crypto.getRandomValues(new Uint8Array(16))

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Companion', id: window.location.hostname },
        user: {
          id: userId,
          name: 'companion-user',
          displayName: 'Companion User',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7  }, // ES256
          { type: 'public-key', alg: -257 }, // RS256 fallback
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null

    if (!credential) return false

    // Wrap the plaintext PIN
    const wrapKey = await generateWrapKey()
    const wrapKeyB64 = await exportWrapKey(wrapKey)
    const encPinB64 = await encryptPin(plaintextPin, wrapKey)

    localStorage.setItem(BIOMETRIC_CRED_ID_KEY,  toBase64(credential.rawId))
    localStorage.setItem(BIOMETRIC_ENC_PIN_KEY,   encPinB64)
    localStorage.setItem(BIOMETRIC_WRAP_KEY_KEY,  wrapKeyB64)
    localStorage.setItem(BIOMETRIC_ENABLED_KEY,   'true')

    return true
  } catch (err) {
    // User cancelled or browser rejected — not an error
    console.warn('[biometric] Registration failed or cancelled:', err)
    return false
  }
}

/**
 * Assert the stored platform credential (triggers Face ID / Touch ID / fingerprint).
 * On success, returns the recovered plaintext PIN. Returns null on failure or cancellation.
 */
export async function assertBiometric(): Promise<string | null> {
  try {
    const credIdB64  = localStorage.getItem(BIOMETRIC_CRED_ID_KEY)
    const encPinB64  = localStorage.getItem(BIOMETRIC_ENC_PIN_KEY)
    const wrapKeyB64 = localStorage.getItem(BIOMETRIC_WRAP_KEY_KEY)

    if (!credIdB64 || !encPinB64 || !wrapKeyB64) return null

    const challenge = crypto.getRandomValues(new Uint8Array(32))

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          type: 'public-key',
          id: fromBase64(credIdB64).buffer as ArrayBuffer,
          transports: ['internal'],
        }],
        userVerification: 'required',
        timeout: 60000,
      },
    }) as PublicKeyCredential | null

    if (!assertion) return null

    const wrapKey = await importWrapKey(wrapKeyB64)
    return await decryptPin(encPinB64, wrapKey)
  } catch (err) {
    console.warn('[biometric] Assertion failed or cancelled:', err)
    return null
  }
}

/** Disables biometric and removes all stored credentials + wrapped PIN. */
export function clearBiometric(): void {
  localStorage.removeItem(BIOMETRIC_ENABLED_KEY)
  localStorage.removeItem(BIOMETRIC_CRED_ID_KEY)
  localStorage.removeItem(BIOMETRIC_ENC_PIN_KEY)
  localStorage.removeItem(BIOMETRIC_WRAP_KEY_KEY)
}

/**
 * Re-wrap the stored PIN with a new plaintext PIN value.
 * Call this whenever the user changes their PIN.
 */
export async function reWrapBiometricPin(newPlaintextPin: string): Promise<void> {
  if (!isBiometricEnabled()) return
  const wrapKeyB64 = localStorage.getItem(BIOMETRIC_WRAP_KEY_KEY)
  if (!wrapKeyB64) return
  const wrapKey = await importWrapKey(wrapKeyB64)
  const encPinB64 = await encryptPin(newPlaintextPin, wrapKey)
  localStorage.setItem(BIOMETRIC_ENC_PIN_KEY, encPinB64)
}

// ── React hook ─────────────────────────────────────────────

/** Reactive hook: returns whether biometric is available on this device. */
export function useBiometricAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    isBiometricAvailable().then(setAvailable)
  }, [])
  return available
}
