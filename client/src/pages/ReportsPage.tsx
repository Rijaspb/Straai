import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { QuickWins } from '@/components/reports/QuickWins'
import { useChatStore } from '@/stores/chatStore'
import { Badge } from '@/components/ui/badge'
import { FileText, Download, Calendar, Clock, Rocket, BarChart3, ArrowLeft } from 'lucide-react'

type ReportRow = {
  id: string
  weekOf: string
  generatedAt: string
  pdfPath: string | null
  summary?: string | null
  store: { id: string; shopifyShopDomain: string | null }
}

export function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ReportRow[]>([])
  const navigate = useNavigate()
  const latest = useMemo(() => (rows.length > 0 ? rows[0] : null), [rows])
  const { sendMessage, createNewChat } = useChatStore()
  
  const onAsk = async (q: string) => {
    createNewChat(q)
    await sendMessage(q)
    navigate('/dashboard')
  }

  useEffect(() => {
    const run = async () => {
      try {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        if (!token) return
        const base = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000'
        const res = await fetch(`${base}/api/reports`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        setRows(data.reports || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  const download = async (id: string) => {
    try {
      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token
      if (!token) return
      const base = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000'
      const res = await fetch(`${base}/api/reports/${id}/download`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report_${id}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-white to-accent/30 flex flex-col">
        <div className="max-w-6xl mx-auto p-6 flex-1 w-full">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-muted rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-white to-accent/30 flex flex-col">
      <div className="max-w-6xl mx-auto p-6 flex-1 w-full">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard')}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
        
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
              Reports
            </h1>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Weekly reports are generated automatically every Monday 08:00 in your timezone.
          </p>
        </div>
        {/* Quick Wins Section */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Rocket className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold tracking-tight">Quick Wins</h2>
          </div>
          <QuickWins onAsk={onAsk} />
        </div>

        {/* Reports History Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold tracking-tight">Report History</h2>
          </div>
          
          {rows.length === 0 ? (
            <div className="space-y-6">
              <Card className="bg-gradient-to-br from-card/80 to-accent/20 backdrop-blur border-gradient">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mb-4">
                    <FileText className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No reports yet</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                    Your first weekly report will be generated this Monday at 08:00.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="bg-card/60 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-500" />
                    What to expect
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 text-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <span>Email performance insights</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span>Revenue attribution analysis</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                      <span>Product performance metrics</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                      <span>Abandoned cart recovery stats</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-4">
              {latest && (
                <Card className="glass border-gradient elev-2 bg-gradient-to-br from-card to-accent/10">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200">
                            Latest
                          </Badge>
                        </div>
                        <CardTitle className="text-lg">Week of {new Date(latest.weekOf).toLocaleDateString()}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Calendar className="w-4 h-4" />
                          Generated {new Date(latest.generatedAt).toLocaleString()}
                        </CardDescription>
                      </div>
                      <Button 
                        onClick={() => download(latest.id)} 
                        disabled={!latest.pdfPath}
                        className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {latest.pdfPath ? 'Download PDF' : 'Pending'}
                      </Button>
                    </div>
                  </CardHeader>
                  {latest.summary && (
                    <CardContent className="pt-0">
                      <div className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                        {latest.summary}
                      </div>
                    </CardContent>
                  )}
                </Card>
              )}
              
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rows.slice(1).map((r) => (
                  <Card key={r.id} className="group glass hover-lift transition-all duration-200 hover:shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Week of {new Date(r.weekOf).toLocaleDateString()}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <span>{r.store?.shopifyShopDomain || 'Store'}</span>
                        <span>•</span>
                        <span>{new Date(r.generatedAt).toLocaleDateString()}</span>
                      </CardDescription>
                    </CardHeader>
                    {r.summary && (
                      <CardContent className="pt-0">
                        <div className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                          {r.summary}
                        </div>
                      </CardContent>
                    )}
                    <CardFooter>
                      <Button 
                        size="sm"
                        variant="outline"
                        onClick={() => download(r.id)} 
                        disabled={!r.pdfPath}
                        className="w-full"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {r.pdfPath ? 'Download PDF' : 'Pending'}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


