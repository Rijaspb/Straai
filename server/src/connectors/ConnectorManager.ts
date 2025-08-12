import { PrismaClient, Integration } from '@prisma/client'
import { BaseConnector } from './BaseConnector'
import { ShopifyConnector } from './ShopifyConnector'
import { KlaviyoConnector } from './KlaviyoConnector'
import { TokenManager } from './TokenManager'
import * as cron from 'node-cron'
import { withAdvisoryLock } from '../lib/schedulerLock'

export type SupportedProvider = 'shopify' | 'klaviyo' | 'ga4' | 'stripe' | 'meta'

export interface ConnectorFactory {
  [key: string]: (integration: Integration, prisma: PrismaClient) => BaseConnector
}

export class ConnectorManager {
  private prisma: PrismaClient
  private tokenManager: TokenManager
  private connectorFactories: ConnectorFactory

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
    this.tokenManager = new TokenManager()
    
    // Register available connectors
    this.connectorFactories = {
      shopify: (integration, prisma) => new ShopifyConnector(integration, prisma),
      klaviyo: (integration, prisma) => new KlaviyoConnector(integration, prisma),
      // Future connectors will be added here
      // ga4: (integration, prisma) => new GA4Connector(integration, prisma),
      // stripe: (integration, prisma) => new StripeConnector(integration, prisma),
      // meta: (integration, prisma) => new MetaConnector(integration, prisma),
    }

