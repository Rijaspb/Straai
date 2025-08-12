import { PrismaClient } from '@prisma/client'

export type TimeRange = {
  from: string // ISO date
  to: string   // ISO date
}

export type NormalizedAnalyticsPayload = {
  timeRange: TimeRange
  totalRevenue: number
  emailAttributedRevenue: number
  flows: Array<{
    id: string
    name: string
    sends?: number
    revenue?: number
    revenuePerSend?: number
  }>
  campaigns: Array<{
    id: string
    name: string
    sends?: number
    revenue?: number
    revenuePerSend?: number
  }>
  productSalesByChannel: Array<{
    sku: string
    title?: string
    channel: 'email' | 'store' | 'other'
    units: number
    revenue: number
  }>
}

export type PreprogrammedQueryId =
  | 'email_revenue_share_last_month'
  | 'top_flows_revenue_per_send'
  | 'products_email_vs_store'
  | 'abandoned_checkout_recovery_rate'
  | 'repeat_purchase_rate_30d'

export interface PreprogrammedResult {
  payload: NormalizedAnalyticsPayload
  computed: Record<string, any>
}

export class AnalyticsEngine {
  constructor(private prisma: PrismaClient) {}

  async buildNormalizedPayload(userId: string, storeId: string | null, timeRange: TimeRange): Promise<NormalizedAnalyticsPayload> {
    const [totalRevenue, emailAttributedRevenue] = await Promise.all([
      this.getTotalRevenue(userId, storeId, timeRange).catch(() => 0),
      this.getEmailAttributedRevenue(userId, storeId, timeRange).catch(() => 0),
    ])

    const [flows, campaigns, productSalesByChannel] = await Promise.all([
      this.getFlowsPerformance(userId, storeId, timeRange).catch(() => [] as NormalizedAnalyticsPayload['flows']),
      this.getCampaignsPerformance(userId, storeId, timeRange).catch(() => [] as NormalizedAnalyticsPayload['campaigns']),
      this.getProductSalesByChannel(userId, storeId, timeRange).catch(() => [] as NormalizedAnalyticsPayload['productSalesByChannel']),
    ])

    return {
      timeRange,
      totalRevenue,
      emailAttributedRevenue,
      flows,
      campaigns,
      productSalesByChannel,
    }
  }

  // --- Data access helpers (graceful fallbacks if tables not present yet) ---
  private async getTotalRevenue(userId: string, storeId: string | null, tr: TimeRange): Promise<number> {
    try {
      // Expect a normalized orders table when implemented
      const rows: Array<{ sum: number }> = await this.prisma.$queryRawUnsafe(
        `SELECT COALESCE(SUM(total_price), 0) as sum
         FROM orders
         WHERE user_id = $1
           ${storeId ? 'AND store_id = $2' : ''}
           AND created_at >= $${storeId ? 3 : 2} AND created_at < $${storeId ? 4 : 3}`,
        ...(storeId ? [userId, storeId, tr.from, tr.to] : [userId, tr.from, tr.to])
      )
      return Number(rows?.[0]?.sum || 0)
    } catch {
      return 0
    }
  }

  private async getEmailAttributedRevenue(userId: string, storeId: string | null, tr: TimeRange): Promise<number> {
    try {
      // Expect a normalized revenue_attributions table when implemented
      const rows: Array<{ sum: number }> = await this.prisma.$queryRawUnsafe(
        `SELECT COALESCE(SUM(order_value), 0) as sum
         FROM revenue_attributions
         WHERE user_id = $1
           ${storeId ? 'AND store_id = $2' : ''}
           AND channel = 'email'
           AND touchpoint_time >= $${storeId ? 3 : 2} AND touchpoint_time < $${storeId ? 4 : 3}`,
        ...(storeId ? [userId, storeId, tr.from, tr.to] : [userId, tr.from, tr.to])
      )
      return Number(rows?.[0]?.sum || 0)
    } catch {
      return 0
    }
  }

  private async getFlowsPerformance(userId: string, storeId: string | null, tr: TimeRange): Promise<NormalizedAnalyticsPayload['flows']> {
    try {
      // Placeholder structure; replace with real joins across klaviyo flows + attributed orders
      const rows: Array<{ id: string; name: string; sends: number; revenue: number }> = await this.prisma.$queryRawUnsafe(
        `SELECT flow_id as id, MAX(flow_name) as name, COALESCE(SUM(sends),0) as sends, COALESCE(SUM(revenue),0) as revenue
         FROM klaviyo_flow_performance
         WHERE user_id = $1 ${storeId ? 'AND store_id = $2' : ''}
           AND date >= $${storeId ? 3 : 2} AND date < $${storeId ? 4 : 3}
         GROUP BY flow_id
         ORDER BY revenue DESC
         LIMIT 20`,
        ...(storeId ? [userId, storeId, tr.from, tr.to] : [userId, tr.from, tr.to])
      )
      return rows.map(r => ({ ...r, revenuePerSend: r.sends ? r.revenue / r.sends : undefined }))
    } catch {
      return []
    }
  }

