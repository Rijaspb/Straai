import { Router } from 'express'
import Stripe from 'stripe'
import { prisma } from '../lib/prisma'
import { authenticate, AuthenticatedRequest } from '../middleware/auth'
import { buffer } from 'stream/consumers'

const router = Router()

const stripeSecretKey = process.env.STRIPE_SECRET_KEY as string
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string
const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000'
const defaultPriceId = process.env.STRIPE_PRICE_ID

if (!stripeSecretKey) {
  console.warn('⚠️  STRIPE_SECRET_KEY not set; billing routes will not function.')
}

const stripe = new Stripe(stripeSecretKey || 'sk_test_', {
  apiVersion: '2023-10-16',
})

// POST /api/billing/create-customer-and-subscription
// Creates a Customer and a trialing Subscription without payment method
router.post('/create-customer-and-subscription', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { priceId } = req.body as { priceId?: string }
    const effectivePriceId = priceId || defaultPriceId
    if (!effectivePriceId) return res.status(400).json({ error: 'Missing priceId and STRIPE_PRICE_ID not set' })

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) return res.status(404).json({ error: 'User not found' })

    // Ensure we have or create a Stripe Customer for this user
    let subscriptionRecord = await prisma.subscription.findFirst({ 
      where: { userId: user.id, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    })

    let customerId = subscriptionRecord?.stripeCustomerId || user.stripeCustomerId || undefined
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      })
      customerId = customer.id
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } })
    }
    
    // Check if there's an existing subscription with this customerId that we need to handle
    const existingSubWithCustomer = await prisma.subscription.findFirst({
      where: { stripeCustomerId: customerId }
    })
    
    // If there's an existing subscription with this customerId that's not the current one, it might be deleted
    if (existingSubWithCustomer && existingSubWithCustomer.id !== subscriptionRecord?.id) {
      // Use the existing subscription record instead of creating a new one
      subscriptionRecord = existingSubWithCustomer
    }

    // Create trialing subscription without payment method
    // Prevent duplicate submissions from frontend retries
    if ((req as any).__subInFlight) {
      return res.status(429).json({ error: 'Subscription request in progress' })
    }
    ;(req as any).__subInFlight = true
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: effectivePriceId }],
      trial_period_days: 14,
      payment_behavior: 'default_incomplete',
      collection_method: 'charge_automatically',
      expand: ['latest_invoice.payment_intent'],
    })

    const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000)

    if (subscriptionRecord) {
      subscriptionRecord = await prisma.subscription.update({
        where: { id: subscriptionRecord.id },
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          trialEndsAt: trialEndsAt ?? undefined,
          currentPeriodEnd,
        },
      })
    } else {
      subscriptionRecord = await prisma.subscription.create({
        data: {
          userId: user.id,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          trialEndsAt: trialEndsAt ?? undefined,
          currentPeriodEnd,
        },
      })
    }

    // Mark user in trial if applicable
    if (subscription.status === 'trialing') {
      await prisma.user.update({ where: { id: user.id }, data: { inTrial: true } })
    }

    return res.json({
      subscriptionId: subscription.id,
      clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret ?? null,
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      status: subscription.status,
    })
  } catch (error: any) {
    console.error('Create customer/subscription error:', error)
    return res.status(500).json({ error: error.message || 'Failed to create subscription' })
  } finally {
    ;(req as any).__subInFlight = false
  }
})

// POST /api/billing/start-trial - convenience endpoint using STRIPE_PRICE_ID  
router.post('/start-trial', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const effectivePriceId = defaultPriceId
    if (!effectivePriceId) return res.status(400).json({ error: 'STRIPE_PRICE_ID not set' })

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) return res.status(404).json({ error: 'User not found' })

    // Ensure we have or create a Stripe Customer for this user
    let subscriptionRecord = await prisma.subscription.findFirst({ 
      where: { userId: user.id, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    })

    let customerId = subscriptionRecord?.stripeCustomerId || user.stripeCustomerId || undefined
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      })
      customerId = customer.id
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } })
    }
    
    // Check if there's an existing subscription with this customerId that we need to handle
    const existingSubWithCustomer = await prisma.subscription.findFirst({
      where: { stripeCustomerId: customerId }
    })
    
    // If there's an existing subscription with this customerId that's not the current one, it might be deleted
    if (existingSubWithCustomer && existingSubWithCustomer.id !== subscriptionRecord?.id) {
      // Use the existing subscription record instead of creating a new one
      subscriptionRecord = existingSubWithCustomer
    }

    // Create trialing subscription without payment method
    // Prevent duplicate submissions from frontend retries
    if ((req as any).__subInFlight) {
      return res.status(429).json({ error: 'Subscription request in progress' })
    }
    ;(req as any).__subInFlight = true
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: effectivePriceId }],
      trial_period_days: 14,
      payment_behavior: 'default_incomplete',
      collection_method: 'charge_automatically',
      expand: ['latest_invoice.payment_intent'],
    })

    const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000)

    if (subscriptionRecord) {
      subscriptionRecord = await prisma.subscription.update({
        where: { id: subscriptionRecord.id },
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          trialEndsAt: trialEndsAt ?? undefined,
          currentPeriodEnd,
        },
      })
    } else {
      subscriptionRecord = await prisma.subscription.create({
        data: {
          userId: user.id,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          trialEndsAt: trialEndsAt ?? undefined,
          currentPeriodEnd,
        },
      })
    }

    // Mark user in trial if applicable
    if (subscription.status === 'trialing') {
      await prisma.user.update({ where: { id: user.id }, data: { inTrial: true } })
    }

    return res.json({
      subscriptionId: subscription.id,
      clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret ?? null,
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      status: subscription.status,
    })
  } catch (error: any) {
    console.error('Start trial error:', error)
    return res.status(500).json({ error: error.message || 'Failed to start trial' })
  } finally {
    ;(req as any).__subInFlight = false
  }
})

