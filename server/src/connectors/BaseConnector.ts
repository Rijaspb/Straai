import { PrismaClient, Integration, SyncLog } from '@prisma/client'
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { TokenManager } from './TokenManager'
import * as crypto from 'crypto'

export interface OAuthConfig {
  clientId: string
  clientSecret: string
  authUrl: string
  tokenUrl: string
  redirectUri: string
  scopes: string[]
  pkceRequired?: boolean // Whether PKCE is required for this provider
}

export interface SyncResult {
  dataType: string
  recordsCount: number
  status: 'success' | 'error' | 'partial'
  errorMessage?: string
  metadata?: any
}

export interface ConnectorMetadata {
  [key: string]: any
}

export abstract class BaseConnector {
  protected prisma: PrismaClient
  protected tokenManager: TokenManager
  protected httpClient: AxiosInstance
  protected integration: Integration
  protected rateLimitDelay: number = 1000 // Default 1 second between requests

  constructor(integration: Integration, prisma: PrismaClient) {
    this.integration = integration
    this.prisma = prisma
    this.tokenManager = new TokenManager()
    
    // Create HTTP client with default configuration
    this.httpClient = axios.create({
      timeout: 30000, // 30 seconds
      headers: {
        'User-Agent': 'Straai/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })

    // Add request interceptor for authentication
    this.httpClient.interceptors.request.use(
      (config) => {
        // We'll handle authentication in the request itself
        return config
      },
      (error) => Promise.reject(error)
    )

    // Add response interceptor for error handling and token refresh
    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config: any = error.config || {}
        const shouldSkipRefresh = Boolean(config.skipAuthRefresh) || this.integration.id === 'temp'
        if (error.response?.status === 401 && !shouldSkipRefresh) {
          try {
            const newToken = await this.handleTokenRefresh()
            if (error.config) {
              error.config.headers.Authorization = `Bearer ${newToken}`
              return this.httpClient.request(error.config)
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError)
          }
        }
        return Promise.reject(error)
      }
    )
  }

  // Abstract methods that each connector must implement
  abstract getProvider(): string
  abstract getOAuthConfig(): OAuthConfig
  
  /**
   * Exchange OAuth authorization code for access tokens and account information.
   * 
   * CRITICAL: This method MUST return a valid accountId that uniquely identifies
   * the connected account in the provider's system. This accountId is used as the
   * primary key for database operations and must be consistent across all API calls.
   * 
   * Examples:
   * - Shopify: myshopify domain (e.g., "store-name.myshopify.com")
   * - Klaviyo: organization ID (e.g., "org_12345")
   * - GA4: property ID (e.g., "properties/123456789")
   * - Stripe: account ID (e.g., "acct_1234567890")
   */
  abstract exchangeCodeForTokens(code: string, state?: string, codeVerifier?: string): Promise<{
    accessToken: string
    refreshToken?: string
    expiresAt?: Date
    accountId: string  // REQUIRED: Must be a unique, stable identifier
    metadata?: ConnectorMetadata
  }>
  abstract refreshAccessToken(): Promise<{
    accessToken: string
    refreshToken?: string
    expiresAt?: Date
  }>
  abstract sync(): Promise<SyncResult[]>
  abstract validateConnection(): Promise<boolean>

  // Optional webhook handling
  async handleWebhook(payload: any): Promise<void> {
    // Default implementation - override in specific connectors
    console.log(`Webhook received for ${this.getProvider()}:`, payload)
  }

  // PKCE support methods
  public generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url')
  }

  protected generateCodeChallenge(codeVerifier: string): string {
    const hash = crypto.createHash('sha256')
    hash.update(codeVerifier)
    return hash.digest('base64url')
  }

