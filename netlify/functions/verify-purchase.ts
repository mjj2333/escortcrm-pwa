// netlify/functions/verify-purchase.ts
// Verifies whether an email has an active Stripe subscription or completed one-time payment.
//
// Fast path: checks the Netlify Blobs license cache written by stripe-webhook.ts.
// Slow path: falls back to live Stripe API calls if no cached record exists (e.g. for
//            users who purchased before the webhook was set up), then writes to cache.
//
// Also supports revalidation: the client sends a server-signed token back and we
// verify it's genuine + the subscription is still active.  This prevents client-side
// bypass of the paywall by injecting fake activation state into storage.
//
// ENV VARS REQUIRED (set in Netlify dashboard → Site settings → Environment variables):
//   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
//   STRIPE_LIFETIME_PRICE_ID   — price_... for the lifetime product
//   STRIPE_MONTHLY_PRICE_ID    — price_... for the monthly subscription
//   STRIPE_WEBHOOK_SECRET      — whsec_... (used by stripe-webhook.ts, not here)
//   ACTIVATION_SECRET          — (optional) dedicated HMAC key for activation tokens;
//                                 falls back to STRIPE_SECRET_KEY if not set

import Stripe from 'stripe'
import { getStore } from '@netlify/blobs'
import { createHmac, timingSafeEqual } from 'crypto'
import type { Handler } from '@netlify/functions'
import type { LicenseRecord } from './stripe-webhook'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

const LIFETIME_PRICE = process.env.STRIPE_LIFETIME_PRICE_ID || 'price_1T1VsvPW55YHq7QNqO3E9Rav'
const MONTHLY_PRICE  = process.env.STRIPE_MONTHLY_PRICE_ID  || 'price_1T1VpdPW55YHq7QNt5DNxBXr'

const headers = {
  'Access-Control-Allow-Origin': 'https://companion1.netlify.app',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

// ─── HMAC activation token helpers ──────────────────────────────────────────

const ACTIVATION_SECRET = process.env.ACTIVATION_SECRET || process.env.STRIPE_SECRET_KEY || ''

/** Create an HMAC-SHA256 activation token for a given identifier + plan.
 *  The client stores this token and sends it back for revalidation.
 *  Without the server secret, the token cannot be forged. */
export function signActivation(identifier: string, plan: string): string {
  return createHmac('sha256', ACTIVATION_SECRET)
    .update(`${identifier}|${plan}`)
    .digest('hex')
}

/** Constant-time comparison of an activation token against the expected value. */
function verifyToken(identifier: string, plan: string, token: string): boolean {
  try {
    const expected = signActivation(identifier, plan)
    if (token.length !== expected.length) return false
    return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

// ─── Blob helpers ───────────────────────────────────────────────────────────

function licenseStore() {
  return getStore({ name: 'licenses', consistency: 'strong', siteID: process.env.NETLIFY_SITE_ID, token: process.env.BLOBS_TOKEN })
}

async function writeLicenseCache(email: string, plan: 'monthly' | 'lifetime') {
  try {
    const store = licenseStore()
    const existing = await store.get(email, { type: 'json' }).catch(() => null) as LicenseRecord | null
    // Never downgrade a lifetime licence that was already cached
    if (existing?.plan === 'lifetime') return
    const record: LicenseRecord = {
      plan,
      activatedAt: existing?.activatedAt ?? new Date().toISOString(),
    }
    await store.set(email, JSON.stringify(record))
  } catch (err) {
    // Cache write failure is non-fatal — verification already succeeded
    console.warn('[verify] failed to write license cache:', err)
  }
}

/** Build a success response with the HMAC activation token included. */
function successResponse(email: string, plan: 'monthly' | 'lifetime') {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      valid: true,
      plan,
      token: signActivation(email, plan),
    }),
  }
}

