import cron from 'node-cron'
import { prisma } from '../lib/prisma'
import { DateTime } from 'luxon'
import { AnalyticsEngine } from '../services/AnalyticsEngine'
import { ReportService } from '../services/ReportService'
import { MetricsHelper } from '../services/MetricsHelper'
import fs from 'fs/promises'
import { withAdvisoryLock } from '../lib/schedulerLock'

export class WeeklyReportScheduler {
  private analytics: AnalyticsEngine
  private reportService: ReportService
  private metricsHelper: MetricsHelper

  constructor() {
    this.analytics = new AnalyticsEngine(prisma)
    this.reportService = new ReportService(prisma)
    this.metricsHelper = new MetricsHelper(prisma)
  }

  start(): void {
    // Run every minute, check which users have Monday 08:00 in their timezone now
    cron.schedule('* * * * *', async () => {
      try {
        const ran = await withAdvisoryLock('weekly_report_tick', async () => {
          if (process.env.ENABLE_WEEKLY_REPORTS !== 'true') {
            console.log('⏭️  Weekly reports generation disabled (set ENABLE_WEEKLY_REPORTS=true to enable)')
            return
          }

          const batchSize = Number(process.env.WEEKLY_USERS_BATCH || 100)
          let cursorId: string | null = null
          const nowUtc = DateTime.utc()

          type WeeklyUser = {
            id: string
            email: string
            timezone: string | null
            stores: Array<{ id: string; shopifyShopDomain: string | null }>
            subscriptions: Array<{ status: string }>
          }

          while (true) {
            const users: WeeklyUser[] = await prisma.user.findMany({
              where: { deletedAt: null },
              select: { id: true, email: true, timezone: true, stores: { select: { id: true, shopifyShopDomain: true } }, subscriptions: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 } },
              ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
              orderBy: { id: 'asc' },
              take: batchSize,
            })
            if (users.length === 0) break
            cursorId = users[users.length - 1].id

            for (const user of users) {
              const tz = user.timezone || 'UTC'
              const nowLocal = nowUtc.setZone(tz)
              const isMonday = nowLocal.weekday === 1
              const isEight = nowLocal.hour === 8 && nowLocal.minute === 0
              const sub = user.subscriptions?.[0]
              const status = sub?.status
              const activeOrTrial = status === 'active' || status === 'trialing'
              if (!isMonday || !isEight || !activeOrTrial) continue

              const weekOfLocal = nowLocal.startOf('week')
              const prevWeekStartLocal = weekOfLocal.minus({ weeks: 1 })
              const prevWeekEndLocal = weekOfLocal.minus({ seconds: 1 })
              const from = prevWeekStartLocal.toUTC().toISO()!
              const to = prevWeekEndLocal.toUTC().toISO()!
              const weekOfDate = prevWeekStartLocal.toJSDate()

              for (const store of user.stores) {
                const existing = await prisma.report.findUnique({
                  where: { userId_storeId_weekOf: { userId: user.id, storeId: store.id, weekOf: weekOfDate } },
                })
                if (existing?.pdfPath) continue

                try {
                  const timeRange = { from, to }
                  const payload = await this.analytics.buildNormalizedPayload(user.id, store.id, timeRange)
                  const { metrics, context } = await this.metricsHelper.computeCoreMetrics(user.id, store.id, timeRange)

                  // Optionally skip heavy PDF generation unless explicitly enabled
                  if (process.env.ENABLE_REPORT_PDF !== 'true') {
                    await this.reportService.upsertReportRecord(
                      user.id,
                      store.id,
                      weekOfDate,
                      '',
                      'Report summary generation disabled in this environment'
                    )
                    continue
                  }

                  const aiSummary = await this.callGptWithMetrics({ metrics, context })
                  const { pdfPath } = await this.reportService.generateWeeklyReportPdf({
                    userId: user.id,
                    storeId: store.id,
                    weekOf: weekOfDate,
                    payload,
                    aiSummary: {
                      executive_summary: aiSummary.executive_summary || 'Summary unavailable',
                      key_metrics: metrics.map(m => ({ name: m.name, value: m.value, explanation: m.explanation, source: m.source } as any)),
                      top_recommendations: aiSummary.top_recommendations || [],
                    },
                  })

                  await this.reportService.upsertReportRecord(
                    user.id,
                    store.id,
                    weekOfDate,
                    pdfPath,
                    aiSummary.executive_summary || undefined
                  )

                  await this.sendEmail(user.email, store.shopifyShopDomain, pdfPath)
                } catch (err) {
                  console.error('Weekly report generation failed for user', user.id, 'store', store.id, err)
                }
              }
            }
          }
        })
        if (!ran) {
          console.log('⏭️  Skipping weekly report tick, another instance holds the lock')
        }
      } catch (e) {
        console.error('WeeklyReportScheduler tick error:', e)
      }
    })

