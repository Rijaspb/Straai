import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, XCircle, RefreshCw, Link, Unlink } from 'lucide-react'
import { integrationService, IntegrationStatus } from '@/services/integrationService'
import { toast } from 'sonner'
import { ShopifyConnectModal } from './ShopifyConnectModal'

interface IntegrationCardProps {
  provider: 'shopify' | 'klaviyo'
  title: string
  description: string
  icon: React.ReactNode
}

export function IntegrationCard({ provider, title, description, icon }: IntegrationCardProps) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [showShopifyModal, setShowShopifyModal] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const location = useLocation()
  const processedOAuthRef = useRef(false)
  const mountedRef = useRef(true)

  const loadStatus = useCallback(async () => {
    if (!mountedRef.current) return
    
    try {
      setInitialLoading(true)
      console.log(`IntegrationCard: Loading status for ${provider}...`)
      const integrationStatus = await integrationService.getIntegrationStatus(provider)
      console.log(`IntegrationCard: ${provider} status result:`, integrationStatus)
      if (mountedRef.current) {
        setStatus(integrationStatus)
      }
    } catch (error) {
      console.error(`Error loading ${provider} status:`, error)
    } finally {
      if (mountedRef.current) {
        setInitialLoading(false)
      }
    }
  }, [provider])

  useEffect(() => {
    mountedRef.current = true
    loadStatus()
    
    return () => {
      mountedRef.current = false
    }
  }, [loadStatus])

  // Check for OAuth completion and refresh status
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const connectedProvider = searchParams.get('connected')
    const integrationId = searchParams.get('integration')
    
    if (connectedProvider === provider && integrationId && !processedOAuthRef.current) {
      processedOAuthRef.current = true
      console.log(`OAuth completed for ${provider}, refreshing status...`)
      
      // Implement retry mechanism with exponential backoff
      const retryStatusCheck = async (attempt: number = 1, maxAttempts: number = 5) => {
        if (!mountedRef.current) return
        
        try {
          console.log(`Attempt ${attempt}: Checking ${provider} status...`)
          const integrationStatus = await integrationService.getIntegrationStatus(provider)
          
          if (integrationStatus && integrationStatus.status === 'connected') {
            console.log(`Successfully loaded ${provider} status:`, integrationStatus)
            if (mountedRef.current) {
              setStatus(integrationStatus)
            }
            
            // Clear URL parameters after successful status load
            const newUrl = new URL(window.location.href)
            newUrl.searchParams.delete('connected')
            newUrl.searchParams.delete('integration')
            window.history.replaceState({}, '', newUrl.toString())
            
            toast.success(`${provider} connected successfully!`)
            return
          } else {
            console.log(`Attempt ${attempt}: ${provider} not yet connected, status:`, integrationStatus)
            
            if (attempt < maxAttempts && mountedRef.current) {
              // Exponential backoff: 1s, 2s, 4s, 8s, 16s
              const delay = Math.pow(2, attempt - 1) * 1000
              console.log(`Retrying in ${delay}ms...`)
              setTimeout(() => retryStatusCheck(attempt + 1, maxAttempts), delay)
            } else if (mountedRef.current) {
              console.error(`Failed to get ${provider} status after ${maxAttempts} attempts`)
              toast.error(`Failed to verify ${provider} connection. Please refresh the page.`)
              // Clear URL parameters to avoid re-triggering retries on re-render
              const newUrl = new URL(window.location.href)
              newUrl.searchParams.delete('connected')
              newUrl.searchParams.delete('integration')
              window.history.replaceState({}, '', newUrl.toString())
            }
          }
        } catch (error) {
          console.error(`Attempt ${attempt}: Error checking ${provider} status:`, error)
          
          if (attempt < maxAttempts && mountedRef.current) {
            const delay = Math.pow(2, attempt - 1) * 1000
            console.log(`Retrying in ${delay}ms...`)
            setTimeout(() => retryStatusCheck(attempt + 1, maxAttempts), delay)
          } else if (mountedRef.current) {
            console.error(`Failed to get ${provider} status after ${maxAttempts} attempts`)
            toast.error(`Failed to verify ${provider} connection. Please refresh the page.`)
            // Clear URL parameters to avoid re-triggering retries on re-render
            const newUrl = new URL(window.location.href)
            newUrl.searchParams.delete('connected')
            newUrl.searchParams.delete('integration')
            window.history.replaceState({}, '', newUrl.toString())
          }
        }
      }
      
      // Start the retry mechanism
      retryStatusCheck()
    }
  }, [location.search, provider, loadStatus])

  const handleConnect = async () => {
    if (provider === 'shopify') {
      setShowShopifyModal(true)
      return
    }

    setConnecting(true)
    try {
      const { authUrl } = await integrationService.connectProvider(provider, {})
      
      // Redirect to OAuth URL
      integrationService.redirectToOAuth(authUrl)
    } catch (error) {
      console.error(`Error connecting ${provider}:`, error)
      toast.error(`Failed to connect ${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    try {
      await integrationService.disconnectProvider(provider)
      if (mountedRef.current) {
        setStatus(null)
      }
      toast.success(`${provider} disconnected successfully`)
    } catch (error) {
      console.error(`Error disconnecting ${provider}:`, error)
      toast.error(`Failed to disconnect ${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  const handleSync = async () => {
    setLoading(true)
    try {
      await integrationService.syncProvider(provider)
      if (mountedRef.current) {
        await loadStatus() // Refresh status
      }
      toast.success(`${provider} sync completed`)
    } catch (error) {
      console.error(`Error syncing ${provider}:`, error)
      toast.error(`Failed to sync ${provider}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  const getStatusBadge = () => {
    if (!status) return null
    
    const statusConfig = {
      connected: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      connecting: { color: 'bg-yellow-100 text-yellow-800', icon: Loader2 },
      error: { color: 'bg-red-100 text-red-800', icon: XCircle },
      expired: { color: 'bg-orange-100 text-orange-800', icon: XCircle },
    }

    const config = statusConfig[status.status as keyof typeof statusConfig] || statusConfig.error
    const Icon = config.icon

    return (
      <Badge className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {status.status}
      </Badge>
    )
  }

  const getLastSyncText = () => {
    if (!status?.lastSyncAt) return 'Never synced'
    
    const lastSync = new Date(status.lastSyncAt)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - lastSync.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Synced recently'
    if (diffInHours < 24) return `Synced ${diffInHours}h ago`
    return `Synced ${Math.floor(diffInHours / 24)}d ago`
  }

  if (initialLoading) {
    return (
      <Card className="h-full surface">
        <CardHeader>
          <div className="flex items-center space-x-2">
            {icon}
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading integration...
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full surface">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {icon}
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <div className="text-sm text-muted-foreground">
            <p>Last sync: {getLastSyncText()}</p>
            {status.metadata && (
              <p className="mt-1">
                {provider === 'shopify' && status.metadata.shopDomain && (
                  <>Store: {status.metadata.shopDomain}</>
                )}
                {provider === 'klaviyo' && status.metadata.organizationName && (
                  <>Account: {status.metadata.organizationName}</>
                )}
              </p>
            )}
          </div>
        )}
        
        <div className="flex space-x-2">
          {!status ? (
            <Button 
              onClick={handleConnect} 
              disabled={connecting}
              className="flex-1"
            >
              {connecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Link className="w-4 h-4 mr-2" />
              Connect {provider}
            </Button>
          ) : (
            <>
              <Button 
                onClick={handleSync} 
                disabled={loading}
                variant="outline"
                className="flex-1"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync
              </Button>
              <Button 
                onClick={handleDisconnect} 
                disabled={loading}
                variant="outline"
                size="icon"
              >
                <Unlink className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
      
      {provider === 'shopify' && (
        <ShopifyConnectModal 
          open={showShopifyModal} 
          onOpenChange={setShowShopifyModal} 
        />
      )}
    </Card>
  )
}
