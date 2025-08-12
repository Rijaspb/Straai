import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { IntegrationCard } from '@/components/integrations/IntegrationCard'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

const COUNTRIES = [
  'United States','United Kingdom','Canada','Australia','India','Germany','France','Spain','Italy','Netherlands','Sweden','Norway','Denmark','Finland','Ireland','Switzerland','Austria','Belgium','Portugal','Poland','Brazil','Mexico','Japan','South Korea','Singapore','United Arab Emirates','South Africa','New Zealand'
]

type Profile = {
  id: string
  email: string
  timezone: string | null
  country?: string | null
  companyName: string | null
  businessContext?: string | null
  inTrial?: boolean
  subscriptions?: Array<{ id: string; status: string; trialEndsAt: string | null }>
}

const API_BASE = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000'

export function SettingsPage() {
  const navigate = useNavigate()
  const { signOut } = useAuthStore()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [country, setCountry] = useState('')
  const [businessContext, setBusinessContext] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [message, setMessage] = useState('')

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  const loadProfile = useCallback(async () => {
    try {
      setProfileLoading(true)
      const token = await getAuthToken()
      if (!token) {
        setProfileLoading(false)
        return
      }
      
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      const res = await fetch(`${API_BASE}/api/user/profile`, { 
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const data = await res.json()
      const p = data.user as Profile
      setProfile(p)
      setCompanyName(p.companyName || '')
      setCountry(p.country || '')
      setBusinessContext(p.businessContext || '')
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  const saveProfile = async () => {
    const token = await getAuthToken()
    if (!token) return
    const res = await fetch(`${API_BASE}/api/user/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ country, companyName, businessContext }),
    })
    const data = await res.json()
    const updated = data.user as Profile
    setProfile(updated)
    setCompanyName(updated.companyName || '')
    setCountry(updated.country || '')
    setBusinessContext(updated.businessContext || '')
    setMessage('Profile saved')
    setTimeout(() => setMessage(''), 1500)
  }

  const saveBusinessContext = async () => {
    await saveProfile()
  }

  const openBillingPortal = async () => {
    const token = await getAuthToken()
    if (!token) return
    const res = await fetch(`${API_BASE}/api/billing/portal`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }

  const exportData = async () => {
    const token = await getAuthToken()
    if (!token) return
    const res = await fetch(`${API_BASE}/api/user/export`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (res.ok) {
      setMessage('Export requested. We will email your data shortly.')
      setTimeout(() => setMessage(''), 2000)
    } else {
      setMessage('Failed to request export')
      setTimeout(() => setMessage(''), 2000)
    }
  }

  const deleteAccount = async () => {
    if (!confirm('This will schedule your account for deletion. Continue?')) return
    const token = await getAuthToken()
    if (!token) return
    await fetch(`${API_BASE}/api/user/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    alert('Account deletion requested. You will be signed out.')
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const changePassword = async () => {
    setMessage('')
    if (newPassword.length < 6) {
      setMessage('Password must be at least 6 characters long')
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Password updated successfully')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-6xl mx-auto p-6 space-y-6 flex-1">
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => navigate('/dashboard')}
              aria-label="Back to dashboard"
              className="group"
            >
              <ChevronLeft className="w-4 h-4 mr-2 transition-transform group-hover:-translate-x-0.5" />
              Back
            </Button>
          </div>
          <div>
            <Button variant="outline" onClick={async () => { await signOut(); window.location.href = '/' }}>Sign out</Button>
          </div>
        </div>
        {message && <div className="text-sm text-muted-foreground">{message}</div>}
      
        <Card className="surface">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {profileLoading ? (
              <div className="col-span-2 flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading profile...
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input value={profile?.email || ''} disabled />
                </div>
                <div className="grid gap-2">
                  <Label>Company name</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc" />
                </div>
                <div className="grid gap-2">
                  <Label>Country</Label>
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  >
                    <option value="">Select country</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button onClick={saveProfile}>Save</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="surface">
          <CardHeader>
            <CardTitle>Business context and details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Label htmlFor="businessContext">Describe your business, products, audience, tone, FAQs, etc.</Label>
            <textarea
              id="businessContext"
              className="min-h-[140px] w-full rounded-md border bg-background p-3 text-sm"
              value={businessContext}
              onChange={(e) => setBusinessContext(e.target.value)}
              placeholder="We sell ... Our brand tone is ... Our customers often ask ..."
            />
            <div>
              <Button onClick={saveBusinessContext}>Save context</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="surface">
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <IntegrationCard
              provider="shopify"
              title="Shopify"
              description="Connect your store to sync orders and products."
              icon={<img src="/src/assets/platform-logos/shopify.png" alt="Shopify" className="w-6 h-6" />}
            />
            <IntegrationCard
              provider="klaviyo"
              title="Klaviyo"
              description="Connect your email account to attribute revenue."
              icon={<img src="/src/assets/platform-logos/klaviyo.jpg" alt="Klaviyo" className="w-6 h-6" />}
            />
          </CardContent>
        </Card>

        <Card className="surface">
          <CardHeader>
            <CardTitle>Billing</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            {profileLoading ? (
              <div className="flex items-center">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading billing info...
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Status: {profile?.subscriptions?.[0]?.status || (profile?.inTrial ? 'trialing' : 'inactive')}
                {profile?.subscriptions?.[0]?.trialEndsAt && (
                  <span className="ml-2">Trial ends {new Date(profile.subscriptions[0].trialEndsAt).toLocaleDateString()}</span>
                )}
              </div>
            )}
            <Button onClick={openBillingPortal} disabled={profileLoading}>Open customer portal</Button>
          </CardContent>
        </Card>

        <Card className="surface">
          <CardHeader>
            <CardTitle>Password</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>New password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
            </div>
            <div className="grid gap-2">
              <Label>Confirm new password</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" />
            </div>
            <div className="flex items-end">
              <Button onClick={changePassword}>Update password</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="surface">
          <CardHeader>
            <CardTitle>Data controls</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={exportData}>Request data export</Button>
            <Button variant="destructive" onClick={deleteAccount}>Delete my data & account</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