    // Initialize sync scheduler
    this.initializeSyncScheduler()
  }

  // Get available providers
  getAvailableProviders(): SupportedProvider[] {
    return Object.keys(this.connectorFactories) as SupportedProvider[]
  }

  // Create connector instance
  createConnector(integration: Integration): BaseConnector {
    const factory = this.connectorFactories[integration.provider]
    if (!factory) {
      throw new Error(`Unsupported provider: ${integration.provider}`)
    }
    return factory(integration, this.prisma)
  }

  // OAuth flow initiation
  async initiateOAuth(provider: SupportedProvider, userId: string, metadata?: any): Promise<{
    authUrl: string
    state: string
  }> {
    if (!this.connectorFactories[provider]) {
      throw new Error(`Provider ${provider} not supported`)
    }

    // Create a temporary integration record to get OAuth config
    const tempIntegration: Integration = {
      id: 'temp',
      userId,
      provider,
      accountId: 'temp',
      accessToken: 'temp',
      refreshToken: null,
      expiresAt: null,
      scopes: [],
      metadata: metadata || {},
      status: 'connecting',
      lastSyncAt: null,
      syncFrequency: 3600,
      webhookUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }

    const connector = this.createConnector(tempIntegration)
    const state = this.tokenManager.generateState()
    
    // Generate PKCE code_verifier if required
    let codeVerifier: string | undefined
    if (connector.getOAuthConfig().pkceRequired) {
      codeVerifier = connector.generateCodeVerifier()
    }
    
    const authUrl = connector.getAuthorizationUrl(state, codeVerifier)

    // Store state temporarily for validation, including code_verifier if PKCE is required
    await this.storeOAuthState(state, userId, provider, metadata, codeVerifier)

    return { authUrl, state }
  }

  // Handle OAuth callback
  async handleOAuthCallback(
    provider: SupportedProvider, 
    code: string, 
    state: string,
    callbackMetadata?: any
  ): Promise<Integration> {
    // Validate state and get stored OAuth info
    const oauthState = await this.validateOAuthState(state)
    if (!oauthState) {
      throw new Error('Invalid OAuth state')
    }

    // Create temporary integration for token exchange
    const tempIntegration: Integration = {
      id: 'temp',
      userId: oauthState.userId,
      provider,
      accountId: 'temp',
      accessToken: 'temp',
      refreshToken: null,
      expiresAt: null,
      scopes: [],
      metadata: { ...oauthState.metadata, ...callbackMetadata },
      status: 'connecting',
      lastSyncAt: null,
      syncFrequency: 3600,
      webhookUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }
    


    const connector = this.createConnector(tempIntegration)
    
    // Exchange code for tokens, passing the code_verifier if PKCE was used
    const tokenData = await connector.exchangeCodeForTokens(code, state, oauthState.codeVerifier)

    // CRITICAL: Ensure accountId is present before database operations
    // This accountId is used as the primary key for the integration record
    // and must be provided by every connector during OAuth token exchange
    if (!tokenData.accountId) {
      throw new Error(`Connector ${provider} failed to provide accountId during token exchange. This field is required for database operations.`)
    }

    // Encrypt tokens
    const encryptedAccessToken = await this.tokenManager.encrypt(tokenData.accessToken)
    const encryptedRefreshToken = tokenData.refreshToken 
      ? await this.tokenManager.encrypt(tokenData.refreshToken)
      : null

    // Create or update integration
    console.log('ConnectorManager handleOAuthCallback - About to upsert integration with:', {
      userId: oauthState.userId,
      provider,
      accountId: tokenData.accountId,
      hasAccessToken: !!tokenData.accessToken,
      hasRefreshToken: !!tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
      metadataKeys: Object.keys(tokenData.metadata || {})
    })
    
    const integration = await this.prisma.integration.upsert({
      where: {
        userId_provider_accountId: {
          userId: oauthState.userId,
          provider,
          accountId: tokenData.accountId,
        },
      },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: tokenData.expiresAt,
        metadata: { ...oauthState.metadata, ...callbackMetadata, ...tokenData.metadata },
        status: 'connected',
         deletedAt: null,
        scopes: connector.getOAuthConfig().scopes,
        updatedAt: new Date(),
      },
      create: {
        userId: oauthState.userId,
        provider,
        accountId: tokenData.accountId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: tokenData.expiresAt,
        metadata: { ...oauthState.metadata, ...callbackMetadata, ...tokenData.metadata },
        status: 'connected',
        scopes: connector.getOAuthConfig().scopes,
      },
    })

    console.log('ConnectorManager handleOAuthCallback - Database upsert completed:', {
      integrationId: integration.id,
      userId: integration.userId,
      provider: integration.provider,
      accountId: integration.accountId,
      status: integration.status,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt
    })

    // Clean up OAuth state
    await this.cleanupOAuthState(state)

    // If both Shopify and Klaviyo are connected for this user after this callback, enqueue Instant Insights
    try {
      const userId = integration.userId
      const [shopify, klaviyo] = await Promise.all([
        this.prisma.integration.findFirst({ where: { userId, provider: 'shopify', status: 'connected', deletedAt: null } }),
        this.prisma.integration.findFirst({ where: { userId, provider: 'klaviyo', status: 'connected', deletedAt: null } }),
      ])
      if (shopify && klaviyo) {
        // Touch a lightweight job trigger row to be picked by scheduler; or rely on updatedAt timestamps
        await this.prisma.user.update({ where: { id: userId }, data: { updatedAt: new Date() } })
      }
    } catch (e) {
      console.warn('Failed to enqueue Instant Insights post-OAuth:', e)
    }

    return integration
  }

  // Sync specific integration
  async syncIntegration(integrationId: string): Promise<void> {
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
    })

    if (!integration) {
      throw new Error('Integration not found')
    }

    if (integration.status !== 'connected') {
      throw new Error('Integration is not in connected state')
    }

    const connector = this.createConnector(integration)
    
    try {
      console.log(`Starting sync for ${integration.provider} integration ${integrationId}`)
      
      // Validate connection first
      const isValid = await connector.validateConnection()
      if (!isValid) {
        await this.prisma.integration.update({
          where: { id: integrationId },
          data: { status: 'error' },
        })
        throw new Error('Connection validation failed')
      }

      // Perform sync
      const results = await connector.sync()
      
      console.log(`Sync completed for ${integration.provider}:`, results)
    } catch (error) {
      console.error(`Sync failed for integration ${integrationId}:`, error)
      
      // Update integration status
      await this.prisma.integration.update({
        where: { id: integrationId },
        data: { 
          status: 'error',
          updatedAt: new Date(),
        },
      })
      
      throw error
    }
  }

  // Sync all user integrations
  async syncUserIntegrations(userId: string): Promise<void> {
    const integrations = await this.prisma.integration.findMany({
      where: {
        userId,
        status: 'connected',
        deletedAt: null,
      },
    })

    const syncPromises = integrations.map(integration => 
      this.syncIntegration(integration.id).catch(error => {
        console.error(`Failed to sync integration ${integration.id}:`, error)
      })
    )

    await Promise.all(syncPromises)
  }

  // Handle webhooks
  async handleWebhook(
    integrationId: string,
    payload: any
  ): Promise<void> {
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
    })

    if (!integration) {
      throw new Error('Integration not found')
    }

    // Handle webhook with the appropriate connector
    const connector = this.createConnector(integration)
    await connector.handleWebhook(payload)
  }

  // Get integration status
  async getIntegrationStatus(integrationId: string): Promise<{
    status: string
    lastSyncAt: Date | null
    lastError?: string
    syncLogs: any[]
  }> {
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
      include: {
        syncLogs: {
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!integration) {
      throw new Error('Integration not found')
    }

    const lastError = integration.syncLogs.find(log => log.status === 'error')

    return {
      status: integration.status,
      lastSyncAt: integration.lastSyncAt,
      lastError: lastError?.errorMessage || undefined,
      syncLogs: integration.syncLogs.map(log => ({
        dataType: log.dataType,
        status: log.status,
        recordsCount: log.recordsCount,
        errorMessage: log.errorMessage,
        startedAt: log.startedAt,
        completedAt: log.completedAt,
      })),
    }
  }

  // Disconnect integration
  async disconnectIntegration(integrationId: string): Promise<void> {
    await this.prisma.integration.update({
      where: { id: integrationId },
      data: {
        status: 'disconnected',
        deletedAt: new Date(),
      },
    })
  }

  // Initialize automatic sync scheduler
  private initializeSyncScheduler(): void {
    // Run every hour
    cron.schedule('0 * * * *', async () => {
      try {
        const ran = await withAdvisoryLock('connectors_scheduled_sync', async () => {
          console.log('Running scheduled sync for all integrations...')
          const integrations = await this.prisma.integration.findMany({
          where: {
            status: 'connected',
            deletedAt: null,
            // Only sync integrations that haven't been synced recently
            OR: [
              { lastSyncAt: null },
              {
                lastSyncAt: {
                  lt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
                },
              },
            ],
          },
        })

          for (const integration of integrations) {
            try {
              await this.syncIntegration(integration.id)
            } catch (error) {
              console.error(`Scheduled sync failed for integration ${integration.id}:`, error)
            }
          }
        })
        if (!ran) {
          console.log('⏭️  Skipping scheduled connector sync, another instance holds the lock')
        }
      } catch (error) {
        console.error('Scheduled sync error:', error)
      }
    })

    console.log('✅ Sync scheduler initialized')
  }

  // OAuth state management
  private async storeOAuthState(
    state: string, 
    userId: string, 
    provider: string, 
    metadata?: any,
    codeVerifier?: string
  ): Promise<void> {
    const stateData = {
      userId,
      provider,
      metadata,
      codeVerifier,
      createdAt: new Date(),
    }
    
    await this.prisma.oAuthState.upsert({
      where: { state },
      update: {
        data: JSON.stringify(stateData),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
      create: {
        state,
        data: JSON.stringify(stateData),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    })
  }

  private async validateOAuthState(state: string): Promise<{
    userId: string
    provider: string
    metadata?: any
    codeVerifier?: string
  } | null> {
    try {
      const oauthState = await this.prisma.oAuthState.findUnique({
        where: { 
          state,
        },
      })

      if (!oauthState || oauthState.expiresAt < new Date()) {
        return null
      }

      const parsedStateData = JSON.parse(oauthState.data)
      return {
        userId: parsedStateData.userId,
        provider: parsedStateData.provider,
        metadata: parsedStateData.metadata,
        codeVerifier: parsedStateData.codeVerifier,
      }
    } catch (error) {
      console.error('OAuth state validation error:', error)
      return null
    }
  }

  private async cleanupOAuthState(state: string): Promise<void> {
    await this.prisma.oAuthState.delete({
      where: { state },
    }).catch(() => {
      // Ignore errors if state doesn't exist
    })
  }
}
