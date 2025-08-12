import { Router } from 'express'
import { prisma } from '../lib/prisma'
import fs from 'fs'
import path from 'path'
import { authenticate, AuthenticatedRequest } from '../middleware/auth'

const router = Router()

// GET /api/reports - list user's reports
router.get('/', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const reports = await prisma.report.findMany({
      where: { userId: req.user!.id, deletedAt: null },
      orderBy: { generatedAt: 'desc' },
      select: {
        id: true,
        weekOf: true,
        generatedAt: true,
        pdfPath: true,
        summary: true,
        store: { select: { id: true, shopifyShopDomain: true } },
      },
    })
    res.json({ reports })
  } catch (e) {
    console.error('List reports failed:', e)
    res.status(500).json({ error: 'Failed to list reports' })
  }
})

// GET /api/reports/:id/download - stream PDF
router.get('/:id/download', authenticate, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } })
    if (!report || report.userId !== req.user!.id) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (!report.pdfPath) {
      res.status(404).json({ error: 'PDF not available' })
      return
    }

    const resolved = path.resolve(report.pdfPath)
    if (!fs.existsSync(resolved)) {
      res.status(404).json({ error: 'File missing' })
      return
    }
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(resolved)}"`)
    fs.createReadStream(resolved).pipe(res)
    return
  } catch (e) {
    console.error('Download report failed:', e)
    res.status(500).json({ error: 'Failed to download report' })
    return
  }
})

export { router as reportsRoutes }


