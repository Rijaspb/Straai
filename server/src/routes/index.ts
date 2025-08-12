import { Router } from 'express'
import { analyticsRoutes } from './analytics'
import { aiRoutes } from './ai'
import { billingRoutes } from './stripe'
import { authRoutes } from './auth'
import { userRoutes } from './user'
import { integrationsRoutes } from './integrations'
import { reportsRoutes } from './reports'
import { newsletterRoutes } from './newsletter'
import { quickWinsRoutes } from './quickWins'

const router = Router()

router.use('/analytics', analyticsRoutes)
router.use('/ai', aiRoutes)
router.use('/auth', authRoutes)
router.use('/user', userRoutes)
router.use('/integrations', integrationsRoutes)
router.use('/billing', billingRoutes)
router.use('/reports', reportsRoutes)
router.use('/newsletter', newsletterRoutes)
router.use('/quick-wins', quickWinsRoutes)

export { router as apiRoutes }
