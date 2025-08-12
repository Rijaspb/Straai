import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type ReportRow = {
  id: string
  weekOf: string
  generatedAt: string
  pdfPath: string | null
  store?: { id: string; shopifyShopDomain: string | null }
}

export function ReportsPanel() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ReportRow[]>([])

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
        // ignore
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
    } catch {
      // ignore
    }
  }

  return (
    <Card className="glass border-gradient elev-2">
      <CardHeader>
        <CardTitle className="text-gradient-primary">Reports</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading reports...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No reports yet.</div>
        ) : (
          <div className="space-y-3">
            {rows.slice(0, 5).map(r => (
              <div key={r.id} className="glass border-gradient rounded-md p-3 flex items-center justify-between hover-lift transition">
                <div className="text-sm">
                  <div className="font-medium">Week of {new Date(r.weekOf).toLocaleDateString()}</div>
                  <div className="text-muted-foreground">
                    {r.store?.shopifyShopDomain || 'Store'} • Generated {new Date(r.generatedAt).toLocaleString()}
                  </div>
                </div>
                <Button size="sm" className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-md" onClick={() => download(r.id)} disabled={!r.pdfPath}>
                  {r.pdfPath ? 'Download' : 'Pending'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}


