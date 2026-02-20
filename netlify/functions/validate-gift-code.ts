// netlify/functions/validate-gift-code.ts
// Server-side gift code validation. Moves code hashes off the client bundle
// so they can't be brute-forced by inspecting the JS bundle.
//
// ENV VARS REQUIRED:
//   GIFT_CODE_HASHES — comma-separated list of sha256 hashes, e.g. "abc123,def456"
//                      If not set, falls back to the hardcoded list below.

import type { Handler } from '@netlify/functions'
import { createHash } from 'crypto'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

interface GiftCodeRecord {
  hash: string
  expiresAt?: string
}

// Fallback list — same hashes that were previously in the client bundle.
// Better to set GIFT_CODE_HASHES env var in Netlify so you can rotate codes
// without a redeploy, but this works out of the box.
const FALLBACK_CODES: GiftCodeRecord[] = [
  { hash: '22b70cf5f3c48d73f301cb49e00b43604b3bff75be01319ce42a7cb2b1574e8a' },
  { hash: '7ff50e40fc16aaca1dd462c9310b97db4e3455bef6ca8597f6d79d96b80b6f5d' },
  { hash: 'e17feea8d0336808d0626211d4329641363aea251f6cf272826d99b922f73e4b' },
  { hash: 'fc5f03e446befb2b4dff21986943b8e987056056f806a6af7d9354f83a2a476c' },
  { hash: 'ad93e9abe2968f813af1a63ab8f1f811a6771a8fe54f8cdce7db4706fb6cd8ec' },
  { hash: '064ed653d8255f22b85ef34d3d4d7ba4e0f9a2fcce6146df670d1eeb0d734e8c' },
  { hash: '01139000e917e30c9833c6008e37a1c5b237a00fc1d928d7bd617d169795442d' },
  { hash: '47936b5c1a7baef51aef96db4039a30a32ee5b3b29b3992625bf85e04ca91713' },
  { hash: '7c2d0b10df6053d2748bfc9a8767a062e2024509a9b6f527665bc2309e818767' },
  { hash: 'cd0690feb7fa9c4ee2a287d22e2c5da02557e35cec6cd947af914c9d4ec174ac' },
]

function getGiftCodes(): GiftCodeRecord[] {
  const env = process.env.GIFT_CODE_HASHES
  if (!env) return FALLBACK_CODES
  // Format: "hash1,hash2" or "hash1:2026-12-31,hash2" for codes with expiry
  return env.split(',').map(entry => {
    const [hash, expiresAt] = entry.trim().split(':')
    return { hash, ...(expiresAt ? { expiresAt } : {}) }
  })
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { code } = JSON.parse(event.body || '{}')
    if (!code || typeof code !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ valid: false, error: 'Code is required' }),
      }
    }

    // Hash the submitted code server-side using Node's crypto (no client bundle exposure)
    const hash = createHash('sha256')
      .update(code.trim().toUpperCase())
      .digest('hex')

    const codes = getGiftCodes()
    const match = codes.find(c => c.hash === hash)

    if (!match) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ valid: false, error: 'Invalid promo code' }),
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        expiresAt: match.expiresAt ?? null,
      }),
    }
  } catch (err: any) {
    console.error('Gift code validation error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ valid: false, error: 'Server error — please try again' }),
    }
  }
}