  // OAuth flow initiation with PKCE support
  getAuthorizationUrl(state?: string, codeVerifier?: string): string {
    const config = this.getOAuthConfig()
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      response_type: 'code',
      ...(state && { state }),
    })

    // Add PKCE parameters if required
    if (config.pkceRequired && codeVerifier) {
      const codeChallenge = this.generateCodeChallenge(codeVerifier)
      params.append('code_challenge', codeChallenge)
      params.append('code_challenge_method', 'S256')
    }

    return `${config.authUrl}?${params.toString()}`
  }

  // Token management
  async getAccessToken(): Promise<string> {
    const decryptedToken = await this.tokenManager.decrypt(this.integration.accessToken)
    
    // Check if token is expired
    if (this.integration.expiresAt && new Date() >= this.integration.expiresAt) {
      return await this.handleTokenRefresh()
    }

    return decryptedToken
  }

  protected async handleTokenRefresh(): Promise<string> {
    try {
      const refreshResult = await this.refreshAccessToken()
      
      // Update integration with new tokens
      await this.prisma.integration.update({
        where: { id: this.integration.id },
        data: {
          accessToken: await this.tokenManager.encrypt(refreshResult.accessToken),
          refreshToken: refreshResult.refreshToken 
            ? await this.tokenManager.encrypt(refreshResult.refreshToken)
            : undefined,
          expiresAt: refreshResult.expiresAt,
          status: 'connected',
          updatedAt: new Date(),
        },
      })

      // Update local integration object
      this.integration.accessToken = await this.tokenManager.encrypt(refreshResult.accessToken)
      if (refreshResult.refreshToken) {
        this.integration.refreshToken = await this.tokenManager.encrypt(refreshResult.refreshToken)
      }
      if (refreshResult.expiresAt) {
        this.integration.expiresAt = refreshResult.expiresAt
      }

      return refreshResult.accessToken
    } catch (error) {
      if (this.integration.id !== 'temp') {
        await this.prisma.integration.update({
          where: { id: this.integration.id },
          data: { status: 'expired' },
        })
      }
      throw new Error(`Token refresh failed: ${error}`)
    }
  }

  // Request authentication
  protected async authenticateRequest(config: AxiosRequestConfig): Promise<AxiosRequestConfig> {
    const accessToken = await this.getAccessToken()
    
    if (!config.headers) {
      config.headers = {}
    }
    
    config.headers.Authorization = `Bearer ${accessToken}`
    return config
  }

  // Error handling with retry logic
  protected async handleResponseError(error: any): Promise<any> {
    const { response } = error

    if (!response) {
      throw error
    }

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers['retry-after'] 
        ? parseInt(response.headers['retry-after']) * 1000 
        : this.rateLimitDelay

      console.log(`Rate limited. Retrying after ${retryAfter}ms`)
      await this.delay(retryAfter)
      return this.httpClient.request(error.config)
    }

    // Handle unauthorized (token issues)
    if (response.status === 401) {
      try {
        const newToken = await this.handleTokenRefresh()
        error.config.headers.Authorization = `Bearer ${newToken}`
        return this.httpClient.request(error.config)
      } catch (refreshError) {
        throw new Error(`Authentication failed: ${refreshError}`)
      }
    }

    throw error
  }

  // Utility methods
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  protected async logSync(syncResult: SyncResult): Promise<SyncLog> {
    return await this.prisma.syncLog.create({
      data: {
        integrationId: this.integration.id,
        dataType: syncResult.dataType,
        status: syncResult.status,
        recordsCount: syncResult.recordsCount,
        errorMessage: syncResult.errorMessage,
        metadata: syncResult.metadata,
        completedAt: new Date(),
      },
    })
  }

  // Incremental sync helpers
  protected getLastSyncTime(dataType: string): Promise<Date | null> {
    return this.prisma.syncLog
      .findFirst({
        where: {
          integrationId: this.integration.id,
          dataType,
          status: 'success',
        },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      })
      .then(log => log?.completedAt || null)
  }

  // Update integration status
  protected async updateIntegrationStatus(status: string, lastSyncAt?: Date): Promise<void> {
    await this.prisma.integration.update({
      where: { id: this.integration.id },
      data: {
        status,
        ...(lastSyncAt && { lastSyncAt }),
        updatedAt: new Date(),
      },
    })
  }

  // Data normalization helpers
  protected normalizeTimestamp(timestamp: string | Date): Date {
    return typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  }

  protected normalizeAmount(amount: string | number): number {
    if (typeof amount === 'string') {
      return parseFloat(amount) || 0
    }
    return amount || 0
  }

  protected normalizeId(id: string | number): string {
    return typeof id === 'number' ? id.toString() : id
  }
}

