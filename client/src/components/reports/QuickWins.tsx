import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Zap, TrendingUp, Target, BarChart3 } from 'lucide-react'

type QuickWin = {
  id: string
  type: 'top_products' | 'top_flow'
  title: string
  details: any
}

export function QuickWins({ onAsk }: { onAsk: (q: string) => void }) {
  const [items, setItems] = useState<QuickWin[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      try {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        if (!token) return
        const base = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000'
        const res = await fetch(`${base}/api/quick-wins`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        setItems(data.quickWins || [])
      } catch (e) {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  // Empty state when no quick wins
  if (!loading && !items.length) {
    return (
      <Card className="bg-gradient-to-br from-card/80 to-accent/20 backdrop-blur border-gradient">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8 text-blue-500" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No quick wins available yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Check back after your first report is generated this Monday.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i} className="animate-pulse bg-card/50">
            <CardHeader>
              <div className="h-5 bg-muted rounded w-3/4"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-full"></div>
                <div className="h-4 bg-muted rounded w-2/3"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const getQuickWinIcon = (type: string) => {
    switch (type) {
      case 'top_products':
        return <Target className="w-5 h-5" />
      case 'top_flow':
        return <TrendingUp className="w-5 h-5" />
      default:
        return <Zap className="w-5 h-5" />
    }
  }

  const getQuickWinBadge = (type: string) => {
    switch (type) {
      case 'top_products':
        return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200">High Impact</Badge>
      case 'top_flow':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">Optimize</Badge>
      default:
        return <Badge variant="secondary">Action</Badge>
    }
  }

  const askForItem = (w: QuickWin) => {
    if (w.type === 'top_products') {
      onAsk('Analyze these top email products and draft a campaign plan to promote them this week.')
    } else if (w.type === 'top_flow') {
      onAsk('Analyze the most profitable flow and suggest 3 improvements to increase revenue per send.')
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((w) => (
        <Card key={w.id} className="group glass border-gradient hover-lift cursor-pointer transition-all duration-200 hover:shadow-lg" onClick={() => askForItem(w)}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center text-blue-600">
                  {getQuickWinIcon(w.type)}
                </div>
                <div>
                  <CardTitle className="text-sm font-medium leading-tight">{w.title}</CardTitle>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              {getQuickWinBadge(w.type)}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {w.type === 'top_products' && (
              <div className="space-y-2">
                {(w.details?.items || []).slice(0, 3).map((p: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <span className="text-foreground truncate flex-1 mr-2">
                      {(p.title || p.sku) ?? 'Product'}
                    </span>
                    <span className="text-emerald-600 font-medium">
                      ${Number(p.revenue || 0).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {w.type === 'top_flow' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-foreground">{w.details?.name || 'Flow'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Revenue per send</span>
                  <span className="text-blue-600 font-medium">
                    ${Number(w.details?.revenuePerSend || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-border/50">
              <Button 
                size="sm" 
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0"
                onClick={(e) => {
                  e.stopPropagation()
                  askForItem(w)
                }}
              >
                <Zap className="w-4 h-4 mr-2" />
                Ask Straai
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}


