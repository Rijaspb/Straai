import { BaseConnector, OAuthConfig, SyncResult, ConnectorMetadata } from './BaseConnector'
import { PrismaClient, Integration } from '@prisma/client'
import { GraphQLClient, gql } from 'graphql-request'

interface ShopifyTokenResponse {
  access_token: string
  scope: string
}

interface ShopifyShop {
  id: string
  name: string
  myshopifyDomain: string
  email: string
  currency: string
  timezone: string
}

interface ShopifyOrder {
  id: string
  name: string
  email?: string
  totalPrice: string
  subtotalPrice: string
  totalTax: string
  currencyCode: string
  processedAt: string
  customer?: {
    id: string
    email?: string
    firstName?: string
    lastName?: string
  }
  lineItems: {
    edges: Array<{
      node: {
        id: string
        title: string
        quantity: number
        variant: {
          id: string
          price: string
          product: {
            id: string
            title: string
          }
        }
      }
    }>
  }
}

export class ShopifyConnector extends BaseConnector {
  private graphqlClient: GraphQLClient | null = null

  constructor(integration: Integration, prisma: PrismaClient) {
    super(integration, prisma)
    this.rateLimitDelay = 500 // Shopify: 2 calls per second
  }

  getProvider(): string {
    return 'shopify'
  }

  getOAuthConfig(): OAuthConfig {
    const metadata = this.integration.metadata as any
    const shopDomain = metadata?.shopDomain as string
    if (!shopDomain) {
      throw new Error('Shop domain not found in integration metadata')
    }

    return {
      clientId: process.env.SHOPIFY_CLIENT_ID!,
      clientSecret: process.env.SHOPIFY_CLIENT_SECRET!,
      authUrl: `https://${shopDomain}/admin/oauth/authorize`,
      tokenUrl: `https://${shopDomain}/admin/oauth/access_token`,
      redirectUri: `${process.env.API_BASE_URL}/api/integrations/shopify/callback`,
      scopes: [
        'read_orders',
        'read_products',
        'read_customers',
        'read_analytics',
        'read_inventory',
        'read_fulfillments'
      ],
    }
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
      params.append('client_id', config.clientId)
      params.append('client_secret', config.clientSecret)
      if (codeVerifier) {
        params.append('code_verifier', codeVerifier)
      }

      const response = await this.httpClient.post<ShopifyTokenResponse>(
        config.tokenUrl,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          // prevent interceptor refresh loop during OAuth
          skipAuthRefresh: true as any,
        } as any
      )

      const { access_token, scope } = response.data

      // Get shop information - use shopDomain from integration metadata
      const metadata = this.integration.metadata as any
      const shopDomain = metadata?.shopDomain as string
      

      
      if (!shopDomain) {
        throw new Error('Shop domain not available in integration metadata for token exchange')
      }
      
      const shopInfo = await this.fetchShopInfo(access_token, shopDomain)
      