// GET /api/billing/portal - create a Billing Portal session
router.get('/portal', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const sub = await prisma.subscription.findFirst({ where: { userId: req.user!.id, deletedAt: null } })
    if (!sub?.stripeCustomerId) return res.status(400).json({ error: 'No Stripe customer found' })

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${clientUrl}/dashboard`,
    })
    return res.json({ url: session.url })
  } catch (error: any) {
    console.error('Create portal session error:', error)
    return res.status(500).json({ error: error.message || 'Failed to create portal session' })
  }
})

// POST /api/billing/cancel - Cancel subscription at period end
router.post('/cancel', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const sub = await prisma.subscription.findFirst({ where: { userId: req.user!.id, deletedAt: null } })
    if (!sub?.stripeSubscriptionId) return res.status(400).json({ error: 'No active subscription' })

    const stripeSub = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: stripeSub.status, currentPeriodEnd: new Date(stripeSub.current_period_end * 1000) },
    })

    return res.json({ status: stripeSub.status, cancelAt: stripeSub.cancel_at ? new Date(stripeSub.cancel_at * 1000) : null })
  } catch (error: any) {
    console.error('Cancel subscription error:', error)
    return res.status(500).json({ error: error.message || 'Failed to cancel subscription' })
  }
})

// POST /api/billing/cancel-now - Cancel immediately
router.post('/cancel-now', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const sub = await prisma.subscription.findFirst({ where: { userId: req.user!.id, deletedAt: null } })
    if (!sub?.stripeSubscriptionId) return res.status(400).json({ error: 'No active subscription' })

    const stripeSub = await stripe.subscriptions.cancel(sub.stripeSubscriptionId)
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'canceled', deletedAt: new Date(), currentPeriodEnd: new Date(stripeSub.current_period_end * 1000) } })
    await prisma.user.update({ where: { id: req.user!.id }, data: { inTrial: false } })
    return res.json({ status: 'canceled' })
  } catch (error: any) {
    console.error('Immediate cancel error:', error)
    return res.status(500).json({ error: error.message || 'Failed to cancel subscription immediately' })
  }
})

// POST /api/billing/webhook - Stripe webhooks (raw body)
router.post('/webhook', async (req, res): Promise<void> => {
  try {
    const rawBody = await buffer(req)
    const signature = req.headers['stripe-signature'] as string
    let event: Stripe.Event

    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } else {
      event = JSON.parse(rawBody.toString())
    }

    switch (event.type) {
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000)

        await prisma.subscription.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
            trialEndsAt: trialEndsAt ?? undefined,
            currentPeriodEnd,
          },
        })
        await prisma.user.updateMany({ where: { stripeCustomerId: customerId }, data: { inTrial: subscription.status === 'trialing' } })
        break
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        if (invoice.subscription) {
          const subId = invoice.subscription as string
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subId },
            data: { status: 'active', currentPeriodEnd: new Date((invoice.lines.data[0]?.period?.end || invoice.period_end) * 1000) },
          })
          // Trial over once a payment succeeds
          const subRow = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subId } })
          if (subRow) await prisma.user.update({ where: { id: subRow.userId }, data: { inTrial: false } })
        } else {
          await prisma.subscription.updateMany({
            where: { stripeCustomerId: customerId },
            data: { status: 'active' },
          })
          await prisma.user.updateMany({ where: { stripeCustomerId: customerId }, data: { inTrial: false } })
        }
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        if (invoice.subscription) {
          const subId = invoice.subscription as string
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subId },
            data: { status: 'past_due' },
          })
          const subRow = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subId } })
          if (subRow) await prisma.user.update({ where: { id: subRow.userId }, data: { inTrial: false } })
        }
        break
      }
      case 'invoice.upcoming':
      case 'customer.subscription.trial_will_end': {
        const obj = event.data.object as any
        const customerId = (obj.customer || obj.customer_id) as string
        // TODO: send email to user to add payment method
        // We rely on Resend if configured; swallow errors
        try {
          const customerSub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId, deletedAt: null }, include: { user: true } })
          if (customerSub?.user?.email && process.env.RESEND_API_KEY) {
            const { Resend } = await import('resend')
            const resend = new Resend(process.env.RESEND_API_KEY)
            await resend.emails.send({
              from: 'Straai <billing@straai.app>',
              to: customerSub.user.email,
              subject: 'Your trial is ending soon - add a payment method',
              html: `<p>Your trial ends soon. Please add a payment method to continue access.</p><p><a href="${clientUrl}/dashboard/billing">Manage billing</a></p>`,
            })
          }
        } catch (e) {
          console.warn('Failed to send trial ending email:', e)
        }
        break
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000)
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: subscription.status, trialEndsAt: trialEndsAt ?? undefined, currentPeriodEnd },
        })
        const subRow = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subscription.id } })
        if (subRow) await prisma.user.update({ where: { id: subRow.userId }, data: { inTrial: subscription.status === 'trialing' } })
        break
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: 'canceled', deletedAt: new Date() },
        })
        const subRow = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subscription.id } })
        if (subRow) await prisma.user.update({ where: { id: subRow.userId }, data: { inTrial: false } })
        break
      }
      default:
        break
    }

    res.json({ received: true })
    return
  } catch (error: any) {
    console.error('Stripe webhook error:', error)
    res.status(400).json({ error: `Webhook Error: ${error.message}` })
    return
  }
})

export { router as billingRoutes }


