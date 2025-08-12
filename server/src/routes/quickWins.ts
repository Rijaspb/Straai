import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthenticatedRequest } from '../middleware/auth'

const router = Router()

// GET /api/quick-wins - latest quick wins for the current user (today or most recent)
router.get('/', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id
    const latest = await prisma.quickWin.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 10,
    })
    // group by date, prefer most recent date
    const mostRecentDate = latest[0]?.date
    const todays = mostRecentDate
      ? latest.filter((w) => new Date(w.date).toDateString() === new Date(mostRecentDate).toDateString())
      : []
    return res.json({ quickWins: todays })
  } catch (e) {
    console.error('List quick wins failed:', e)
    return res.status(500).json({ error: 'Failed to list quick wins' })
  }
})

export { router as quickWinsRoutes }