    console.log('✅ Weekly report scheduler started')
  }

  private async callGptWithMetrics(input: { metrics: Array<{ name: string; value: number | string; explanation: string; source?: string }>; context: any }): Promise<any> {
    const apiKey = process.env.OPENAI_API_KEY
    const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
    const model = process.env.OPENAI_MODEL || 'gpt-5.1'
    if (!apiKey) {
      // Fallback
      return {
        executive_summary: 'AI not configured. Narrative omitted. Showing verified metrics only.',
        key_metrics: input.metrics,
        top_recommendations: [
          'Connect all integrations and verify syncing.',
          'Enable and optimize core lifecycle flows.',
          'Run one focused campaign and measure lift.',
        ],
      }
    }

    const systemPrompt = 'You are a senior analytics consultant. Using the provided verified metrics (precomputed), write a concise, executive-level weekly summary and 3-5 clear recommendations. Do not invent numbers.'
    const content = JSON.stringify({ metrics: input.metrics, context: input.context })
    try {
      const resp = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content },
          ],
          temperature: 0.2,
        }),
      })
      const data = await resp.json()
      const text = data?.choices?.[0]?.message?.content || '{}'
      try { return JSON.parse(text) } catch { return { executive_summary: text, key_metrics: [], top_recommendations: [] } }
    } catch (e) {
      return {
        executive_summary: 'AI request failed. Narrative omitted. Showing verified metrics only.',
        key_metrics: input.metrics,
        top_recommendations: [ 'Ensure integrations are healthy.', 'Send one high-impact campaign.' ],
      }
    }
  }

  private async sendEmail(to: string, storeDomain: string | null, pdfPath: string): Promise<void> {
    if (!process.env.RESEND_API_KEY) return
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(process.env.RESEND_API_KEY)
      const file = await fs.readFile(pdfPath)
      const baseUrl = process.env.CLIENT_BASE_URL || 'http://localhost:5173'
      const html = `<p>Your weekly report is ready${storeDomain ? ` for ${storeDomain}` : ''}.</p><p>Visit your <a href="${baseUrl}/dashboard/reports">Reports</a> to download.</p>`

      // Try scheduled send at current minute + 30 seconds to align with scheduler, fallback to immediate
      const scheduledAt = new Date(Date.now() + 30_000).toISOString()
      try {
        await resend.emails.send({
          from: 'Straai Reports <reports@straai.app>',
          to,
          subject: 'Your weekly report',
          html,
          attachments: [ { filename: pdfPath.split('/').pop() || 'report.pdf', content: file.toString('base64') } ],
          // scheduling support (ignored by SDKs that do not support it)
          ...(scheduledAt ? { scheduledAt } : {}),
        } as any)
      } catch {
        await resend.emails.send({
          from: 'Straai Reports <reports@straai.app>',
          to,
          subject: 'Your weekly report',
          html,
          attachments: [ { filename: pdfPath.split('/').pop() || 'report.pdf', content: file.toString('base64') } ],
        })
      }
    } catch (e) {
      console.warn('Failed to send weekly report email:', e)
    }
  }
}