  private async getCampaignsPerformance(userId: string, storeId: string | null, tr: TimeRange): Promise<NormalizedAnalyticsPayload['campaigns']> {
    try {
      const rows: Array<{ id: string; name: string; sends: number; revenue: number }> = await this.prisma.$queryRawUnsafe(
        `SELECT campaign_id as id, MAX(campaign_name) as name, COALESCE(SUM(sends),0) as sends, COALESCE(SUM(revenue),0) as revenue
         FROM klaviyo_campaign_performance
         WHERE user_id = $1 ${storeId ? 'AND store_id = $2' : ''}
           AND date >= $${storeId ? 3 : 2} AND date < $${storeId ? 4 : 3}
         GROUP BY campaign_id
         ORDER BY revenue DESC
         LIMIT 50`,
        ...(storeId ? [userId, storeId, tr.from, tr.to] : [userId, tr.from, tr.to])
      )
      return rows.map(r => ({ ...r, revenuePerSend: r.sends ? r.revenue / r.sends : undefined }))
    } catch {
      return []
    }
  }

  private async getProductSalesByChannel(userId: string, storeId: string | null, tr: TimeRange): Promise<NormalizedAnalyticsPayload['productSalesByChannel']> {
    try {
      const rows: Array<{ sku: string; title?: string; channel: string; units: number; revenue: number }> = await this.prisma.$queryRawUnsafe(
        `SELECT sku, MAX(title) as title, channel, COALESCE(SUM(units),0) as units, COALESCE(SUM(revenue),0) as revenue
         FROM product_sales_by_channel
         WHERE user_id = $1 ${storeId ? 'AND store_id = $2' : ''}
           AND date >= $${storeId ? 3 : 2} AND date < $${storeId ? 4 : 3}
         GROUP BY sku, channel`,
        ...(storeId ? [userId, storeId, tr.from, tr.to] : [userId, tr.from, tr.to])
      )
      return rows.map(r => ({
        sku: r.sku,
        title: r.title,
        channel: (r.channel === 'email' || r.channel === 'store') ? (r.channel as 'email' | 'store') : 'other',
        units: Number(r.units || 0),
        revenue: Number(r.revenue || 0),
      }))
    } catch {
      return []
    }
  }

  // --- Preprogrammed handlers ---
  async handlePreprogrammed(
    id: PreprogrammedQueryId,
    userId: string,
    storeId: string | null,
    timeRange: TimeRange
  ): Promise<PreprogrammedResult> {
    const payload = await this.buildNormalizedPayload(userId, storeId, timeRange)
    switch (id) {
      case 'email_revenue_share_last_month': {
        const pct = payload.totalRevenue > 0 ? payload.emailAttributedRevenue / payload.totalRevenue : 0
        return { payload, computed: { emailRevenuePct: pct, benchmark: { good: 0.3, okay: 0.2 } } }
      }
      case 'top_flows_revenue_per_send': {
        const ranked = [...payload.flows]
          .map(f => ({ ...f, revenuePerSend: (f.sends && f.sends > 0) ? (f.revenue || 0) / f.sends : 0 }))
          .sort((a, b) => (b.revenuePerSend || 0) - (a.revenuePerSend || 0))
          .slice(0, 5)
        return { payload, computed: { topFlows: ranked } }
      }
      case 'products_email_vs_store': {
        const bySku: Record<string, { email: number; store: number; title?: string }> = {}
        for (const row of payload.productSalesByChannel) {
          bySku[row.sku] ||= { email: 0, store: 0, title: row.title }
          if (row.channel === 'email') bySku[row.sku].email += row.revenue
          if (row.channel === 'store') bySku[row.sku].store += row.revenue
        }
        const flagged = Object.entries(bySku)
          .map(([sku, v]) => ({ sku, title: v.title, emailShare: v.email + v.store > 0 ? v.email / (v.email + v.store) : 0 }))
          .filter(x => x.emailShare >= 0.5)
          .sort((a, b) => (b.emailShare - a.emailShare))
        return { payload, computed: { emailSkewedProducts: flagged } }
      }
      case 'abandoned_checkout_recovery_rate': {
        // Expect future normalized tables: checkouts and recoveries
        const resp = await this.safeRaw<{ started: number; recovered: number }>(
          `SELECT 
             COALESCE(SUM(started),0) as started,
             COALESCE(SUM(recovered),0) as recovered
           FROM checkout_recovery
           WHERE user_id = $1 ${storeId ? 'AND store_id = $2' : ''}
             AND date >= $${storeId ? 3 : 2} AND date < $${storeId ? 4 : 3}`,
          ...(storeId ? [userId, storeId, timeRange.from, timeRange.to] : [userId, timeRange.from, timeRange.to])
        )
        const started = Number(resp?.[0]?.started || 0)
        const recovered = Number(resp?.[0]?.recovered || 0)
        const rate = started > 0 ? recovered / started : 0
        return { payload, computed: { recoveryRate: rate, benchmark: { range: [0.1, 0.2] } } }
      }
      case 'repeat_purchase_rate_30d': {
        const resp = await this.safeRaw<{ repeaters: number; total: number }>(
          `SELECT 
             COALESCE(SUM(repeaters),0) as repeaters,
             COALESCE(SUM(total_customers),0) as total
           FROM repeat_purchase_30d
           WHERE user_id = $1 ${storeId ? 'AND store_id = $2' : ''}
             AND window_start >= $${storeId ? 3 : 2} AND window_start < $${storeId ? 4 : 3}`,
          ...(storeId ? [userId, storeId, timeRange.from, timeRange.to] : [userId, timeRange.from, timeRange.to])
        )
        const total = Number(resp?.[0]?.total || 0)
        const repeaters = Number(resp?.[0]?.repeaters || 0)
        const rate = total > 0 ? repeaters / total : 0
        return { payload, computed: { repeatPurchaseRate30d: rate } }
      }
    }
  }

  private async safeRaw<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<T[]>(sql, ...params)
      return rows
    } catch {
      return []
    }
  }
}


