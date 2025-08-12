import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { supabaseAdmin } from '../lib/supabase'
import { authenticate, AuthenticatedRequest, optionalAuth } from '../middleware/auth'

const router = Router()

// POST /api/auth/webhook - Handle Supabase auth webhooks
router.post('/webhook', async (req, res) => {
  try {
    const { type, record } = req.body

    if (type === 'INSERT') {
      // User signed up
      const { id, email, email_confirmed_at } = record
      
      // Create user in our database
      await prisma.user.upsert({
        where: { supabaseId: id },
        update: {
          email: email || '',
          emailVerified: email_confirmed_at ? true : false,
        },
        create: {
          supabaseId: id,
          email: email || '',
          emailVerified: email_confirmed_at ? true : false,
        }
      })

      // Optionally: mark user inTrial upon signup (will be set precisely when Stripe sub is created)
      await prisma.user.updateMany({ where: { supabaseId: id }, data: { inTrial: true } })

      // Ensure a Stripe Customer exists for this user
      try {
        if (process.env.STRIPE_SECRET_KEY) {
          const { default: Stripe } = await import('stripe')
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2023-10-16' })
          const dbUser = await prisma.user.findUnique({ where: { supabaseId: id } })
          if (dbUser && !dbUser.stripeCustomerId) {
            const customer = await stripe.customers.create({ email: dbUser.email, metadata: { userId: dbUser.id } })
            await prisma.user.update({ where: { id: dbUser.id }, data: { stripeCustomerId: customer.id } })
          }
        }
      } catch (stripeErr) {
        console.warn('Stripe customer creation on signup failed:', stripeErr)
      }
    } else if (type === 'UPDATE') {
      // User updated (e.g., email verified)
      const { id, email, email_confirmed_at } = record
      
      await prisma.user.updateMany({
        where: { supabaseId: id },
        data: {
          email: email || undefined,
          emailVerified: email_confirmed_at ? true : false,
        }
      })
    }

    return res.json({ success: true })
  } catch (error) {
    console.error('Auth webhook error:', error)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// GET /api/auth/me - Get current authenticated user
router.get('/me', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        timezone: true,
        companyName: true,
        createdAt: true,
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json({ user })
  } catch (error) {
    console.error('Get user error:', error)
    return res.status(500).json({ error: 'Failed to get user' })
  }
})

// POST /api/auth/verify-token - Verify if token is valid
router.post('/verify-token', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    return res.json({ 
      valid: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        supabaseId: req.user.supabaseId,
      }
    })
  } catch (error) {
    console.error('Verify token error:', error)
    return res.status(500).json({ error: 'Token verification failed' })
  }
})

// POST /api/auth/resend-verification
router.post('/resend-verification', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    // Use Supabase Admin to resend verification email
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
    })

    if (error) {
      console.error('Resend verification error:', error)
      return res.status(400).json({ error: error.message })
    }

    return res.json({ message: 'Verification email sent' })
  } catch (error) {
    console.error('Resend verification error:', error)
    return res.status(500).json({ error: 'Failed to resend verification email' })
  }
})

export { router as authRoutes }
