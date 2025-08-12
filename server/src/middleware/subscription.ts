import { NextFunction, Response } from 'express'
import { AuthenticatedRequest } from './auth'
import { prisma } from '../lib/prisma'

export const requireActiveSubscription = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const sub = await prisma.subscription.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })

    const now = new Date()
    const isActive = sub?.status === 'active'
    const isTrialing = sub?.status === 'trialing' && (!!sub.trialEndsAt ? sub.trialEndsAt > now : true)

    if (isActive || isTrialing) {
      return next()
    }

    return res.status(402).json({ error: 'Subscription required', status: sub?.status || 'none' })
  } catch (error) {
    console.error('Subscription guard error:', error)
    return res.status(500).json({ error: 'Failed to verify subscription' })
  }
}










