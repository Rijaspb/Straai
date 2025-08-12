import { Router } from 'express'
import { prisma } from '../lib/prisma'

const router = Router()

// POST /api/newsletter/subscribe - Public endpoint to subscribe email
router.post('/subscribe', async (req, res) => {
  try {
    const { email, source } = req.body || {}
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' })
    }

    const userAgent = req.headers['user-agent'] || undefined
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip

    // Upsert by unique email to avoid duplicates
    const record = await prisma.newsletterSubscription.upsert({
      where: { email },
      update: {
        source: source || 'footer',
        userAgent,
        ipAddress,
      },
      create: {
        email,
        source: source || 'footer',
        userAgent,
        ipAddress,
      },
      select: { id: true, email: true, createdAt: true },
    })

    return res.json({ success: true, subscription: record })
  } catch (error) {
    console.error('Newsletter subscribe error:', error)
    return res.status(500).json({ error: 'Failed to subscribe' })
  }
})

export { router as newsletterRoutes }


