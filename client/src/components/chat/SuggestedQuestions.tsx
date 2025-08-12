import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chatStore'
import { supabase } from '@/lib/supabase'

const QUESTIONS: Array<{ id: string; label: string }> = [
  { id: 'email_revenue_share_last_month', label: 'What % of my revenue came from email last month, and is that good?' },
  { id: 'top_flows_revenue_per_send', label: 'Which email flows make the most money per send?' },
  { id: 'products_email_vs_store', label: 'Which products sell well in email but not on the store?' },
  { id: 'abandoned_checkout_recovery_rate', label: "What’s my abandoned checkout recovery rate?" },
  { id: 'repeat_purchase_rate_30d', label: "What’s my 30-day repeat purchase rate?" },
]

export function SuggestedQuestions() {
  const { createNewChat, sendMessage } = useChatStore()

  const onClick = async (q: { id: string; label: string }) => {
    // Prefer preprogrammed id via server API if available
    createNewChat(q.label)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    try {
      const base = (import.meta as any).env.VITE_API_BASE_URL || ''
      const resp = await fetch(`${base}/api/ai/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ preprogrammedQueryId: q.id }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to query AI')
      const ai = data?.data
      const formatted = ai?.executive_summary
        ? `Here's what I'm seeing in your data:\n\n${ai.executive_summary}\n\nKey metrics:\n${(ai.key_metrics || []).map((k: any) => `- ${k.name}: ${k.value} — ${k.explanation}`).join('\n')}\n\nTop recommendations:\n${(ai.top_recommendations || []).map((r: string) => `- ${r}`).join('\n')}\n\nConfidence: ${(ai.confidence_score ?? 0).toFixed(2)}`
        : (data?.message || 'Received.')
      useChatStore.getState().addAssistantMessage(formatted)
    } catch (e: any) {
      // Fallback to sending label as plain text question
      await sendMessage(q.label)
    }
  }

  return (
    <div className="flex flex-col gap-2 items-stretch w-full max-w-2xl mx-auto">
      {QUESTIONS.map((q, i) => (
        <Button
          key={q.id}
          variant="outline"
          className="justify-start whitespace-normal text-left glass border-gradient hover-lift"
          style={{ animationDelay: `${i * 80}ms` }}
          onClick={() => onClick(q)}
        >
          {q.label}
        </Button>
      ))}
    </div>
  )
}