// ─── handler ────────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { email, action } = body

    // ─── Revalidation path ────────────────────────────────────────────────
    // Client sends its stored token + email + plan so we can confirm:
    //   1. The token is genuine (HMAC check)
    //   2. The subscription is still active (for monthly plans)
    if (action === 'revalidate') {
      const { token, plan } = body
      if (!email || !token || !plan) {
        return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Missing fields' }) }
      }
      const normalizedEmail = email.trim().toLowerCase()

      // Step 1: Is the token genuine?
      if (!verifyToken(normalizedEmail, plan, token)) {
        return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Invalid token' }) }
      }

      // Step 2: Is the subscription still active?
      // Lifetime purchases are always valid once the token is verified.
      if (plan === 'lifetime') {
        return { statusCode: 200, headers, body: JSON.stringify({ valid: true, plan }) }
      }

      // Monthly — check Blob cache for revocation
      try {
        const store = licenseStore()
        const cached = await store.get(normalizedEmail, { type: 'json' }).catch(() => null) as LicenseRecord | null
        if (cached?.revokedAt) {
          return { statusCode: 200, headers, body: JSON.stringify({ valid: false, error: 'Subscription cancelled' }) }
        }
      } catch {
        // Blob unavailable — assume still valid rather than wrongly deactivating
      }

      return { statusCode: 200, headers, body: JSON.stringify({ valid: true, plan }) }
    }

    // ─── Normal verification path ─────────────────────────────────────────

    if (!email || typeof email !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ valid: false, error: 'Email is required' }),
      }
    }

    const normalizedEmail = email.trim().toLowerCase()

    // ─── Fast path: check the Blobs cache written by stripe-webhook.ts ───────
    try {
      const store = licenseStore()
      const cached = await store.get(normalizedEmail, { type: 'json' }).catch(() => null) as LicenseRecord | null

      if (cached) {
        if (cached.revokedAt) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ valid: false, error: 'Subscription is no longer active' }),
          }
        }
        return successResponse(normalizedEmail, cached.plan)
      }
    } catch (err) {
      console.warn('[verify] blob cache read failed, falling back to Stripe:', err)
    }

    // ─── Slow path: live Stripe lookup ────────────────────────────────────────

    const customers = await stripe.customers.list({
      email: normalizedEmail,
      limit: 1,
    })

    if (customers.data.length > 0) {
      const customer = customers.data[0]

      // Check active subscriptions
      const customerSubs = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 10,
      })

      for (const sub of customerSubs.data) {
        const hasMonthlyPrice  = sub.items.data.some(item => item.price.id === MONTHLY_PRICE)
        const hasLifetimePrice = sub.items.data.some(item => item.price.id === LIFETIME_PRICE)
        if (hasLifetimePrice) {
          await writeLicenseCache(normalizedEmail, 'lifetime')
          return successResponse(normalizedEmail, 'lifetime')
        }
        if (hasMonthlyPrice) {
          await writeLicenseCache(normalizedEmail, 'monthly')
          return successResponse(normalizedEmail, 'monthly')
        }
      }

      // Check PaymentIntents with lifetime metadata
      const paymentIntents = await stripe.paymentIntents.list({
        customer: customer.id,
        limit: 20,
      })

      for (const pi of paymentIntents.data) {
        if (pi.status === 'succeeded' && pi.metadata?.plan === 'lifetime') {
          await writeLicenseCache(normalizedEmail, 'lifetime')
          return successResponse(normalizedEmail, 'lifetime')
        }
      }

      // Check completed checkout sessions (covers Payment Link purchases)
      const sessions = await stripe.checkout.sessions.list({
        customer: customer.id,
        limit: 20,
        status: 'complete',
      })

      for (const session of sessions.data) {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 })
        const hasLifetime = lineItems.data.some(item => item.price?.id === LIFETIME_PRICE)
        if (hasLifetime) {
          await writeLicenseCache(normalizedEmail, 'lifetime')
          return successResponse(normalizedEmail, 'lifetime')
        }
        const hasMonthly = lineItems.data.some(item => item.price?.id === MONTHLY_PRICE)
        if (hasMonthly) {
          await writeLicenseCache(normalizedEmail, 'monthly')
          return successResponse(normalizedEmail, 'monthly')
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ valid: false, error: 'No active purchase found for this email' }),
    }
  } catch (err: any) {
    console.error('Stripe verification error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ valid: false, error: 'Server error — please try again' }),
    }
  }
}
