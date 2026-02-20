// netlify/functions/stripe-webhook.ts
// Receives Stripe webhook events and writes license records to Netlify Blobs.
//
// This is the "push" side of license management — Stripe calls this endpoint
// whenever a subscription or one-time purchase changes, so verify-purchase.ts
// can read from the Blob cache instead of making live Stripe API calls every time.
//
// ENV VARS REQUIRED (set in Netlify dashboard → Site settings → Environment variables):
//   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET      — whsec_... from Stripe Dashboard → Webhooks
//   STRIPE_LIFETIME_PRICE_ID   — price_... for the lifetime product
//   STRIPE_MONTHLY_PRICE_ID    — price_... for the monthly subscription
//
// STRIPE SETUP:
//   1. Stripe Dashboard → Developers → Webhooks → Add endpoint
//   2. Endpoint URL: https://<your-site>.netlify.app/.netlify/functions/stripe-webhook
//   3. Events to listen for:
//        checkout.session.completed
//        customer.subscription.created
//        customer.subscription.updated
//        customer.subscription.deleted

import Stripe from 'stripe'
import { getStore } from '@netlify/blobs'
import type { Handler } from '@netlify/functions'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

const LIFETIME_PRICE = process.env.STRIPE_LIFETIME_PRICE_ID || 'price_1T1VsvPW55YHq7QNqO3E9Rav'
const MONTHLY_PRICE  = process.env.STRIPE_MONTHLY_PRICE_ID  || 'price_1T1VpdPW55YHq7QNt5DNxBXr'
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET    || ''

export interface LicenseRecord {
  plan: 'monthly' | 'lifetime'
  activatedAt: string   // ISO date
  revokedAt?: string    // ISO date — set when subscription is cancelled
}

// ─── helpers ────────────────────────────────────────────────────────────────

function licenseStore() {
  return getStore({ name: 'licenses', consistency: 'strong' })
}

async function activateLicense(email: string, plan: 'monthly' | 'lifetime') {
  const store = licenseStore()
  const existing = await store.get(email, { type: 'json' }).catch(() => null) as LicenseRecord | null

  // Never downgrade a lifetime licence
  if (existing?.plan === 'lifetime') return

  const record: LicenseRecord = {
    plan,
    activatedAt: existing?.activatedAt ?? new Date().toISOString(),
  }
  await store.set(email, JSON.stringify(record))
  console.log(`[webhook] activated ${plan} for ${email}`)
}

async function revokeLicense(email: string) {
  const store = licenseStore()
  const existing = await store.get(email, { type: 'json' }).catch(() => null) as LicenseRecord | null

  // Never revoke a lifetime licence
  if (!existing || existing.plan === 'lifetime') return

  const record: LicenseRecord = {
    ...existing,
    revokedAt: new Date().toISOString(),
  }
  await store.set(email, JSON.stringify(record))
  console.log(`[webhook] revoked ${existing.plan} for ${email}`)
}

async function getEmailForCustomer(customerId: string): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted) return null
    return (customer as Stripe.Customer).email?.toLowerCase() ?? null
  } catch {
    return null
  }
}

// ─── handler ────────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  // Verify the webhook signature so we only process genuine Stripe events
  const sig = event.headers['stripe-signature']
  if (!sig || !WEBHOOK_SECRET) {
    console.error('[webhook] missing stripe-signature or STRIPE_WEBHOOK_SECRET')
    return { statusCode: 400, body: 'Missing signature' }
  }

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body ?? '', sig, WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('[webhook] signature verification failed:', err.message)
    return { statusCode: 400, body: `Webhook signature error: ${err.message}` }
  }

  try {
    switch (stripeEvent.type) {

      // ── One-time purchase or new subscription via Payment Link / Checkout ──
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session
        const email = session.customer_details?.email?.toLowerCase()
        if (!email) break

        // Determine the plan from the line items
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 })
        const hasLifetime = lineItems.data.some(item => item.price?.id === LIFETIME_PRICE)
        const hasMonthly  = lineItems.data.some(item => item.price?.id === MONTHLY_PRICE)

        if (hasLifetime) await activateLicense(email, 'lifetime')
        else if (hasMonthly) await activateLicense(email, 'monthly')
        break
      }

      // ── New subscription activated ──
      case 'customer.subscription.created': {
        const sub = stripeEvent.data.object as Stripe.Subscription
        if (sub.status !== 'active') break
        const email = await getEmailForCustomer(String(sub.customer))
        if (!email) break
        const hasMonthly  = sub.items.data.some(item => item.price.id === MONTHLY_PRICE)
        const hasLifetime = sub.items.data.some(item => item.price.id === LIFETIME_PRICE)
        if (hasLifetime) await activateLicense(email, 'lifetime')
        else if (hasMonthly) await activateLicense(email, 'monthly')
        break
      }

      // ── Subscription changed (reactivated, payment recovered, or cancelled) ──
      case 'customer.subscription.updated': {
        const sub = stripeEvent.data.object as Stripe.Subscription
        const email = await getEmailForCustomer(String(sub.customer))
        if (!email) break
        if (sub.status === 'active') {
          const hasMonthly  = sub.items.data.some(item => item.price.id === MONTHLY_PRICE)
          const hasLifetime = sub.items.data.some(item => item.price.id === LIFETIME_PRICE)
          if (hasLifetime) await activateLicense(email, 'lifetime')
          else if (hasMonthly) await activateLicense(email, 'monthly')
        } else if (['canceled', 'unpaid', 'past_due'].includes(sub.status)) {
          await revokeLicense(email)
        }
        break
      }

      // ── Subscription fully cancelled ──
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object as Stripe.Subscription
        const email = await getEmailForCustomer(String(sub.customer))
        if (email) await revokeLicense(email)
        break
      }

      default:
        // Unhandled event type — acknowledge receipt and move on
        console.log(`[webhook] unhandled event type: ${stripeEvent.type}`)
    }
  } catch (err: any) {
    console.error('[webhook] error processing event:', err)
    // Return 500 so Stripe retries the event
    return { statusCode: 500, body: 'Internal error — Stripe will retry' }
  }

  // Always return 200 for handled events so Stripe doesn't keep retrying
  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}
