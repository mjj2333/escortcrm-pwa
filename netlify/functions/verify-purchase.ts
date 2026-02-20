// netlify/functions/verify-purchase.ts
// Verifies whether an email has an active Stripe subscription or completed one-time payment.
//
// Fast path: checks the Netlify Blobs license cache written by stripe-webhook.ts.
// Slow path: falls back to live Stripe API calls if no cached record exists (e.g. for
//            users who purchased before the webhook was set up), then writes to cache.
//
// ENV VARS REQUIRED (set in Netlify dashboard → Site settings → Environment variables):
//   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
//   STRIPE_LIFETIME_PRICE_ID   — price_... for the lifetime product
//   STRIPE_MONTHLY_PRICE_ID    — price_... for the monthly subscription
//   STRIPE_WEBHOOK_SECRET      — whsec_... (used by stripe-webhook.ts, not here)

import Stripe from 'stripe'
import { getStore } from '@netlify/blobs'
import type { Handler } from '@netlify/functions'
import type { LicenseRecord } from './stripe-webhook'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

const LIFETIME_PRICE = process.env.STRIPE_LIFETIME_PRICE_ID || 'price_1T1VsvPW55YHq7QNqO3E9Rav'
const MONTHLY_PRICE  = process.env.STRIPE_MONTHLY_PRICE_ID  || 'price_1T1VpdPW55YHq7QNt5DNxBXr'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

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

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { email } = JSON.parse(event.body || '{}')

    if (!email || typeof email !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ valid: false, error: 'Email is required' }),
      }
    }

    const normalizedEmail = email.trim().toLowerCase()

    // ─── Fast path: check the Blobs cache written by stripe-webhook.ts ───────
    // This avoids multiple Stripe API round-trips on every verification attempt.
    try {
      const store = licenseStore()
      const cached = await store.get(normalizedEmail, { type: 'json' }).catch(() => null) as LicenseRecord | null

      if (cached) {
        if (cached.revokedAt) {
          // Subscription was cancelled — no longer valid
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ valid: false, error: 'Subscription is no longer active' }),
          }
        }
        // Valid cached licence — return immediately, no Stripe call needed
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ valid: true, plan: cached.plan }),
        }
      }
    } catch (err) {
      // Blob read failure is non-fatal — fall through to live Stripe lookup
      console.warn('[verify] blob cache read failed, falling back to Stripe:', err)
    }

    // ─── Slow path: live Stripe lookup ────────────────────────────────────────
    // Used for users who purchased before the webhook was configured, or when
    // the Blob store is temporarily unavailable.

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
          return { statusCode: 200, headers, body: JSON.stringify({ valid: true, plan: 'lifetime' }) }
        }
        if (hasMonthlyPrice) {
          await writeLicenseCache(normalizedEmail, 'monthly')
          return { statusCode: 200, headers, body: JSON.stringify({ valid: true, plan: 'monthly' }) }
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
          return { statusCode: 200, headers, body: JSON.stringify({ valid: true, plan: 'lifetime' }) }
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
          return { statusCode: 200, headers, body: JSON.stringify({ valid: true, plan: 'lifetime' }) }
        }
        const hasMonthly = lineItems.data.some(item => item.price?.id === MONTHLY_PRICE)
        if (hasMonthly) {
          await writeLicenseCache(normalizedEmail, 'monthly')
          return { statusCode: 200, headers, body: JSON.stringify({ valid: true, plan: 'monthly' }) }
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
