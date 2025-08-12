import { BaseConnector, OAuthConfig, SyncResult, ConnectorMetadata } from './BaseConnector'
import { PrismaClient, Integration } from '@prisma/client'

interface KlaviyoTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

interface KlaviyoAccount {
  id: string
  attributes: {
    contact_information: {
      organization_name: string
      street_address: string
      city: string
      region: string
      country: string
      zip_code: string
      phone_number: string
    }
    industry: string
    timezone: string
    preferred_currency: string
  }
}

interface KlaviyoCampaign {
  id: string
  attributes: {
    name: string
    status: string
    archived: boolean
    audiences: {
      included: string[]
      excluded: string[]
    }
    send_options: {
      use_smart_sending: boolean
      is_transactional: boolean
    }
    tracking_options: {
      is_add_utm: boolean
      utm_params: Array<{
        name: string
        value: string
      }>
    }
    send_strategy: {
      method: string
      options_static: {
        datetime: string
        is_local: boolean
        send_past_recipients_immediately: boolean
      }
    }
    created_at: string
    scheduled_at?: string
    updated_at: string
  }
}

export class KlaviyoConnector extends BaseConnector {
  private readonly baseUrl = 'https://a.klaviyo.com/api'
  private readonly apiVersion = '2023-12-15'

  constructor(integration: Integration, prisma: PrismaClient) {
    super(integration, prisma)
    this.rateLimitDelay = 100 // Klaviyo: 10 requests per second for most endpoints
  }

  getProvider(): string {
    return 'klaviyo'
  }

  getOAuthConfig(): OAuthConfig {
    const config = {
      clientId: process.env.KLAVIYO_CLIENT_ID!,
      clientSecret: process.env.KLAVIYO_CLIENT_SECRET!,
      authUrl: 'https://www.klaviyo.com/oauth/authorize',
      tokenUrl: 'https://a.klaviyo.com/oauth/token',
      redirectUri: `${process.env.API_BASE_URL}/api/integrations/klaviyo/callback`,
      scopes: [
        'accounts:read',
        'campaigns:read',
        'flows:read',
        'lists:read',
        'metrics:read',
        'profiles:read',
        'events:read',
        'segments:read',
        'templates:read'
      ],
      pkceRequired: true, // Klaviyo requires PKCE
    }
    
    console.log('Klaviyo OAuth Config:', {
      clientId: config.clientId ? `${config.clientId.substring(0, 10)}...` : 'undefined',
      clientSecret: config.clientSecret ? '***' : 'undefined',
      redirectUri: config.redirectUri,
      apiBaseUrl: process.env.API_BASE_URL,
      clientUrl: process.env.CLIENT_URL
    })
    
    return config
  }

