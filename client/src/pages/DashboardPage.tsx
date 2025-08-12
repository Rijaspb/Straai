import { useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/stores/authStore"
import { Toaster, toast } from "sonner"
import { ChatLayout } from "@/components/chat/ChatLayout"

export function DashboardPage() {
  const navigate = useNavigate()
  const { user, loading, initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (!loading && !user) {
      navigate('/')
    }
  }, [user, loading, navigate])

  // Auto-start trial for new users without a subscription
  useEffect(() => {
    const maybeStartTrial = async () => {
      try {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        if (!token) return
        const base = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000'
        const res = await fetch(`${base}/api/user/profile`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        const sub = data.user?.subscriptions?.[0]
        const inTrial = data.user?.inTrial
        const hasActive = sub && (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due')
        if (!hasActive && !inTrial) {
          const start = await fetch(`${base}/api/billing/start-trial`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
          if (start.ok) {
            toast.success('Your 14-day trial has started')
          }
        }
      } catch (e) {
        // ignore
      }
    }
    if (user) {
      maybeStartTrial()
    }
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect to home
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Toaster position="top-right" />
      <ChatLayout />
    </div>
  )
}
