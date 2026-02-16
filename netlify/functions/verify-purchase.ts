// netlify/functions/verify-purchase.ts
// Verifies whether an email has an active Stripe subscription or completed one-time payment.
//
// ENV VARS REQUIRED (set in Netlify dashboard → Site settings → Environment variables):
//   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
//   STRIPE_LIFETIME_PRICE_ID   — price_... for the lifetime product
//   STRIPE_MONTHLY_PRICE_ID    — price_... for the monthly subscription

import Stripe from 'stripe'
import type { Handler } from '@netlify/functions'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

const LIFETIME_PRICE = process.env.STRIPE_LIFETIME_PRICE_ID || 'price_1T1VsvPW55YHq7QNqO3E9Rav'
const MONTHLY_PRICE = process.env.STRIPE_MONTHLY_PRICE_ID || 'price_1T1VpdPW55YHq7QNt5DNxBXr'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

export const handler: Handler = async (event) => {
  // Handle CORS preflight
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

    // 1) Check for active subscriptions (monthly plan)
    const subscriptions = await stripe.subscriptions.list({
      limit: 10,
      status: 'active',
    })

    for (const sub of subscriptions.data) {
      const customer =
        typeof sub.customer === 'string'
          ? await stripe.customers.retrieve(sub.customer)
          : sub.customer

      if (
        customer &&
        !customer.deleted &&
        (customer as Stripe.Customer).email?.toLowerCase() === normalizedEmail
      ) {
        const hasMonthlyPrice = sub.items.data.some(
          (item) => item.price.id === MONTHLY_PRICE
        )
        if (hasMonthlyPrice) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ valid: true, plan: 'monthly' }),
          }
        }
      }
    }

    // 2) Check for completed checkout sessions (lifetime one-time purchase)
    //    Search recent completed sessions by customer email
    const sessions = await stripe.checkout.sessions.list({
      limit: 50,
      status: 'complete',
      customer_details: { email: normalizedEmail } as any,
    })

    // If the list filter doesn't work (depends on API version), fall back to manual filter
    const matchingSessions = sessions.data.filter(
      (s) => s.customer_details?.email?.toLowerCase() === normalizedEmail
    )

    for (const session of matchingSessions) {
      // Check line items for the lifetime price
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 })
      const hasLifetime = lineItems.data.some((item) => item.price?.id === LIFETIME_PRICE)

      if (hasLifetime) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ valid: true, plan: 'lifetime' }),
        }
      }

      // Also check for monthly in checkout (in case they bought via payment link)
      const hasMonthly = lineItems.data.some((item) => item.price?.id === MONTHLY_PRICE)
      if (hasMonthly) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ valid: true, plan: 'monthly' }),
        }
      }
    }

    // 3) Also check by searching for the customer directly and their payment intents
    const customers = await stripe.customers.list({
      email: normalizedEmail,
      limit: 1,
    })

    if (customers.data.length > 0) {
      const customer = customers.data[0]

      // Check their active subscriptions
      const customerSubs = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 10,
      })

      for (const sub of customerSubs.data) {
        const hasMonthlyPrice = sub.items.data.some((item) => item.price.id === MONTHLY_PRICE)
        const hasLifetimePrice = sub.items.data.some((item) => item.price.id === LIFETIME_PRICE)
        if (hasMonthlyPrice) {
          return { statusCode: 200, headers, body: JSON.stringify({ valid: true, plan: 'monthly' }) }
        }
        if (hasLifetimePrice) {
          return { statusCode: 200, headers, body: JSON.stringify({ valid: true, plan: 'lifetime' }) }
        }
      }

      // Check successful one-time payments
      const paymentIntents = await stripe.paymentIntents.list({
        customer: customer.id,
        limit: 20,
      })

      for (const pi of paymentIntents.data) {
        if (pi.status === 'succeeded' && pi.metadata?.plan === 'lifetime') {
          return { statusCode: 200, headers, body: JSON.stringify({ valid: true, plan: 'lifetime' }) }
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