  async exchangeCodeForTokens(code: string, _state?: string, codeVerifier?: string): Promise<{
    accessToken: string
    refreshToken?: string
    expiresAt?: Date
    accountId: string
    metadata?: ConnectorMetadata
  }> {
    const config = this.getOAuthConfig()
    
    try {
      const params = new URLSearchParams()
      params.append('grant_type', 'authorization_code')
      params.append('code', code)
      params.append('redirect_uri', config.redirectUri)
      if (codeVerifier) {
        params.append('code_verifier', codeVerifier)
      }

      const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
      const response = await this.httpClient.post<KlaviyoTokenResponse>(
        config.tokenUrl,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`,
          },
          // prevent interceptor refresh loop during OAuth
          skipAuthRefresh: true as any,
        } as any
      )

      const { access_token, refresh_token, expires_in, scope } = response.data

      // Get account information
      const accountInfo = await this.fetchAccountInfo(access_token)
      console.log('Klaviyo exchangeCodeForTokens - Account info received:', {
        id: accountInfo.id,
        hasAttributes: !!accountInfo.attributes,
        organizationName: accountInfo.attributes?.contact_information?.organization_name
      })

      const expiresAt = new Date(Date.now() + expires_in * 1000)

      const result = {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        accountId: accountInfo.id,
        metadata: {
          organizationName: accountInfo.attributes.contact_information.organization_name,
          industry: accountInfo.attributes.industry,
          timezone: accountInfo.attributes.timezone,
          currency: accountInfo.attributes.preferred_currency,
          scopes: scope.split(' '),
        },
      }
      
      console.log('Klaviyo exchangeCodeForTokens - Returning result:', {
        hasAccessToken: !!result.accessToken,
        hasRefreshToken: !!result.refreshToken,
        expiresAt: result.expiresAt,
        accountId: result.accountId,
        metadataKeys: Object.keys(result.metadata || {})
      })
      
      return result
    } catch (error: any) {
      const detail = error?.response?.data ? JSON.stringify(error.response.data) : String(error)
      throw new Error(`Klaviyo token exchange failed: ${detail}`)
    }
  }

  async refreshAccessToken(): Promise<{
    accessToken: string
    refreshToken?: string
    expiresAt?: Date
  }> {
    const config = this.getOAuthConfig()
    const refreshTokenEncrypted = this.integration.refreshToken
    if (!refreshTokenEncrypted) {
      throw new Error('Missing refresh token')
    }
    const refreshToken = await this.tokenManager.decrypt(refreshTokenEncrypted)

    try {
      const params = new URLSearchParams()
      params.append('grant_type', 'refresh_token')
      params.append('refresh_token', refreshToken)

      const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
      const response = await this.httpClient.post<KlaviyoTokenResponse>(
        config.tokenUrl,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`,
          },
          // prevent interceptor recursion on refresh
          skipAuthRefresh: true as any,
        } as any
      )

