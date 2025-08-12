import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import './env'
import { apiRoutes } from './routes'
import { errorHandler, notFound } from './middleware/errorHandler'
import { WeeklyReportScheduler } from './scheduler/WeeklyReportScheduler'
import { InstantInsightsScheduler } from './scheduler/InstantInsightsScheduler'
import { DailyQuickWinsScheduler } from './scheduler/DailyQuickWinsScheduler'
import { startMemoryMonitoring, scheduleMemoryCleanup } from './lib/memoryMonitor'
import { prisma } from './lib/prisma'

// Prevent duplicate schedulers in dev with hot-reload
const globalForSchedulers = global as unknown as {
  __schedulersStarted?: boolean
  __server?: any
}


// Start memory monitoring in dev
if (process.env.NODE_ENV !== 'production') {
  startMemoryMonitoring()
  scheduleMemoryCleanup()
}

const app = express()
const PORT = process.env.PORT || 8000

// Middleware
app.use(helmet())
app.use(cors())
app.use(morgan('combined'))
app.use(compression())
// Stripe webhooks require raw body; mount JSON for other routes below
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/billing/webhook')) {
    return next()
  }
  express.json({ limit: '1mb' })(req, res, (err) => {
    if (err) return next(err)
    express.urlencoded({ extended: true, limit: '1mb' })(req, res, next)
  })
})

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Optional: per-request memory delta logging for leak hunting
if (process.env.REQ_MEM_DEBUG === 'true') {
  app.use((req, res, next) => {
    const startHeap = process.memoryUsage().heapUsed
    const startTime = process.hrtime.bigint()
    res.on('finish', () => {
      const endHeap = process.memoryUsage().heapUsed
      const delta = endHeap - startHeap
      const ms = Number(process.hrtime.bigint() - startTime) / 1e6
      if (Math.abs(delta) > 5 * 1024 * 1024) {
        const sign = delta >= 0 ? '+' : '-'
        console.log(`🧠 ${req.method} ${req.originalUrl} heapΔ=${sign}${(Math.abs(delta) / (1024 * 1024)).toFixed(2)}MB time=${ms.toFixed(1)}ms status=${res.statusCode}`)
      }
    })
    next()
  })
}

// API routes (can be disabled for diagnostics)
const apiEnabled = process.env.API_ENABLED !== 'false'
if (apiEnabled) {
  app.use('/api', apiRoutes)
} else {
  console.log('⏭️  API routes disabled (set API_ENABLED=true to enable)')
}

// Error handling
app.use(notFound)
app.use(errorHandler)

// Close previous server instance in dev
if (globalForSchedulers.__server && process.env.NODE_ENV !== 'production') {
  globalForSchedulers.__server.close()
}

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  const enableSchedulers = process.env.ENABLE_SCHEDULERS === 'true' || process.env.NODE_ENV === 'production'
  if (!globalForSchedulers.__schedulersStarted && enableSchedulers) {
    globalForSchedulers.__schedulersStarted = true
    // Start weekly report scheduler
    try {
      new WeeklyReportScheduler().start()
    } catch (e) {
      console.warn('Failed to start WeeklyReportScheduler:', e)
    }
    // Start instant insights scheduler
    try {
      new InstantInsightsScheduler().start()
    } catch (e) {
      console.warn('Failed to start InstantInsightsScheduler:', e)
    }
    // Start daily quick wins scheduler
    try {
      new DailyQuickWinsScheduler().start()
    } catch (e) {
      console.warn('Failed to start DailyQuickWinsScheduler:', e)
    }
  } else if (!enableSchedulers) {
    console.log('⏭️  Schedulers disabled (set ENABLE_SCHEDULERS=true to enable)')
  } else {
    console.log('⏭️  Schedulers already started; skipping re-init')
  }
})

// Store server instance for cleanup
if (process.env.NODE_ENV !== 'production') {
  globalForSchedulers.__server = server
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down gracefully...`)
  server.close(() => {
    console.log('HTTP server closed')
  })
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
