import { supabase } from '@/lib/supabase'

const API_BASE_URL = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8000'

export interface IntegrationStatus {
  id: string
  provider: string
  status: string
  lastSyncAt?: string
  metadata?: any
}

export interface OAuthResponse {
  authUrl: string
  state: string
  provider: string
}

class IntegrationService {
  private statusCache = new Map<string, { data: IntegrationStatus | null; ts: number }>()
  private inflight = new Map<string, Promise<IntegrationStatus | null>>()
  private readonly CACHE_TTL_MS = 60_000 // Increased cache TTL to 1 minute
  private authTokenCache: { token: string; ts: number } | null = null
  private readonly AUTH_CACHE_TTL_MS = 5_000 // Cache auth token for 5 seconds

  private async getAuthHeaders() {
    const now = Date.now()
    
    // Use cached auth token if still valid
    if (this.authTokenCache && now - this.authTokenCache.ts < this.AUTH_CACHE_TTL_MS) {
      return {
        'Authorization': `Bearer ${this.authTokenCache.token}`,
        'Content-Type': 'application/json',
      }
    }
    
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('No authentication token found')
    }
    
    // Cache the auth token
    this.authTokenCache = {
      token: session.access_token,
      ts: now
    }
    
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    }
  }

  async connectProvider(provider: 'shopify' | 'klaviyo', metadata?: any): Promise<OAuthResponse> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${API_BASE_URL}/api/integrations/${provider}/connect`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ metadata }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to initiate OAuth flow')
    }

    return response.json()
  }

  async getIntegrationStatus(provider: 'shopify' | 'klaviyo'): Promise<IntegrationStatus | null> {
    try {
      // Cache and single-flight identical requests per provider
      const key = provider
      const now = Date.now()
      const cached = this.statusCache.get(key)
      if (cached && now - cached.ts < this.CACHE_TTL_MS) {
        return cached.data
      }

      const inProgress = this.inflight.get(key)
      if (inProgress) {
        return inProgress
      }

      const requestPromise = (async () => {
        try {
          const headers = await this.getAuthHeaders()
          
          console.log(`Frontend: Getting ${provider} status...`)
          
          const response = await fetch(`${API_BASE_URL}/api/integrations/${provider}/status`, {
            method: 'GET',
            headers,
          })

          console.log(`Frontend: ${provider} status response:`, response.status, response.statusText)

          if (!response.ok) {
            if (response.status === 404) {
              console.log(`Frontend: ${provider} status 404 - no integration found`)
              this.statusCache.set(key, { data: null, ts: Date.now() })
              return null // No integration found (legacy behavior)
            }
            const error = await response.json()
            console.error(`Frontend: ${provider} status error:`, error)
            throw new Error(error.error || 'Failed to get integration status')
          }

          const data = await response.json()
          console.log(`Frontend: ${provider} status data:`, data)

          // New behavior: backend may return { connected: false }
          if (data && data.connected === false) {
            console.log(`Frontend: ${provider} status shows connected: false`)
            this.statusCache.set(key, { data: null, ts: Date.now() })
            return null
          }

          console.log(`Frontend: ${provider} status shows connected: true, returning:`, data)
          const result = data as IntegrationStatus
          this.statusCache.set(key, { data: result, ts: Date.now() })
          return result
        } catch (error) {
          console.error(`Error in ${provider} status request:`, error)
          throw error
        }
      })()

      this.inflight.set(key, requestPromise)

      const result = await requestPromise
      this.inflight.delete(key)
      return result
    } catch (error) {
      console.error(`Error getting ${provider} status:`, error)
      this.inflight.delete(provider)
      return null
    }
  }

  async disconnectProvider(provider: 'shopify' | 'klaviyo'): Promise<void> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${API_BASE_URL}/api/integrations/${provider}/disconnect`, {
      method: 'DELETE',
      headers,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to disconnect integration')
    }
    this.invalidateStatus(provider)
  }

  async syncProvider(provider: 'shopify' | 'klaviyo'): Promise<void> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${API_BASE_URL}/api/integrations/${provider}/sync`, {
      method: 'POST',
      headers,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to sync integration')
    }
    this.invalidateStatus(provider)
  }

  // Helper method to redirect to OAuth URL
  redirectToOAuth(authUrl: string): void {
    window.location.href = authUrl
  }

  // Cache controls
  invalidateStatus(provider: 'shopify' | 'klaviyo') {
    this.statusCache.delete(provider)
  }

  // Clear all caches (useful for logout)
  clearCache() {
    this.statusCache.clear()
    this.inflight.clear()
    this.authTokenCache = null
  }
}

export const integrationService = new IntegrationService()