      return {
        accessToken: access_token,
        refreshToken: undefined, // Shopify doesn't provide refresh tokens
        expiresAt: undefined, // Shopify access tokens don't expire
        accountId: shopInfo.myshopifyDomain,
        metadata: {
          shopName: shopInfo.name,
          shopDomain: shopInfo.myshopifyDomain,
          scopes: scope.split(','),
        },
      }
    } catch (error: any) {
      const detail = error?.response?.data ? JSON.stringify(error.response.data) : String(error)
      throw new Error(`Shopify token exchange failed: ${detail}`)
    }
  }

  async refreshAccessToken(): Promise<{
    accessToken: string
    refreshToken?: string
    expiresAt?: Date
  }> {
    // Shopify access tokens don't expire, so just return the current token
    const currentToken = await this.tokenManager.decrypt(this.integration.accessToken)
    return {
      accessToken: currentToken,
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.fetchShopInfo()
      return true
    } catch (error) {
      console.error('Shopify connection validation failed:', error)
      return false
    }
  }

  async sync(): Promise<SyncResult[]> {
    const results: SyncResult[] = []

    try {
      // Initialize GraphQL client
      await this.initializeGraphQLClient()

      // Sync different data types
      results.push(await this.syncOrders())
      results.push(await this.syncProducts())
      results.push(await this.syncCustomers())

      await this.updateIntegrationStatus('connected', new Date())
    } catch (error) {
      console.error('Shopify sync failed:', error)
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

  private async initializeGraphQLClient(): Promise<void> {
    const metadata = this.integration.metadata as any
    const shopDomain = metadata?.shopDomain as string
    const accessToken = await this.getAccessToken()

    this.graphqlClient = new GraphQLClient(
      `https://${shopDomain}/admin/api/2023-10/graphql.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    )
  }

  private async fetchShopInfo(accessToken?: string, shopDomain?: string): Promise<ShopifyShop> {
    const token = accessToken || await this.getAccessToken()
    
    // Use provided shopDomain or get from integration metadata
    let domain = shopDomain
    if (!domain) {
      const metadata = this.integration.metadata as any
      domain = metadata?.shopDomain as string
    }
    
    if (!domain) {
      throw new Error('Shop domain not available for fetching shop info')
    }
    


    const response = await this.httpClient.get<{ shop: any }>(
      `https://${domain}/admin/api/2023-10/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': token,
        },
      }
    )
    


    const raw = response.data.shop
    const normalized: ShopifyShop = {
      id: String(raw.id),
      name: raw.name,
      myshopifyDomain: raw.myshopify_domain || raw.domain,
      email: raw.email,
      currency: raw.currency,
      timezone: raw.iana_timezone || raw.timezone,
    }

    return normalized
  }

  private async syncOrders(): Promise<SyncResult> {
    try {
      const lastSync = await this.getLastSyncTime('orders')
      const query = gql`
        query getOrders($first: Int!, $after: String, $updatedAtMin: DateTime) {
          orders(first: $first, after: $after, query: $updatedAtMin) {
            edges {
              node {
                id
                name
                email
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                subtotalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                totalTaxSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                processedAt
                customer {
                  id
                  email
                  firstName
                  lastName
                }
                lineItems(first: 100) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      variant {
                        id
                        price
                        product {
                          id
                          title
                        }
                      }
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `

      let hasNextPage = true
      let cursor: string | null = null
      let totalOrders = 0

      while (hasNextPage) {
        const variables: any = {
          first: 50,
          ...(cursor && { after: cursor }),
          ...(lastSync && { updatedAtMin: lastSync.toISOString() }),
        }

        const response = await this.graphqlClient!.request<{
          orders: {
            edges: Array<{ node: ShopifyOrder }>
            pageInfo: { hasNextPage: boolean; endCursor: string }
          }
        }>(query, variables)

        const orders = response.orders.edges.map(edge => edge.node)
        
        // Process and store orders
        for (const order of orders) {
          await this.storeOrder(order)
          totalOrders++
        }

        hasNextPage = response.orders.pageInfo.hasNextPage
        cursor = response.orders.pageInfo.endCursor

        // Rate limiting
        await this.delay(this.rateLimitDelay)
      }

      const result: SyncResult = {
        dataType: 'orders',
        recordsCount: totalOrders,
        status: 'success',
      }

      await this.logSync(result)
      return result
    } catch (error) {
      const result: SyncResult = {
        dataType: 'orders',
        recordsCount: 0,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      }

      await this.logSync(result)
      return result
    }
  }

  private async syncProducts(): Promise<SyncResult> {
    try {
      const query = gql`
        query getProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) {
            edges {
              node {
                id
                title
                handle
                status
                productType
                vendor
                createdAt
                updatedAt
                variants(first: 100) {
                  edges {
                    node {
                      id
                      title
                      price
                      sku
                      inventoryQuantity
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `

      let hasNextPage = true
      let cursor: string | null = null
      let totalProducts = 0

      while (hasNextPage) {
        const variables: any = {
          first: 50,
          ...(cursor && { after: cursor }),
        }

        const response = await this.graphqlClient!.request<{
          products: {
            edges: Array<{ node: any }>
            pageInfo: { hasNextPage: boolean; endCursor: string }
          }
        }>(query, variables)

        const products = response.products.edges.map(edge => edge.node)
        
        for (const product of products) {
          await this.storeProduct(product)
          totalProducts++
        }

        hasNextPage = response.products.pageInfo.hasNextPage
        cursor = response.products.pageInfo.endCursor

        await this.delay(this.rateLimitDelay)
      }

      const result: SyncResult = {
        dataType: 'products',
        recordsCount: totalProducts,
        status: 'success',
      }

      await this.logSync(result)
      return result
    } catch (error) {
      const result: SyncResult = {
        dataType: 'products',
        recordsCount: 0,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      }

      await this.logSync(result)
      return result
    }
  }

  private async syncCustomers(): Promise<SyncResult> {
    // Similar implementation to syncOrders and syncProducts
    // Implementing basic structure for now
    const result: SyncResult = {
      dataType: 'customers',
      recordsCount: 0,
      status: 'success',
    }

    await this.logSync(result)
    return result
  }

  private async storeOrder(order: ShopifyOrder): Promise<void> {
    // Store order in a normalized format
    // This would typically involve creating records in your orders, line_items, etc. tables
    // For now, just log the processing
    console.log(`Processing Shopify order: ${order.name}`)
  }

  private async storeProduct(product: any): Promise<void> {
    // Store product in a normalized format
    console.log(`Processing Shopify product: ${product.title}`)
  }

  // Webhook handling
  async handleWebhook(payload: any): Promise<void> {
    const topic = payload.topic || 'unknown'
    console.log(`Processing Shopify webhook: ${topic}`, payload)
  }
}

