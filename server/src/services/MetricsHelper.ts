import { PrismaClient } from '@prisma/client'
import { AnalyticsEngine, TimeRange } from './AnalyticsEngine'

export type MetricSource = 'shopify' | 'klaviyo' | 'mixed' | 'derived'

export type VerifiedMetric = {
  key: string
  name: string
  value: number | string
  explanation: string
  source: MetricSource
}

export class MetricsHelper {
  private analytics: AnalyticsEngine

  constructor(prisma: PrismaClient) {
    this.analytics = new AnalyticsEngine(prisma)
  }

  async computeCoreMetrics(
    userId: string,
    storeId: string | null,
    timeRange: TimeRange
  ): Promise<{ metrics: VerifiedMetric[]; context: any }> {
    const payload = await this.analytics.buildNormalizedPayload(userId, storeId, timeRange)

    const metrics: VerifiedMetric[] = []

    // Load static benchmarks
    let benchmarks: { email_revenue_share?: number; abandoned_checkout_recovery_rate?: number; repeat_purchase_rate_30d?: number } = {}
    try {
      const mod = await import('../../data/benchmarks.json')
      benchmarks = (mod as any).default || (mod as any)
    } catch {
      // ignore if missing
    }

    // Shopify-driven
    const totalRevenueMetric: VerifiedMetric = {
      key: 'total_revenue',
      name: 'Total revenue',
      value: payload.totalRevenue,
      explanation: 'Sum of Shopify orders in range.',
      source: 'shopify',
    }
    metrics.push(totalRevenueMetric)

    // Klaviyo-driven
    const emailRevenueMetric: VerifiedMetric = {
      key: 'email_revenue',
      name: 'Email-attributed revenue',
      value: payload.emailAttributedRevenue,
      explanation: 'Revenue attributed to Klaviyo email touches in range.',
      source: 'klaviyo',
    }
    metrics.push(emailRevenueMetric)

    // Derived
    const emailShare = payload.totalRevenue > 0 ? payload.emailAttributedRevenue / payload.totalRevenue : 0
    const emailShareMetric: VerifiedMetric = {
      key: 'email_revenue_share',
      name: 'Email revenue share',
      value: `${(emailShare * 100).toFixed(1)}%`,
      explanation: 'Email-attributed revenue divided by total revenue.',
      source: 'derived',
    }
    metrics.push(emailShareMetric)

    // Klaviyo-driven: top flow/campaign by revenue per send
    const topFlow = [...payload.flows]
      .map(f => ({ ...f, rps: f.sends && f.sends > 0 ? (f.revenue || 0) / f.sends : 0 }))
      .sort((a, b) => (b.rps || 0) - (a.rps || 0))[0]
    if (topFlow) {
      metrics.push({
        key: 'top_flow_rps',
        name: 'Top flow RPS',
        value: Number(topFlow.rps?.toFixed(2) || 0),
        explanation: `Best flow by revenue per send: ${topFlow.name}.`,
        source: 'klaviyo',
      })
    }

    const topCampaign = [...payload.campaigns]
      .map(c => ({ ...c, rps: c.sends && c.sends > 0 ? (c.revenue || 0) / c.sends : 0 }))
      .sort((a, b) => (b.rps || 0) - (a.rps || 0))[0]
    if (topCampaign) {
      metrics.push({
        key: 'top_campaign_rps',
        name: 'Top campaign RPS',
        value: Number(topCampaign.rps?.toFixed(2) || 0),
        explanation: `Best campaign by revenue per send: ${topCampaign.name}.`,
        source: 'klaviyo',
      })
    }

    const bestEmailProduct = [...payload.productSalesByChannel]
      .filter(p => p.channel === 'email')
      .sort((a, b) => b.revenue - a.revenue)[0]
    if (bestEmailProduct) {
      metrics.push({
        key: 'top_email_product',
        name: 'Best product via email',
        value: bestEmailProduct.title || bestEmailProduct.sku,
        explanation: `Top revenue via email: $${bestEmailProduct.revenue.toFixed(2)}.`,
        source: 'klaviyo',
      })
    }

    // Provide extra context for LLM narrative if needed
    const context = {
      timeRange,
      benchmarks,
      deltas: {
        email_revenue_share_vs_benchmark: (benchmarks.email_revenue_share ?? null) !== null ? emailShare - (benchmarks.email_revenue_share ?? 0) : null,
      },
      highlights: {
        topFlowName: topFlow?.name,
        topCampaignName: topCampaign?.name,
        bestEmailProduct: bestEmailProduct?.title || bestEmailProduct?.sku,
      },
    }

    return { metrics, context }
  }
}


