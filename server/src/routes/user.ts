import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthenticatedRequest } from '../middleware/auth'

const router = Router()

// Simple in-memory cache for profile responses per user to reduce DB load during bursts
const PROFILE_TTL_MS = 15_000
const MAX_PROFILE_CACHE_SIZE = 50
const profileCache = new Map<string, { data: any; ts: number }>()

// Clean up old profile cache entries periodically
setInterval(() => {
  const now = Date.now()
  
  // Clean expired entries
  for (const [key, value] of profileCache.entries()) {
    if (now - value.ts > PROFILE_TTL_MS) {
      profileCache.delete(key)
    }
  }
  
  // Limit cache size to prevent memory leaks
  if (profileCache.size > MAX_PROFILE_CACHE_SIZE) {
    const entries = Array.from(profileCache.entries())
    entries.sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < entries.length - MAX_PROFILE_CACHE_SIZE; i++) {
      profileCache.delete(entries[i][0])
    }
  }
}, 30000) // Clean every 30 seconds

// GET /api/user/profile - Get current user profile
router.get('/profile', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const cacheKey = req.user!.id
    const now = Date.now()
    const cached = profileCache.get(cacheKey)
    if (cached && now - cached.ts < PROFILE_TTL_MS) {
      res.set('Cache-Control', 'private, max-age=5')
      return res.json({ user: cached.data })
    }
    // Use a more efficient query with only necessary fields
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        timezone: true,
        country: true,
        companyName: true,
        inTrial: true,
        businessContext: true,
        createdAt: true,
        // Only fetch subscription status, not full subscription objects
        subscriptions: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
          },
          take: 1, // Only need the most recent subscription
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Transform the data to match frontend expectations
    const transformedUser = {
      ...user,
      // Ensure subscriptions is always an array
      subscriptions: user.subscriptions || []
    }

    profileCache.set(cacheKey, { data: transformedUser, ts: Date.now() })
    res.set('Cache-Control', 'private, max-age=5')
    return res.json({ user: transformedUser })
  } catch (error) {
    console.error('Get profile error:', error)
    return res.status(500).json({ error: 'Failed to get user profile' })
  }
})

// POST /api/user/export - Create a data export request
router.post('/export', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const request = await prisma.dataExportRequest.create({
      data: {
        userId: req.user!.id,
        status: 'pending',
      },
      select: { id: true, status: true, createdAt: true },
    })
    // In a real system, enqueue a background job here
    return res.json({ success: true, request })
  } catch (error) {
    console.error('Create data export request error:', error)
    return res.status(500).json({ error: 'Failed to create data export request' })
  }
})

// PUT /api/user/profile - Update user profile
router.put('/profile', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { timezone, country, companyName, businessContext } = req.body as { timezone?: string; country?: string | null; companyName?: string; businessContext?: string | null }

    // Build update object allowing explicit clearing of companyName
    const data: any = {}
    if (typeof timezone !== 'undefined') {
      data.timezone = timezone
    }
    if (typeof companyName !== 'undefined') {
      data.companyName = companyName === '' ? null : companyName
    }
    if (typeof country !== 'undefined') {
      data.country = country === '' ? null : country
    }
    if (typeof businessContext !== 'undefined') {
      data.businessContext = businessContext === '' ? null : businessContext
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: {
        id: true,
        email: true,
        emailVerified: true,
        timezone: true,
        country: true,
        companyName: true,
        createdAt: true,
      }
    })

    return res.json({ user })
  } catch (error) {
    console.error('Update profile error:', error)
    return res.status(500).json({ error: 'Failed to update user profile' })
  }
})

// POST /api/user/sync - Sync user data from Supabase
router.post('/sync', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    // This endpoint can be called after authentication to ensure 
    // the user data is properly synced between Supabase and our database
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        timezone: true,
        companyName: true,
        supabaseId: true,
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json({ 
      message: 'User synced successfully',
      user 
    })
  } catch (error) {
    console.error('Sync user error:', error)
    return res.status(500).json({ error: 'Failed to sync user' })
  }
})

// DELETE /api/user/account - Delete user account (soft delete)
router.delete('/account', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { deletedAt: new Date() }
    })

    return res.json({ message: 'Account deleted successfully' })
  } catch (error) {
    console.error('Delete account error:', error)
    return res.status(500).json({ error: 'Failed to delete account' })
  }
})

export { router as userRoutes }
