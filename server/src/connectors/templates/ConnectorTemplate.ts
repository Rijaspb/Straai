import { BaseConnector, OAuthConfig, SyncResult, ConnectorMetadata } from '../BaseConnector'
import { PrismaClient, Integration } from '@prisma/client'

/**
 * Template for creating new connectors
 * 
 * To add a new connector (e.g., GA4, Stripe, Meta):
 * 1. Copy this template and rename the class
 * 2. Implement all abstract methods
 * 3. Add provider-specific API calls
 * 4. Register in ConnectorManager
 * 5. Add environment variables
 * 6. Test OAuth flow and data sync
 */

interface NewProviderTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  // Add provider-specific fields
}

interface NewProviderAccount {
  id: string
  // Add provider-specific account fields
}

export class NewProviderConnector extends BaseConnector {
  private readonly baseUrl = 'https://api.newprovider.com'
  private readonly apiVersion = 'v1'

  constructor(integration: Integration, prisma: PrismaClient) {
    super(integration, prisma)
    // Set provider-specific rate limits
    this.rateLimitDelay = 1000 // Adjust based on provider's rate limits
  }

  getProvider(): string {
    return 'new_provider' // Change to actual provider name
  }

  getOAuthConfig(): OAuthConfig {
    return {
      clientId: process.env.NEW_PROVIDER_CLIENT_ID!,
      clientSecret: process.env.NEW_PROVIDER_CLIENT_SECRET!,
      authUrl: 'https://auth.newprovider.com/oauth/authorize',
      tokenUrl: 'https://auth.newprovider.com/oauth/token',
      redirectUri: `${process.env.API_BASE_URL}/integrations/new_provider/callback`,
      scopes: [
        'read:data',
        'read:analytics',
        // Add required scopes
      ],
    }
  }

  async exchangeCodeForTokens(code: string, _state?: string): Promise<{
    accessToken: string
    refreshToken?: string
    expiresAt?: Date
    accountId: string
    metadata?: ConnectorMetadata
  }> {
    const config = this.getOAuthConfig()
    
    try {
      const response = await this.httpClient.post<NewProviderTokenResponse>(
        config.tokenUrl,
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.redirectUri,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }
      )

      const { access_token, refresh_token, expires_in } = response.data

      // Get account information
      const accountInfo = await this.fetchAccountInfo(access_token)

      const expiresAt = expires_in 
        ? new Date(Date.now() + expires_in * 1000) 
        : undefined

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        accountId: accountInfo.id, // CRITICAL: This must be a unique, stable identifier
        metadata: {
          // Add provider-specific metadata
          // Common fields: organizationName, timezone, currency, scopes
        },
      }
    } catch (error) {
      throw new Error(`New Provider token exchange failed: ${error}`)
    }
  }

  async refreshAccessToken(): Promise<{
    accessToken: string
    refreshToken?: string
    expiresAt?: Date
  }> {
    const config = this.getOAuthConfig()
    const refreshToken = await this.tokenManager.decrypt(this.integration.refreshToken!)

    try {
      const response = await this.httpClient.post<NewProviderTokenResponse>(
        config.tokenUrl,
        {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }
      )

      const { access_token, refresh_token, expires_in } = response.data
      const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : undefined

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
      }
    } catch (error) {
      throw new Error(`New Provider token refresh failed: ${error}`)
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.fetchAccountInfo()
      return true
    } catch (error) {
      console.error('New Provider connection validation failed:', error)
      return false
    }
  }

  async sync(): Promise<SyncResult[]> {
    const results: SyncResult[] = []

    try {
      // Sync different data types
      results.push(await this.syncDataType1())
      results.push(await this.syncDataType2())
      // Add more sync methods as needed

      await this.updateIntegrationStatus('connected', new Date())
    } catch (error) {
      console.error('New Provider sync failed:', error)
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

  private async fetchAccountInfo(accessToken?: string): Promise<NewProviderAccount> {
    const token = accessToken || await this.getAccessToken()

    const response = await this.httpClient.get<NewProviderAccount>(
      `${this.baseUrl}/${this.apiVersion}/account`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    )

    return response.data
  }

  private async syncDataType1(): Promise<SyncResult> {
    try {
      const lastSync = await this.getLastSyncTime('data_type_1')
      let page = 1
      let totalRecords = 0

      while (true) {
        const response = await this.httpClient.get(`${this.baseUrl}/${this.apiVersion}/data_type_1`, {
          headers: {
            'Authorization': `Bearer ${await this.getAccessToken()}`,
          },
          params: {
            page,
            limit: 100,
            ...(lastSync && { updated_since: lastSync.toISOString() }),
          },
        })

        const data = response.data.data || []
        
        if (data.length === 0) {
          break
        }

        for (const item of data) {
          await this.storeDataType1(item)
          totalRecords++
        }

        page++
        await this.delay(this.rateLimitDelay)
      }

      const result: SyncResult = {
        dataType: 'data_type_1',
        recordsCount: totalRecords,
        status: 'success',
      }

      await this.logSync(result)
      return result
    } catch (error) {
      const result: SyncResult = {
        dataType: 'data_type_1',
        recordsCount: 0,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      }

      await this.logSync(result)
      return result
    }
  }

  private async syncDataType2(): Promise<SyncResult> {
    // Similar implementation for other data types
    const result: SyncResult = {
      dataType: 'data_type_2',
      recordsCount: 0,
      status: 'success',
    }

    await this.logSync(result)
    return result
  }

  private async storeDataType1(item: any): Promise<void> {
    // Store data in normalized format
    console.log(`Processing data item: ${item.id}`)
    
    // Example of storing in database:
    // await this.prisma.customTable.upsert({
    //   where: { externalId: item.id },
    //   update: { ...normalizedData },
    //   create: { ...normalizedData },
    // })
  }

  // Webhook handling (optional)
  async handleWebhook(payload: any): Promise<void> {
    const eventType = payload.type || 'unknown'
    
    switch (eventType) {
      case 'data.created':
      case 'data.updated':
        await this.handleDataWebhook(payload)
        break
      default:
        console.log(`Unhandled webhook event: ${eventType}`)
    }
  }

  private async handleDataWebhook(data: any): Promise<void> {
    console.log(`Processing webhook data: ${data.id}`)
    // Process webhook data in real-time
  }
}

/**
 * Steps to implement a new connector:
 * 
 * 1. Environment Variables:
 *    - Add NEW_PROVIDER_CLIENT_ID and NEW_PROVIDER_CLIENT_SECRET to .env
 * 
 * 2. Register in ConnectorManager:
 *    - Add to connectorFactories object
 *    - Add to SupportedProvider type
 * 
 * 3. Database Tables (if needed):
 *    - Create Prisma models for normalized data storage
 *    - Run database migration
 * 
 * 4. API Endpoints:
 *    - Endpoints are auto-generated based on provider name
 *    - Add provider-specific routes if needed
 * 
 * 5. Testing:
 *    - Test OAuth flow
 *    - Test data synchronization
 *    - Test webhook handling
 *    - Test error scenarios
 * 
 * 6. Documentation:
 *    - Update README with new provider setup instructions
 *    - Document provider-specific configuration
 */

