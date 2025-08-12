import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { integrationService } from '@/services/integrationService'
import { toast } from 'sonner'

interface ShopifyConnectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShopifyConnectModal({ open, onOpenChange }: ShopifyConnectModalProps) {
  const [shopDomain, setShopDomain] = useState('')
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    if (!shopDomain.trim()) {
      toast.error('Please enter your Shopify shop domain')
      return
    }

    // Validate shop domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/
    if (!domainRegex.test(shopDomain.trim())) {
      toast.error('Please enter a valid Shopify shop domain (e.g., your-store.myshopify.com)')
      return
    }

    setLoading(true)
    try {
      const { authUrl } = await integrationService.connectProvider('shopify', {
        shopDomain: shopDomain.trim()
      })
      
      // Redirect to OAuth URL
      integrationService.redirectToOAuth(authUrl)
    } catch (error) {
      console.error('Error connecting Shopify:', error)
      toast.error(`Failed to connect Shopify: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConnect()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md surface">
        <DialogHeader>
          <DialogTitle>Connect Shopify Store</DialogTitle>
          <DialogDescription>
            Enter your Shopify shop domain to connect your store and start analyzing your data.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shop-domain">Shop Domain</Label>
            <Input
              id="shop-domain"
              placeholder="your-store.myshopify.com"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
            <p className="text-sm text-muted-foreground">
              You can find this in your Shopify admin URL
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={loading || !shopDomain.trim()}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Connect Store
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
