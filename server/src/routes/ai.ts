import { Router } from 'express'
import { authenticate, AuthenticatedRequest } from '../middleware/auth'
import { requireActiveSubscription } from '../middleware/subscription'
import { AnalyticsEngine, PreprogrammedQueryId } from '../services/AnalyticsEngine'
import { MetricsHelper } from '../services/MetricsHelper'
import axios from 'axios'
import { prisma } from '../lib/prisma'

const router = Router()
const engine = new AnalyticsEngine(prisma)
const metricsHelper = new MetricsHelper(prisma)

type AiQueryBody = {
  userId?: string
  storeId?: string | null
  question?: string
  preprogrammedQueryId?: PreprogrammedQueryId
  timeRange?: { from?: string; to?: string }
}

// POST /api/ai/query
router.post('/query', authenticate, requireActiveSubscription, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id
    const { storeId = null, question, preprogrammedQueryId, timeRange }: AiQueryBody = req.body || {}

    if (!question && !preprogrammedQueryId) {
      return res.status(400).json({ error: 'Provide either question or preprogrammedQueryId' })
    }

    // Default to last 30 days
    const now = new Date()
    const to = (timeRange?.to ? new Date(timeRange.to) : now).toISOString()
    const from = (timeRange?.from ? new Date(timeRange.from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)).toISOString()

    // Always compute deterministic metrics first
    await engine.buildNormalizedPayload(userId, storeId, { from, to })
    const { metrics, context } = await metricsHelper.computeCoreMetrics(userId, storeId, { from, to })

    const llmRequest = buildGptRequest({
      payload: undefined,
      question: question || mapPreprogrammedToQuestion(preprogrammedQueryId!),
      computed: { metrics, context },
    })

    const aiResponse = await callGptStructured(llmRequest)

    const responseData = {
      executive_summary: aiResponse.executive_summary,
      key_metrics: metrics,
      top_recommendations: aiResponse.top_recommendations,
      confidence_score: aiResponse.confidence_score,
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId,
        messages: {
          role: 'system',
          model: 'gpt-5-analytics',
          request: { question, metrics, context },
          response: responseData,
          ts: new Date().toISOString(),
        },
      },
    })

    return res.json({ success: true, data: responseData, conversationId: conversation.id })
  } catch (error) {
    console.error('AI query error:', error)
    return res.status(500).json({ error: 'Failed to process AI query' })
  }
})

function mapPreprogrammedToQuestion(id: PreprogrammedQueryId): string {
  switch (id) {
    case 'email_revenue_share_last_month':
      return 'What % of my revenue came from email last month, and is that good?'
    case 'top_flows_revenue_per_send':
      return 'Which email flows make the most money per send?'
    case 'products_email_vs_store':
      return 'Which products sell well in email but not on the store?'
    case 'abandoned_checkout_recovery_rate':
      return "What's my abandoned checkout recovery rate?"
    case 'repeat_purchase_rate_30d':
      return "What's my 30-day repeat purchase rate?"
  }
}

function buildGptRequest(input: { payload: any; question: string; computed?: any }) {
  const systemPrompt = 'You are a senior analytics consultant. Using the provided verified metrics, write a concise narrative and 3-5 recommendations. Do not invent numbers.'
  const instructions = [
    'Summarize performance using only the provided metrics.',
    'Provide 3-5 actionable recommendations.',
    'Do not produce any new numbers; reference only provided metrics.',
  ]

  return {
    model: 'gpt-5.1',
    mode: 'structured_output_with_explanation',
    system: systemPrompt,
    input: {
      question: input.question,
      metrics: input.computed?.metrics || [],
      context: input.computed?.context || null,
      instructions,
    },
    schema: {
      type: 'object',
      properties: {
        executive_summary: { type: 'string' },
        top_recommendations: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
        confidence_score: { type: 'number', minimum: 0, maximum: 1 },
        explanation: { type: 'string' },
      },
      required: ['executive_summary', 'top_recommendations', 'confidence_score'],
      additionalProperties: true,
    },
  }
}

async function callGptStructured(request: any): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY
  const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
  const model = process.env.OPENAI_MODEL || request.model || 'gpt-5.1'

  if (!apiKey) {
    return {
      executive_summary: 'Insufficient live data; showing a structured mock. Connect Shopify and Klaviyo for full insights.',
      key_metrics: [
        { name: 'Total revenue', value: request.input.analytics_payload?.totalRevenue ?? 0, explanation: 'Sum of Shopify orders in range.' },
        { name: 'Email-attributed revenue', value: request.input.analytics_payload?.emailAttributedRevenue ?? 0, explanation: 'Orders linked to Klaviyo touches.' },
      ],
      top_recommendations: [
        'Enable welcome flow with 2–3 emails to convert new subscribers.',
        'Set up abandoned checkout flow and test subject lines to lift recovery.',
        'Identify products with email-heavy sales and feature them on-site.',
      ],
      confidence_score: 0.4,
      explanation: 'Mocked response since OPENAI_API_KEY is missing in this environment.',
    }
  }

  const userContent = {
    question: request.input.question,
    analytics_payload: request.input.analytics_payload,
    computed_context: request.input.computed_context,
    schema: request.schema,
    instruction: 'Return a single JSON object matching the schema. Include an explanation field.'
  }

  try {
    const resp = await axios.post(
      `${apiBase}/chat/completions`,
      {
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: JSON.stringify(userContent) },
        ],
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 45000,
      }
    )
    const text = resp.data?.choices?.[0]?.message?.content || '{}'
    try {
      return JSON.parse(text)
    } catch {
      return { executive_summary: text, key_metrics: [], top_recommendations: [], confidence_score: 0.5, explanation: 'Non-JSON content parsed.' }
    }
  } catch (error: any) {
    console.error('OpenAI call failed:', error?.response?.data || error?.message || error)
    return {
      executive_summary: 'We could not reach the AI service. Showing a conservative summary based on your data payload.',
      key_metrics: [
        { name: 'Total revenue', value: request.input.analytics_payload?.totalRevenue ?? 0, explanation: 'Sum of Shopify orders in range.' },
        { name: 'Email-attributed revenue', value: request.input.analytics_payload?.emailAttributedRevenue ?? 0, explanation: 'Orders linked to Klaviyo touches.' },
      ],
      top_recommendations: [
        'Verify integrations are connected and synced.',
        'Enable core lifecycle flows (welcome, abandoned checkout, post-purchase).',
        'Run one high-impact campaign this week and measure revenue per send.',
      ],
      confidence_score: 0.3,
      explanation: 'Fallback generated locally due to API failure.',
    }
  }
}

export { router as aiRoutes }


