import cron from 'node-cron'
import { prisma } from '../lib/prisma'
import { DateTime } from 'luxon'
import { AnalyticsEngine } from '../services/AnalyticsEngine'
import { withAdvisoryLock } from '../lib/schedulerLock'

export class DailyQuickWinsScheduler {
  private analytics: AnalyticsEngine

  constructor() {
    this.analytics = new AnalyticsEngine(prisma)
  }

  start(): void {
    // Run daily at 06:00 UTC
    cron.schedule('0 6 * * *', async () => {
      try {
        const ran = await withAdvisoryLock('daily_quick_wins_tick', async () => {
          if (process.env.ENABLE_QUICK_WINS !== 'true') {
            console.log('⏭️  Daily quick wins generation disabled (set ENABLE_QUICK_WINS=true to enable)')
            return
          }
          console.log('🔄 Starting daily quick wins generation...')
        
        // Process users in batches to avoid memory issues
        const batchSize = Number(process.env.QUICK_WINS_BATCH || 10)
        let offset = 0
        const to = DateTime.utc()
        const from = to.minus({ days: 30 })
        const timeRange = { from: from.toISO()!, to: to.toISO()! }
        const date = to.startOf('day').toJSDate()

        while (true) {
          const users = await prisma.user.findMany({
            where: { deletedAt: null },
            select: { id: true, email: true, stores: { select: { id: true } } },
            skip: offset,
            take: batchSize,
          })
          
          if (users.length === 0) break
          
          console.log(`📊 Processing batch ${Math.floor(offset / batchSize) + 1} (${users.length} users)`)

          for (const user of users) {
          const storeIds = user.stores.length ? user.stores.map(s => s.id) : [null]
          for (const storeId of storeIds) {
            try {
              const payload = await this.analytics.buildNormalizedPayload(user.id, storeId, timeRange)

              // Top 3 products by email revenue (or revenue growth if available)
              const emailProducts = payload.productSalesByChannel
                .filter(p => p.channel === 'email')
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 3)
                .map(p => ({ sku: p.sku, title: p.title, revenue: p.revenue }))

              // Most profitable flow by revenue per send
              const bestFlow = [...payload.flows]
                .map(f => ({ ...f, rps: f.sends && f.sends > 0 ? (f.revenue || 0) / f.sends : 0 }))
                .sort((a, b) => (b.rps || 0) - (a.rps || 0))[0]

              // Upsert quick wins for this user/store/date
               await prisma.quickWin.deleteMany({ where: { userId: user.id, storeId: storeId || undefined, date } })
               await prisma.quickWin.create({
                data: {
                  userId: user.id,
                  storeId: storeId || undefined,
                  date,
                  type: 'top_products',
                  title: 'Top products to promote this week',
                  details: { items: emailProducts },
                },
              })
              if (bestFlow) {
                 await prisma.quickWin.create({
                  data: {
                    userId: user.id,
                    storeId: storeId || undefined,
                    date,
                    type: 'top_flow',
                    title: 'Most profitable email flow',
                    details: { id: bestFlow.id, name: bestFlow.name, revenuePerSend: bestFlow.rps },
                  },
                })
              }
            } catch (e) {
              console.error('Daily quick wins failed for user', user.email, 'store', storeId, e)
            }
          }
        }
        
        offset += batchSize
        
        // Small delay between batches to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      console.log('✅ Daily quick wins generation completed')
      })
      if (!ran) {
        console.log('⏭️  Skipping daily quick wins, another instance holds the lock')
      }
      } catch (e) {
        console.error('DailyQuickWinsScheduler tick error:', e)
      }
    })

    console.log('✅ Daily quick wins scheduler started')
  }
}


