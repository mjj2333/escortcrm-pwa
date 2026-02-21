// netlify/functions/admin-gift-codes.ts
// Admin API for managing gift codes. Protected by ADMIN_PASSWORD env var.
//
// Actions (POST body: { action, password, ...params }):
//   generate  — creates a new random code, stores hash in Blobs, returns plaintext once
//   list      — returns all codes (with metadata, no plaintext for revoked)
//   revoke    — marks a code as revoked by its id
//
// ENV VARS REQUIRED:
//   ADMIN_PASSWORD     — secret password to access this endpoint
//   BLOBS_TOKEN        — Netlify personal access token (same as used by stripe-webhook)
//   NETLIFY_SITE_ID    — your Netlify site ID

import type { Handler } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { checkRateLimit } from './rate-limit'

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://companion1.netlify.app'

const headers = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

export interface GiftCodeRecord {
  id: string           // random UUID, used as Blob key
  hash: string         // SHA-256 of the plaintext code
  label: string        // human-readable label e.g. "Beta tester - Jane"
  createdAt: string    // ISO date
  expiresAt?: string   // ISO date — optional expiry
  revoked: boolean
  // plaintext is NEVER stored — returned once on generation only
}

function codeStore() {
  return getStore({
    name: 'gift-codes',
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.BLOBS_TOKEN,
  })
}

function hashCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

function generateCode(): string {
  // Format: COMPANION-XXXX-XXXX (alphanumeric, no ambiguous chars like 0/O, 1/I)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const segment = (len: number) =>
    Array.from(randomBytes(len))
      .map(b => chars[b % chars.length])
      .join('')
  return `COMPANION-${segment(4)}-${segment(4)}`
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  // Rate limit: 5 requests per minute per IP (prevents admin password brute-force)
  const limited = await checkRateLimit(event, 'admin-gift-codes', { maxRequests: 5, windowMs: 60_000, failClosed: true })
  if (limited) return limited

  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ADMIN_PASSWORD not configured' }) }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { action, password } = body

    // Validate admin password
    const isValid = password &&
      Buffer.byteLength(password) === Buffer.byteLength(adminPassword) &&
      timingSafeEqual(Buffer.from(password), Buffer.from(adminPassword))
    if (!isValid) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid password' }) }
    }

    const store = codeStore()

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const { blobs } = await store.list()
      const codes: GiftCodeRecord[] = []
      for (const { key: name } of blobs) {
        try {
          const raw = await store.get(name, { type: 'json' })
          if (raw) codes.push(raw as GiftCodeRecord)
        } catch {}
      }
      // Sort newest first
      codes.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return { statusCode: 200, headers, body: JSON.stringify({ codes }) }
    }

    // ── GENERATE ──────────────────────────────────────────────────────────────
    if (action === 'generate') {
      const { label = 'Gift code', expiresAt } = body
      const plaintext = generateCode()
      const id = randomBytes(8).toString('hex')
      const record: GiftCodeRecord = {
        id,
        hash: hashCode(plaintext),
        label: label.trim() || 'Gift code',
        createdAt: new Date().toISOString(),
        ...(expiresAt ? { expiresAt } : {}),
        revoked: false,
      }
      await store.set(id, JSON.stringify(record))
      // Return plaintext ONCE — never stored, can't be recovered
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ code: plaintext, record }),
      }
    }

    // ── REVOKE ────────────────────────────────────────────────────────────────
    if (action === 'revoke') {
      const { id } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) }
      const existing = await store.get(id, { type: 'json' }) as GiftCodeRecord | null
      if (!existing) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Code not found' }) }
      const updated: GiftCodeRecord = { ...existing, revoked: true }
      await store.set(id, JSON.stringify(updated))
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) }

  } catch (err: any) {
    console.error('[admin-gift-codes] error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) }
  }
}
