// Removed unused imports to prevent unnecessary bundling
import { DateTime } from 'luxon'
import { PrismaClient } from '@prisma/client'
import { AnalyticsEngine } from './AnalyticsEngine'
import { ReportService } from './ReportService'
import { MetricsHelper } from './MetricsHelper'

export class InstantInsightsService {
  private prisma: PrismaClient
  private analytics: AnalyticsEngine
  private reportService: ReportService
  private metricsHelper: MetricsHelper

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
    this.analytics = new AnalyticsEngine(prisma)
    this.reportService = new ReportService(prisma)
    this.metricsHelper = new MetricsHelper(prisma)
  }

  async hasRunForUser(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { instantInsightsSentAt: true } })
    return !!user?.instantInsightsSentAt
  }

  async runForUser(userId: string): Promise<{ pdfPaths: string[] }> {
    const already = await this.hasRunForUser(userId)
    if (already) return { pdfPaths: [] }

    // Identify stores for the user; if none, operate with storeId = null
    const stores = await this.prisma.store.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, shopifyShopDomain: true },
    })

    const to = DateTime.utc()
    const from = to.minus({ days: 30 })
    const timeRange = { from: from.toISO()!, to: to.toISO()! }

    const weekOf = to.toJSDate()
    const pdfPaths: string[] = []

    const runForStore = async (storeId: string | null, storeDomain: string | null) => {
      const payload = await this.analytics.buildNormalizedPayload(userId, storeId, timeRange)
      const { metrics } = await this.metricsHelper.computeCoreMetrics(userId, storeId, timeRange)
      const aiSummary = {
        executive_summary: `Instant insights for the last 30 days${storeDomain ? ` for ${storeDomain}` : ''}.`,
        key_metrics: metrics.map(m => ({ name: m.name, value: m.value, explanation: m.explanation, source: m.source } as any)),
        top_recommendations: [
          'Enable or tune core lifecycle flows.',
          'Run one focused campaign and measure revenue per send.',
          'Feature top-performing email products in the next campaign.',
        ],
      }

      const { pdfPath } = await this.reportService.generateWeeklyReportPdf({
        userId,
        storeId,
        weekOf,
        payload,
        aiSummary,
      })
      pdfPaths.push(pdfPath)
    }

    if (stores.length === 0) {
      await runForStore(null, null)
    } else {
      for (const s of stores) {
        await runForStore(s.id, s.shopifyShopDomain)
      }
    }

    await this.prisma.user.update({ where: { id: userId }, data: { instantInsightsSentAt: new Date() } })
    return { pdfPaths }
  }
}


