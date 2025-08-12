/*
  Lightweight Stripe webhook handler.
  - Uses express.raw() only for this route
  - Verifies Stripe signature with STRIPE_WEBHOOK_SECRET
  - Logs event type and handles checkout.session.completed
  - Responds 200 quickly to Stripe
*/

const express = require('express')
const Stripe = require('stripe')
const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

// Load env from common locations
dotenv.config({ path: path.resolve(__dirname, '.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || ''
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''

if (!stripeSecretKey) {
  console.warn('⚠️  STRIPE_SECRET_KEY missing - webhook will not verify without it')
}
if (!webhookSecret) {
  console.warn('⚠️  STRIPE_WEBHOOK_SECRET missing - webhook signature verification will fail')
}

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' })

// Supabase admin client (service role)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

if (!supabase) {
  console.warn('⚠️  Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). Payment marking will be skipped.')
}

const app = express()

// Use express.raw ONLY for this route. Do not add express.json globally here.
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['stripe-signature']
  let event

  try {
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET not set')
    }
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret)
  } catch (err) {
    console.error('❌ Stripe webhook signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  // Log type and respond quickly to Stripe
  console.log(`✅ Stripe event: ${event.type}`)
  res.status(200).end()

  // Handle asynchronously after acknowledging to Stripe
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    ;(async () => {
      try {
        if (!supabase) return

        // Prefer marking the user if provided via metadata
        const userId = session?.metadata?.userId || session?.metadata?.user_id
        if (userId) {
          // Example: flag a column on users
          const { error: userErr } = await supabase
            .from('users')
            .update({ has_paid: true })
            .eq('id', userId)
          if (userErr) console.warn('Supabase user update failed:', userErr.message)
        }

        // Also record a payment row if a 'payments' table exists
        const paymentRecord = {
          stripe_session_id: session.id,
          stripe_customer_id: session.customer || null,
          email: session.customer_details?.email || null,
          amount_total: session.amount_total ?? null,
          currency: session.currency || null,
          status: 'paid',
        }
        const { error: payErr } = await supabase.from('payments').insert(paymentRecord)
        if (payErr) console.warn('Supabase payments insert failed (table may not exist):', payErr.message)
      } catch (e) {
        console.error('Webhook post-ack processing failed:', e)
      }
    })()
  }
})

// Export app for integration with an existing server, or run standalone
if (require.main === module) {
  const PORT = process.env.WEBHOOK_PORT || 8080
  app.listen(PORT, () => console.log(`Stripe webhook listener on :${PORT}`))
}

module.exports = app


