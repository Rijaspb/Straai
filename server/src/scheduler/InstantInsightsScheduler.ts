import cron from 'node-cron'
import { prisma } from '../lib/prisma'
import fs from 'fs/promises'
import { InstantInsightsService } from '../services/InstantInsightsService'
import { withAdvisoryLock } from '../lib/schedulerLock'

export class InstantInsightsScheduler {
  private service: InstantInsightsService

  constructor() {
    this.service = new InstantInsightsService(prisma)
  }

  start(): void {
    // Run every 10 minutes; find users who completed both Shopify and Klaviyo within last 20 minutes
    cron.schedule('*/10 * * * *', async () => {
      try {
        const ran = await withAdvisoryLock('instant_insights_tick', async () => {
          if (process.env.ENABLE_INSTANT_INSIGHTS !== 'true') {
            console.log('⏭️  Instant insights generation disabled (set ENABLE_INSTANT_INSIGHTS=true to enable)')
            return
          }
        const since = new Date(Date.now() - 20 * 60 * 1000)
        // Only fetch users who have been updated recently to avoid memory issues
          const batchSize = Number(process.env.INSTANT_USERS_BATCH || 100)
          const users = await prisma.user.findMany({ 
          where: { 
            deletedAt: null,
            instantInsightsSentAt: null, // Only users who haven't received instant insights yet
            updatedAt: { gte: since } // Only recently updated users
          }, 
            select: { id: true, email: true, instantInsightsSentAt: true, updatedAt: true },
            take: batchSize,
        })

        for (const user of users) {
          const [shopifyOk, klaviyoOk, latestIntegration] = await Promise.all([
            prisma.integration.findFirst({
              where: {
                userId: user.id,
                provider: 'shopify',
                status: 'connected',
                deletedAt: null,
              },
              select: { id: true },
            }),
            prisma.integration.findFirst({
              where: {
                userId: user.id,
                provider: 'klaviyo',
                status: 'connected',
                deletedAt: null,
              },
              select: { id: true },
            }),
            prisma.integration.findFirst({
              where: { userId: user.id, status: 'connected', deletedAt: null },
              orderBy: { updatedAt: 'desc' },
              select: { updatedAt: true },
            })
          ])

          if (!shopifyOk || !klaviyoOk) continue
          if (user.instantInsightsSentAt) continue
          if (!latestIntegration || latestIntegration.updatedAt < since) continue
          
          console.log(`📊 Generating instant insights for user ${user.email}`)

          // Idempotency check: rely on service marker
          const already = await this.service.hasRunForUser(user.id)
          if (already) continue

          try {
            const { pdfPaths } = await this.service.runForUser(user.id)
            await this.sendEmail(user.email, pdfPaths)
          } catch (e) {
            console.error('InstantInsights generation failed for user', user.id, e)
          }
        }
        })
        if (!ran) {
          console.log('⏭️  Skipping instant insights tick, another instance holds the lock')
        }
      } catch (e) {
        console.error('InstantInsightsScheduler tick error:', e)
      }
    })

    console.log('✅ Instant insights scheduler started')
  }

  private async sendEmail(to: string, pdfPaths: string[]): Promise<void> {
    if (!process.env.RESEND_API_KEY) return
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const attachments = await Promise.all(
        pdfPaths.map(async (p) => ({ filename: p.split('/').pop() || 'report.pdf', content: (await fs.readFile(p)).toString('base64') }))
      )
      const baseUrl = process.env.CLIENT_BASE_URL || 'http://localhost:5173'
      const html = `<p>Your Instant Insights report is ready.</p><p>Visit your <a href="${baseUrl}/dashboard/reports">Reports</a> to download.</p>`

      await resend.emails.send({
        from: 'Straai Reports <reports@straai.app>',
        to,
        subject: 'Your Instant Insights (30-day) report',
        html,
        attachments,
      })
    } catch (e) {
      console.warn('Failed to send instant insights email:', e)
    }
  }
}