      const { access_token, refresh_token, expires_in } = response.data
      const expiresAt = new Date(Date.now() + expires_in * 1000)

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
      }
    } catch (error: any) {
      const detail = error?.response?.data ? JSON.stringify(error.response.data) : String(error)
      throw new Error(`Klaviyo token refresh failed: ${detail}`)
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.fetchAccountInfo()
      return true
    } catch (error) {
      console.error('Klaviyo connection validation failed:', error)
      return false
    }
  }

  async sync(): Promise<SyncResult[]> {
    const results: SyncResult[] = []

    try {
      // Sync different data types
      results.push(await this.syncCampaigns())
      results.push(await this.syncFlows())
      results.push(await this.syncMetrics())
      results.push(await this.syncEvents())

      await this.updateIntegrationStatus('connected', new Date())
    } catch (error) {
      console.error('Klaviyo sync failed:', error)
      await this.updateIntegrationStatus('error')
      
      results.push({
        dataType: 'sync_error',
        recordsCount: 0,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
    }

    return results
  }

  private async fetchAccountInfo(accessToken?: string): Promise<KlaviyoAccount> {
    const token = accessToken || await this.getAccessToken()
    
    console.log('Klaviyo fetchAccountInfo - Starting with token:', token ? `${token.substring(0, 20)}...` : 'undefined')

    try {
      const response = await this.httpClient.get<{ data: any }>(
        `${this.baseUrl}/accounts/`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Revision': this.apiVersion,
          },
        }
      )

      console.log('Klaviyo fetchAccountInfo - Raw response:', JSON.stringify(response.data, null, 2))

      const payload = response.data.data
      console.log('Klaviyo fetchAccountInfo - Payload:', JSON.stringify(payload, null, 2))
      
      const account: KlaviyoAccount | undefined = Array.isArray(payload) ? payload[0] : payload
      console.log('Klaviyo fetchAccountInfo - Extracted account:', JSON.stringify(account, null, 2))
      
      if (!account || !account.attributes) {
        console.error('Klaviyo fetchAccountInfo - Invalid account structure:', account)
        throw new Error('Klaviyo accounts response did not include account attributes')
      }
      
      console.log('Klaviyo fetchAccountInfo - Success, returning account with ID:', account.id)
      return account
    } catch (error) {
      console.error('Klaviyo fetchAccountInfo - Error:', error)
      throw error
    }
  }

  private async syncCampaigns(): Promise<SyncResult> {
    try {
      let nextUrl: string | null = `${this.baseUrl}/campaigns/`
      let totalCampaigns = 0

      while (nextUrl) {
        const response: { data: { data: KlaviyoCampaign[]; links: { next?: string } } } = await this.httpClient.get<{
          data: KlaviyoCampaign[]
          links: { next?: string }
        }>(nextUrl, {
          headers: {
            'Authorization': `Bearer ${await this.getAccessToken()}`,
            'Revision': this.apiVersion,
          },
          params: {
            'page[size]': 50,
            'filter': 'greater-than(created,2023-01-01T00:00:00Z)',
          },
        })

        const campaigns = response.data.data
        
        for (const campaign of campaigns) {
          await this.storeCampaign(campaign)
          totalCampaigns++
        }

        nextUrl = response.data.links.next || null
        await this.delay(this.rateLimitDelay)
      }

      const result: SyncResult = {
        dataType: 'campaigns',
        recordsCount: totalCampaigns,
        status: 'success',
      }

      await this.logSync(result)
      return result
    } catch (error) {
      const result: SyncResult = {
        dataType: 'campaigns',
        recordsCount: 0,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      }

      await this.logSync(result)
      return result
    }
  }

  private async syncFlows(): Promise<SyncResult> {
    try {
      let nextUrl: string | null = `${this.baseUrl}/flows/`
      let totalFlows = 0

      while (nextUrl) {
        const response: { data: { data: any[]; links: { next?: string } } } = await this.httpClient.get<{
          data: any[]
          links: { next?: string }
        }>(nextUrl, {
          headers: {
            'Authorization': `Bearer ${await this.getAccessToken()}`,
            'Revision': this.apiVersion,
          },
          params: {
            'page[size]': 50,
          },
        })

        const flows = response.data.data
        
        for (const flow of flows) {
          await this.storeFlow(flow)
          totalFlows++
        }

        nextUrl = response.data.links.next || null
        await this.delay(this.rateLimitDelay)
      }

      const result: SyncResult = {
        dataType: 'flows',
        recordsCount: totalFlows,
        status: 'success',
      }

      await this.logSync(result)
      return result
    } catch (error) {
      const result: SyncResult = {
        dataType: 'flows',
        recordsCount: 0,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      }

      await this.logSync(result)
      return result
    }
  }

  private async syncMetrics(): Promise<SyncResult> {
    try {
      const response = await this.httpClient.get<{
        data: any[]
      }>(`${this.baseUrl}/metrics/`, {
        headers: {
          'Authorization': `Bearer ${await this.getAccessToken()}`,
          'Revision': this.apiVersion,
        },
        params: {
          'page[size]': 100,
        },
      })

      const metrics = response.data.data
      
      for (const metric of metrics) {
        await this.storeMetric(metric)
      }

      const result: SyncResult = {
        dataType: 'metrics',
        recordsCount: metrics.length,
        status: 'success',
      }

      await this.logSync(result)
      return result
    } catch (error) {
      const result: SyncResult = {
        dataType: 'metrics',
        recordsCount: 0,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      }

      await this.logSync(result)
      return result
    }
  }

  private async syncEvents(): Promise<SyncResult> {
    try {
      const lastSync = await this.getLastSyncTime('events')
      let nextUrl: string | null = `${this.baseUrl}/events/`
      let totalEvents = 0

      const params: any = {
        'page[size]': 100,
        'sort': '-datetime',
      }

      if (lastSync) {
        params['filter'] = `greater-than(datetime,${lastSync.toISOString()})`
      }

      while (nextUrl) {
        const response: { data: { data: any[]; links: { next?: string } } } = await this.httpClient.get<{
          data: any[]
          links: { next?: string }
        }>(nextUrl, {
          headers: {
            'Authorization': `Bearer ${await this.getAccessToken()}`,
            'Revision': this.apiVersion,
          },
          params,
        })

        const events = response.data.data
        
        for (const event of events) {
          await this.storeEvent(event)
          totalEvents++
        }

        nextUrl = response.data.links.next || null
        await this.delay(this.rateLimitDelay)
      }

      const result: SyncResult = {
        dataType: 'events',
        recordsCount: totalEvents,
        status: 'success',
      }

      await this.logSync(result)
      return result
    } catch (error) {
      const result: SyncResult = {
        dataType: 'events',
        recordsCount: 0,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      }

      await this.logSync(result)
      return result
    }
  }

  // Revenue attribution logic
  async attributeRevenue(orderId: string, orderData: any): Promise<void> {
    try {
      // Look for UTM parameters and customer email in order
      const customerEmail = orderData.email
      const utmSource = orderData.utm_source
      const utmMedium = orderData.utm_medium
      const utmCampaign = orderData.utm_campaign

      if (!customerEmail) return

      // Find Klaviyo events for this customer around the order time
      const orderTime = new Date(orderData.created_at)
      const lookbackTime = new Date(orderTime.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days

      const events = await this.getCustomerEvents(customerEmail, lookbackTime, orderTime)
      
      // Attribution logic
      const attribution = this.calculateAttribution(events, {
        utmSource,
        utmMedium,
        utmCampaign,
        orderValue: parseFloat(orderData.total_price || '0'),
      })

      await this.storeRevenuneAttribution(orderId, attribution)
    } catch (error) {
      console.error('Revenue attribution failed:', error)
    }
  }

  private async getCustomerEvents(email: string, startDate: Date, endDate: Date): Promise<any[]> {
    // Fetch customer events within date range
    const response = await this.httpClient.get<{ data: any[] }>(`${this.baseUrl}/events/`, {
      headers: {
        'Authorization': `Bearer ${await this.getAccessToken()}`,
        'Revision': this.apiVersion,
      },
      params: {
        'filter': `equals(profile.email,"${email}") and greater-than(datetime,${startDate.toISOString()}) and less-than(datetime,${endDate.toISOString()})`,
        'sort': '-datetime',
        'page[size]': 100,
      },
    })

    return response.data.data
  }

  private calculateAttribution(events: any[], orderInfo: any): any {
    // Simple last-click attribution with campaign precedence
    const campaignEvents = events.filter(e => 
      e.attributes.metric.data.attributes.name === 'Clicked Email' ||
      e.attributes.metric.data.attributes.name === 'Received Email'
    )

    if (campaignEvents.length > 0) {
      const lastCampaignEvent = campaignEvents[0] // Already sorted by -datetime
      return {
        type: 'klaviyo_campaign',
        campaignId: lastCampaignEvent.relationships?.campaign?.data?.id,
        touchpointTime: lastCampaignEvent.attributes.datetime,
        orderValue: orderInfo.orderValue,
      }
    }

    if (orderInfo.utmSource || orderInfo.utmMedium || orderInfo.utmCampaign) {
      return {
        type: 'utm_attribution',
        utmSource: orderInfo.utmSource,
        utmMedium: orderInfo.utmMedium,
        utmCampaign: orderInfo.utmCampaign,
        orderValue: orderInfo.orderValue,
      }
    }

    return {
      type: 'direct',
      orderValue: orderInfo.orderValue,
    }
  }

  private async storeCampaign(campaign: KlaviyoCampaign): Promise<void> {
    console.log(`Processing Klaviyo campaign: ${campaign.attributes.name}`)
    // Store campaign in normalized format
  }

  private async storeFlow(flow: any): Promise<void> {
    console.log(`Processing Klaviyo flow: ${flow.attributes.name}`)
    // Store flow in normalized format
  }

  private async storeMetric(metric: any): Promise<void> {
    console.log(`Processing Klaviyo metric: ${metric.attributes.name}`)
    // Store metric in normalized format
  }

  private async storeEvent(event: any): Promise<void> {
    console.log(`Processing Klaviyo event: ${event.attributes.metric.data.attributes.name}`)
    // Store event in normalized format
  }

  private async storeRevenuneAttribution(orderId: string, attribution: any): Promise<void> {
    console.log(`Storing revenue attribution for order ${orderId}:`, attribution)
    // Store attribution data
  }

  // Webhook handling
  async handleWebhook(payload: any): Promise<void> {
    // Klaviyo doesn't send topic headers like Shopify, so we need to determine the type from payload
    console.log('Processing Klaviyo webhook:', payload)
  }
}

