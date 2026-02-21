// netlify/functions/rate-limit.ts
// Lightweight rate limiter for Netlify Functions using Blobs storage.
// Tracks request counts per IP + endpoint in a sliding window.
//
// Usage:
//   const limited = await checkRateLimit(event, 'verify-purchase', { maxRequests: 10, windowMs: 60_000 })
//   if (limited) return limited   // returns a 429 response

import { getStore } from '@netlify/blobs'
import type { HandlerEvent, HandlerResponse } from '@netlify/functions'

interface RateLimitRecord {
  /** Timestamps of requests within the current window */
  hits: number[]
}

interface RateLimitOptions {
  /** Maximum requests allowed within the window (default: 10) */
  maxRequests?: number
  /** Sliding window duration in milliseconds (default: 60 seconds) */
  windowMs?: number
}

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://companion1.netlify.app'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function rateLimitStore() {
  return getStore({
    name: 'rate-limits',
    consistency: 'strong',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.BLOBS_TOKEN,
  })
}

/** Extract client IP from Netlify function event headers. */
function getClientIp(event: HandlerEvent): string {
  return (
    event.headers['x-nf-client-connection-ip'] ??
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ??
    event.headers['client-ip'] ??
    'unknown'
  )
}

/**
 * Check whether the request should be rate-limited.
 * Returns `null` if the request is allowed, or a 429 HandlerResponse if blocked.
 *
 * Uses Netlify Blobs as a simple sliding-window counter per IP + endpoint.
 * Blobs entries are naturally scoped to the site and auto-expire won't accumulate
 * indefinitely because old timestamps are pruned on every check.
 */
export async function checkRateLimit(
  event: HandlerEvent,
  endpoint: string,
  options: RateLimitOptions = {}
): Promise<HandlerResponse | null> {
  const { maxRequests = 10, windowMs = 60_000 } = options
  const ip = getClientIp(event)
  // Sanitize the key — Blobs keys can't contain certain characters
  const key = `${endpoint}:${ip.replace(/[^a-zA-Z0-9.:_-]/g, '_')}`
  const now = Date.now()

  try {
    const store = rateLimitStore()
    const existing = await store.get(key, { type: 'json' }).catch(() => null) as RateLimitRecord | null

    // Prune hits outside the window
    const hits = existing?.hits?.filter(t => now - t < windowMs) ?? []

    if (hits.length >= maxRequests) {
      const retryAfterSec = Math.ceil((hits[0] + windowMs - now) / 1000)
      return {
        statusCode: 429,
        headers: {
          ...CORS_HEADERS,
          'Retry-After': String(retryAfterSec),
        },
        body: JSON.stringify({
          error: 'Too many requests — please try again later',
          retryAfter: retryAfterSec,
        }),
      }
    }

    // Record this request
    hits.push(now)
    await store.set(key, JSON.stringify({ hits }))
    return null // allowed
  } catch (err) {
    // If Blobs is unavailable, allow the request rather than blocking legitimate users
    console.warn('[rate-limit] Blobs unavailable, allowing request:', err)
    return null
  }
}
