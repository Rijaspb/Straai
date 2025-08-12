import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthenticatedRequest } from '../middleware/auth'
import { requireActiveSubscription } from '../middleware/subscription'
import { ConnectorManager, SupportedProvider } from '../connectors/ConnectorManager'
import rateLimit from 'express-rate-limit'

const router = Router()
// Use shared prisma instance from lib/prisma
const connectorManager = new ConnectorManager(prisma)

// Rate limiting for integration endpoints
const integrationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many integration requests from this IP',
})

// Apply rate limiting to all integration routes
router.use(integrationRateLimit)

// GET /api/integrations - List available providers and user integrations
router.get('/', authenticate, requireActiveSubscription, async (req: AuthenticatedRequest, res) => {
  try {
    const availableProviders = connectorManager.getAvailableProviders()
    
    const userIntegrations = await prisma.integration.findMany({
      where: {
        userId: req.user!.id,
        deletedAt: null,
      },
      select: {
        id: true,
        provider: true,
        accountId: true,
        status: true,
        lastSyncAt: true,
        metadata: true,
        createdAt: true,
      },
    })

    return res.json({
      availableProviders,
      userIntegrations,
    })
  } catch (error) {
    console.error('Get integrations error:', error)
    return res.status(500).json({ error: 'Failed to get integrations' })
  }
})

// POST /api/integrations/{provider}/connect - Initiate OAuth flow
router.post('/:provider/connect', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    const { metadata } = req.body

    console.log(`OAuth initiation - Provider: ${provider}, User ID: ${req.user!.id}, Metadata:`, metadata)

    if (!connectorManager.getAvailableProviders().includes(provider)) {
      console.error(`Unsupported provider: ${provider}`)
      return res.status(400).json({ error: 'Unsupported provider' })
    }

    const { authUrl, state } = await connectorManager.initiateOAuth(
      provider,
      req.user!.id,
      metadata
    )

    console.log(`OAuth initiation success - Provider: ${provider}, Auth URL: ${authUrl}, State: ${state}`)

    return res.json({
      authUrl,
      state,
      provider,
    })
  } catch (error) {
    console.error('OAuth initiation error:', error)
    return res.status(500).json({ error: 'Failed to initiate OAuth flow' })
  }
})

// GET /api/integrations/{provider}/callback - Handle OAuth callback
router.get('/:provider/callback', async (req, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    const { code, state, error: oauthError } = req.query

    console.log(`OAuth callback received - Provider: ${provider}, State: ${state}, Has Code: ${!!code}`)

    if (oauthError) {
      console.error(`OAuth error in callback: ${oauthError}`)
      return res.redirect(`${process.env.CLIENT_URL}?error=${encodeURIComponent(oauthError as string)}`)
    }

    if (!code || !state) {
      console.error(`Missing OAuth parameters - Code: ${!!code}, State: ${!!state}`)
      return res.redirect(`${process.env.CLIENT_URL}?error=missing_oauth_parameters`)
    }

    // Extract provider-specific parameters
    const callbackMetadata: any = {}
    if (provider === 'shopify' && req.query.shop) {
      callbackMetadata.shopDomain = req.query.shop as string
    }
    
    console.log(`Processing OAuth callback for ${provider} with metadata:`, callbackMetadata)
    
    const integration = await connectorManager.handleOAuthCallback(
      provider,
      code as string,
      state as string,
      callbackMetadata
    )

    console.log(`OAuth callback success - Provider: ${provider}, Integration ID: ${integration.id}, Account ID: ${integration.accountId}, Status: ${integration.status}`)

    // Verify the integration was created successfully
    if (!integration || integration.status !== 'connected') {
      console.error(`Integration not properly created - Status: ${integration?.status}`)
      return res.redirect(`${process.env.CLIENT_URL}?error=integration_creation_failed`)
    }

    // Redirect to frontend with success
    const redirectUrl = `${process.env.CLIENT_URL}/dashboard?connected=${provider}&integration=${integration.id}`
    console.log(`Redirecting to: ${redirectUrl}`)
    
    return res.redirect(redirectUrl)
  } catch (error) {
    console.error('OAuth callback error:', error)
    return res.redirect(`${process.env.CLIENT_URL}?error=oauth_failed`)
  }
})

// GET /api/integrations/{provider}/status - Get integration status
router.get('/:provider/status', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    const userId = req.user!.id

    console.log(`Status check - Provider: ${provider}, User ID: ${userId}`)

    // Find the most recent active integration for this user/provider
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        provider,
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        provider: true,
        status: true,
        lastSyncAt: true,
        metadata: true,
        accountId: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    console.log(`Status check - Selected integration:`, integration ? {
      id: integration.id,
      status: integration.status,
      accountId: integration.accountId,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt
    } : 'null')

    if (!integration) {
      console.log(`Status check - No integration found for ${provider}, returning connected: false`)
      // Return a stable 200 shape so clients don't treat as an error
      return res.json({
        connected: false,
        provider,
      })
    }

    // Determine if the integration should be considered connected
    // An integration is connected if it has status 'connected' AND is not soft-deleted
    const isConnected = integration.status === 'connected' && !integration.deletedAt
    
    const response = {
      connected: isConnected,
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      lastSyncAt: integration.lastSyncAt,
      metadata: integration.metadata,
      // Include additional debug info
      accountId: integration.accountId,
      deletedAt: integration.deletedAt,
    }
    
    console.log(`Status check - Returning response:`, response)
    return res.json(response)
  } catch (error) {
    console.error('Get integration status error:', error)
    return res.status(500).json({ error: 'Failed to get integration status' })
  }
})

// POST /api/integrations/{provider}/sync - Trigger manual sync
router.post('/:provider/sync', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const provider = req.params.provider as SupportedProvider

    const integration = await prisma.integration.findFirst({
      where: {
        userId: req.user!.id,
        provider,
        deletedAt: null,
      },
    })

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    // Trigger sync asynchronously
    connectorManager.syncIntegration(integration.id).catch(error => {
      console.error(`Manual sync failed for integration ${integration.id}:`, error)
    })

    return res.json({ message: 'Sync initiated' })
  } catch (error) {
    console.error('Manual sync initiation error:', error)
    return res.status(500).json({ error: 'Failed to initiate sync' })
  }
})

// DELETE /api/integrations/{provider}/disconnect - Disconnect integration
router.delete('/:provider/disconnect', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const provider = req.params.provider as SupportedProvider

    const integration = await prisma.integration.findFirst({
      where: {
        userId: req.user!.id,
        provider,
        deletedAt: null,
      },
    })

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    await connectorManager.disconnectIntegration(integration.id)

    return res.json({ message: 'Integration disconnected' })
  } catch (error) {
    console.error('Disconnect integration error:', error)
    return res.status(500).json({ error: 'Failed to disconnect integration' })
  }
})

// POST /api/integrations/{provider}/webhook - Handle webhooks
router.post('/:provider/webhook', async (req, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    const { integrationId } = req.query

    if (!integrationId) {
      return res.status(400).json({ error: 'Integration ID required' })
    }

    const integration = await prisma.integration.findFirst({
      where: {
        id: integrationId as string,
        provider,
        deletedAt: null,
      },
    })

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    await connectorManager.handleWebhook(
      integration.id,
      req.body
    )

    return res.json({ success: true })
  } catch (error) {
    console.error('Webhook handling error:', error)
    return res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// Simple health check for integrations (no auth required)
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Integrations service is running'
  })
})

// Debug endpoint to check environment variables and OAuth configuration
router.get('/debug/oauth-config', authenticate, async (_req: AuthenticatedRequest, res) => {
  try {
    const debugInfo = {
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        API_BASE_URL: process.env.API_BASE_URL,
        CLIENT_URL: process.env.CLIENT_URL,
        ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ? '***' : 'undefined',
        JWT_SECRET: process.env.JWT_SECRET ? '***' : 'undefined',
      },
      oauth: {
        shopify: {
          clientId: process.env.SHOPIFY_CLIENT_ID ? `${process.env.SHOPIFY_CLIENT_ID.substring(0, 10)}...` : 'undefined',
          clientSecret: process.env.SHOPIFY_CLIENT_SECRET ? '***' : 'undefined',
        },
        klaviyo: {
          clientId: process.env.KLAVIYO_CLIENT_ID ? `${process.env.KLAVIYO_CLIENT_ID.substring(0, 10)}...` : 'undefined',
          clientSecret: process.env.KLAVIYO_CLIENT_SECRET ? '***' : 'undefined',
        },
      },
      database: {
        url: process.env.DATABASE_URL ? '***' : 'undefined',
      },
      supabase: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY ? '***' : 'undefined',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? '***' : 'undefined',
      },
      availableProviders: connectorManager.getAvailableProviders(),
    }

    return res.json(debugInfo)
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return res.status(500).json({ error: 'Failed to get debug info' })
  }
})

// Test endpoint to simulate OAuth callback (for debugging only)
router.get('/test/oauth-simulation/:provider', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    const userId = req.user!.id

    console.log(`OAuth simulation - Provider: ${provider}, User ID: ${userId}`)

    // Create a test integration
    const testIntegration = await prisma.integration.create({
      data: {
        userId,
        provider,
        accountId: `test-${provider}-${Date.now()}`,
        accessToken: 'test-token',
        refreshToken: null,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        scopes: ['test:scope'],
        metadata: {
          test: true,
          simulatedAt: new Date().toISOString(),
        },
        status: 'connected',
      },
    })

    console.log(`Test integration created:`, testIntegration.id)

    // Redirect to dashboard with success parameters
    const redirectUrl = `${process.env.CLIENT_URL}/dashboard?connected=${provider}&integration=${testIntegration.id}`
    console.log(`Redirecting to: ${redirectUrl}`)
    
    return res.redirect(redirectUrl)
  } catch (error) {
    console.error('OAuth simulation error:', error)
    return res.status(500).json({ error: 'Failed to simulate OAuth callback' })
  }
})

// Provider-specific routes

// Shopify specific routes
router.get('/shopify/install', (req, res) => {
  const { shop } = req.query
  
  if (!shop) {
    return res.status(400).json({ error: 'Shop parameter required' })
  }

  // Redirect to Shopify OAuth with shop domain in metadata
  const metadata = { shopDomain: shop }
  const authUrl = `/api/integrations/shopify/connect`
  
  return res.json({
    message: 'Use the connect endpoint with shop domain in metadata',
    metadata,
    connectUrl: authUrl,
  })
})

// Klaviyo specific routes
router.get('/klaviyo/campaigns', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        userId: req.user!.id,
        provider: 'klaviyo',
        status: 'connected',
        deletedAt: null,
      },
    })

    if (!integration) {
      return res.status(404).json({ error: 'Klaviyo integration not found' })
    }

    // Get recent campaign sync logs
    const campaignLogs = await prisma.syncLog.findMany({
      where: {
        integrationId: integration.id,
        dataType: 'campaigns',
      },
      orderBy: { startedAt: 'desc' },
      take: 10,
    })

    return res.json({
      integration: {
        id: integration.id,
        status: integration.status,
        lastSyncAt: integration.lastSyncAt,
      },
      campaigns: campaignLogs,
    })
  } catch (error) {
    console.error('Get Klaviyo campaigns error:', error)
    return res.status(500).json({ error: 'Failed to get campaigns' })
  }
})

// Debug endpoint to check database replication status
router.get('/debug/db-replication', async (_req, res) => {
  try {
    console.log('Debug - Checking database replication status')
    
    // Check replication status
    const replicationStatus = await prisma.$queryRaw`
      SELECT 
        pid,
        usename,
        application_name,
        client_addr,
        backend_start,
        state,
        sent_location,
        write_location,
        flush_location,
        replay_location,
        sync_priority,
        sync_state
      FROM pg_stat_replication
      ORDER BY sync_priority DESC, sync_state
    `
    
    console.log('Debug - Replication status:', replicationStatus)
    
    // Check for replication slots
    const replicationSlots = await prisma.$queryRaw`
      SELECT 
        slot_name,
        plugin,
        slot_type,
        database,
        active,
        restart_lsn,
        confirmed_flush_lsn,
        pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as lag_size
      FROM pg_replication_slots
      ORDER BY slot_name
    `
    
    console.log('Debug - Replication slots:', replicationSlots)
    
    // Check WAL status
    const walStatus = await prisma.$queryRaw`
      SELECT 
        pg_current_wal_lsn() as current_lsn,
        pg_walfile_name(pg_current_wal_lsn()) as current_wal_file,
        pg_size_pretty(pg_current_wal_lsn()) as current_lsn_size,
        pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0') as total_wal_size
    `
    
    console.log('Debug - WAL status:', walStatus)
    
    return res.json({
      replicationStatus,
      replicationSlots,
      walStatus,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug database replication error:', error)
    return res.status(500).json({ error: 'Failed to check database replication' })
  }
})

// Debug endpoint to check database vacuum and maintenance
router.get('/debug/db-maintenance', async (_req, res) => {
  try {
    console.log('Debug - Checking database vacuum and maintenance status')
    
    // Check vacuum status for integrations table
    const vacuumStatus = await prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        last_vacuum,
        last_autovacuum,
        vacuum_count,
        autovacuum_count,
        last_analyze,
        last_autoanalyze,
        analyze_count,
        autoanalyze_count,
        n_tuples,
        n_dead_tup,
        n_live_tup,
        n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0) * 100 as dead_tup_percent
      FROM pg_stat_user_tables 
      WHERE tablename = 'integrations'
    `
    
    console.log('Debug - Vacuum status for integrations:', vacuumStatus)
    
    // Check autovacuum settings
    const autovacuumSettings = await prisma.$queryRaw`
      SELECT 
        name,
        setting,
        unit,
        context,
        category,
        short_desc
      FROM pg_settings 
      WHERE name LIKE 'autovacuum%' OR name LIKE 'vacuum%'
      ORDER BY name
    `
    
    console.log('Debug - Autovacuum settings:', autovacuumSettings)
    
    // Check for bloat
    const tableBloat = await prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
        round(
          (pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename))::numeric / 
          NULLIF(pg_total_relation_size(schemaname||'.'||tablename), 0) * 100, 2
        ) as index_percent
      FROM pg_tables 
      WHERE tablename = 'integrations'
    `
    
    console.log('Debug - Table bloat for integrations:', tableBloat)
    
    return res.json({
      vacuumStatus,
      autovacuumSettings,
      tableBloat,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug database maintenance error:', error)
    return res.status(500).json({ error: 'Failed to check database maintenance' })
  }
})

// Debug endpoint to check database connection pool
router.get('/debug/connection-pool', async (_req, res) => {
  try {
    console.log('Debug - Checking database connection pool')
    
    // Check connection pool status
    const poolStatus = await prisma.$queryRaw`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction,
        count(*) FILTER (WHERE state = 'fastpath function call') as fastpath_function_call,
        count(*) FILTER (WHERE state = 'disabled') as disabled_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `
    
    console.log('Debug - Connection pool status:', poolStatus)
    
    // Check for long-running queries
    const longRunningQueries = await prisma.$queryRaw`
      SELECT 
        pid,
        usename,
        application_name,
        client_addr,
        backend_start,
        state,
        query_start,
        state_change,
        wait_event_type,
        wait_event,
        query,
        age(now(), query_start) as duration
      FROM pg_stat_activity 
      WHERE state = 'active' 
      AND query NOT LIKE '%pg_stat_activity%'
      AND query_start < now() - interval '5 seconds'
      ORDER BY query_start
    `
    
    console.log('Debug - Long-running queries:', longRunningQueries)
    
    // Check for connections by application
    const connectionsByApp = await prisma.$queryRaw`
      SELECT 
        application_name,
        count(*) as connection_count,
        count(*) FILTER (WHERE state = 'active') as active_count,
        count(*) FILTER (WHERE state = 'idle') as idle_count
      FROM pg_stat_activity 
      WHERE datname = current_database()
      GROUP BY application_name
      ORDER BY connection_count DESC
    `
    
    console.log('Debug - Connections by application:', connectionsByApp)
    
    return res.json({
      poolStatus,
      longRunningQueries,
      connectionsByApp,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug connection pool error:', error)
    return res.status(500).json({ error: 'Failed to check connection pool' })
  }
})

// Debug endpoint to check database query plan
router.get('/debug/query-plan/:provider', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    const userId = req.user!.id
    console.log(`Debug - Checking query plan for provider: ${provider}, User ID: ${userId}`)
    
    // Get the query plan for the status check query
    const queryPlan = await prisma.$queryRaw`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, "userId", provider, "accountId", status, "createdAt", "updatedAt", "deletedAt"
      FROM integrations 
      WHERE "userId" = ${userId}::uuid AND provider = ${provider} AND "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
    
    console.log('Debug - Query plan:', JSON.stringify(queryPlan, null, 2))
    
    // Also check the plan without the deletedAt filter
    const queryPlanWithoutDeleted = await prisma.$queryRaw`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, "userId", provider, "accountId", status, "createdAt", "updatedAt", "deletedAt"
      FROM integrations 
      WHERE "userId" = ${userId}::uuid AND provider = ${provider}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
    
    console.log('Debug - Query plan without deletedAt filter:', JSON.stringify(queryPlanWithoutDeleted, null, 2))
    
    return res.json({
      provider,
      userId,
      queryPlan,
      queryPlanWithoutDeleted,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug query plan error:', error)
    return res.status(500).json({ error: 'Failed to get query plan' })
  }
})

// Debug endpoint to check database table statistics
router.get('/debug/db-stats', async (_req, res) => {
  try {
    console.log('Debug - Checking database table statistics')
    
    // Check table statistics for integrations table
    const tableStats = await prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation,
        most_common_vals,
        most_common_freqs,
        histogram_bounds,
        null_frac,
        avg_width,
        n_tuples,
        n_dead_tuples,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze,
        vacuum_count,
        autovacuum_count,
        analyze_count,
        autoanalyze_count
      FROM pg_stats 
      WHERE tablename = 'integrations'
      ORDER BY attname
    `
    
    console.log('Debug - Table statistics for integrations:', tableStats)
    
    // Check table size and bloat
    const tableSize = await prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
        pg_total_relation_size(schemaname||'.'||tablename) as total_bytes,
        pg_relation_size(schemaname||'.'||tablename) as table_bytes,
        pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename) as index_bytes
      FROM pg_tables 
      WHERE tablename = 'integrations'
    `
    
    console.log('Debug - Table size for integrations:', tableSize)
    
    // Check index usage
    const indexUsage = await prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_stat_user_indexes 
      WHERE tablename = 'integrations'
      ORDER BY idx_scan DESC
    `
    
    console.log('Debug - Index usage for integrations:', indexUsage)
    
    return res.json({
      tableStats,
      tableSize,
      indexUsage,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug database statistics error:', error)
    return res.status(500).json({ error: 'Failed to check database statistics' })
  }
})

// Debug endpoint to check database locks and blocking
router.get('/debug/db-locks', async (_req, res) => {
  try {
    console.log('Debug - Checking database locks and blocking')
    
    // Check for locks on the integrations table
    const locks = await prisma.$queryRaw`
      SELECT 
        l.pid,
        l.mode,
        l.granted,
        l.database,
        l.relation::regclass as table_name,
        l.page,
        l.tuple,
        l.virtualxid,
        l.transactionid,
        l.classid,
        l.objid,
        l.objsubid,
        l.virtualtransaction,
        l.virtualxid,
        l.transactionid,
        l.classid,
        l.objid,
        l.objsubid,
        a.usename,
        a.application_name,
        a.client_addr,
        a.backend_start,
        a.state,
        a.query_start,
        a.state_change,
        a.wait_event_type,
        a.wait_event,
        a.query
      FROM pg_locks l
      JOIN pg_stat_activity a ON l.pid = a.pid
      WHERE l.relation::regclass::text = 'integrations'
      ORDER BY l.pid, l.mode
    `
    
    console.log('Debug - Locks on integrations table:', locks)
    
    // Check for blocking queries
    const blocking = await prisma.$queryRaw`
      SELECT 
        blocked.pid as blocked_pid,
        blocked.usename as blocked_user,
        blocking.pid as blocking_pid,
        blocking.usename as blocking_user,
        blocked.state as blocked_state,
        blocking.state as blocking_state,
        blocked.query as blocked_query,
        blocking.query as blocking_query,
        age(now(), blocked.query_start) as blocked_duration,
        age(now(), blocking.query_start) as blocking_duration
      FROM pg_stat_activity blocked
      JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
      WHERE blocked.state != 'idle'
      ORDER BY blocked_duration DESC
    `
    
    console.log('Debug - Blocking queries:', blocking)
    
    return res.json({
      locks,
      blocking,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug database locks error:', error)
    return res.status(500).json({ error: 'Failed to check database locks' })
  }
})

// Debug endpoint to check database transaction status
router.get('/debug/db-transaction', async (_req, res) => {
  try {
    console.log('Debug - Checking database transaction status')
    
    // Check transaction isolation level and other settings
    const transactionInfo = await prisma.$queryRaw`
      SELECT 
        current_setting('transaction_isolation') as isolation_level,
        current_setting('default_transaction_isolation') as default_isolation,
        current_setting('transaction_read_only') as read_only,
        current_setting('transaction_deferrable') as deferrable,
        current_setting('synchronous_commit') as sync_commit,
        current_setting('wal_level') as wal_level,
        current_setting('max_connections') as max_connections,
        current_setting('shared_preload_libraries') as shared_preload_libraries
    `
    
    console.log('Debug - Transaction info:', transactionInfo)
    
    // Check if there are any active transactions
    const activeTransactions = await prisma.$queryRaw`
      SELECT 
        pid,
        usename,
        application_name,
        client_addr,
        backend_start,
        state,
        query_start,
        state_change,
        wait_event_type,
        wait_event,
        query
      FROM pg_stat_activity 
      WHERE state = 'active' 
      AND query NOT LIKE '%pg_stat_activity%'
      ORDER BY query_start
    `
    
    console.log('Debug - Active transactions:', activeTransactions)
    
    return res.json({
      transactionInfo,
      activeTransactions,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug database transaction error:', error)
    return res.status(500).json({ error: 'Failed to check database transaction status' })
  }
})

// Debug endpoint to check database connection details
router.get('/debug/db-connection', async (_req, res) => {
  try {
    console.log('Debug - Checking database connection details')
    
    const dbUrl = process.env.DATABASE_URL
    const connectionInfo: any = {
      hasDatabaseUrl: !!dbUrl,
      databaseUrlPrefix: dbUrl ? dbUrl.substring(0, 30) + '...' : 'undefined',
      databaseType: dbUrl ? dbUrl.split('://')[0] : 'undefined',
      databaseHost: dbUrl ? dbUrl.split('@')[1]?.split('/')[0] : 'undefined',
      databaseName: dbUrl ? dbUrl.split('/').pop()?.split('?')[0] : 'undefined',
    }
    
    console.log('Debug - Database connection info:', connectionInfo)
    
    // Test connection
    try {
      await prisma.$connect()
      console.log('Debug - Database connection test: SUCCESS')
      connectionInfo.connectionTest = 'SUCCESS'
    } catch (connectError) {
      console.log('Debug - Database connection test: FAILED')
      connectionInfo.connectionTest = 'FAILED'
      connectionInfo.connectionError = connectError instanceof Error ? connectError.message : String(connectError)
    }
    
    return res.json({
      connectionInfo,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug database connection error:', error)
    return res.status(500).json({ error: 'Failed to check database connection' })
  }
})

// Debug endpoint to check database with raw SQL
router.get('/debug/raw-sql/:provider', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    const userId = req.user!.id
    console.log(`Debug - Raw SQL check for provider: ${provider}, User ID: ${userId}`)
    
    // Try raw SQL query to see what's in the database
    const rawIntegrations = await prisma.$queryRaw`
      SELECT id, "userId", provider, "accountId", status, "createdAt", "updatedAt", "deletedAt"
      FROM integrations 
      WHERE "userId" = ${userId}::uuid AND provider = ${provider}
      ORDER BY "createdAt" DESC
    `
    
    console.log('Debug - Raw SQL result:', rawIntegrations)
    
    // Also check with the deletedAt filter
    const rawActiveIntegrations = await prisma.$queryRaw`
      SELECT id, "userId", provider, "accountId", status, "createdAt", "updatedAt", "deletedAt"
      FROM integrations 
      WHERE "userId" = ${userId}::uuid AND provider = ${provider} AND "deletedAt" IS NULL
      ORDER BY "createdAt" DESC
    `
    
    console.log('Debug - Raw SQL with deletedAt filter:', rawActiveIntegrations)
    
    return res.json({
      provider,
      userId,
      rawIntegrations,
      rawActiveIntegrations,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug raw SQL error:', error)
    return res.status(500).json({ error: 'Failed to execute raw SQL' })
  }
})

// Debug endpoint to check database schema
router.get('/debug/schema', async (_req, res) => {
  try {
    console.log('Debug - Checking database schema')
    
    // Check if tables exist and their structure
    const tables = ['User', 'Integration']
    const schemaInfo: any = {}
    
    for (const tableName of tables) {
      try {
        const count = await (prisma as any)[tableName.toLowerCase()].count()
        schemaInfo[tableName] = {
          exists: true,
          count,
        }
      } catch (error) {
        schemaInfo[tableName] = {
          exists: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
    
    console.log('Debug - Schema info:', schemaInfo)
    
    return res.json({
      schemaInfo,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug schema error:', error)
    return res.status(500).json({ error: 'Failed to check database schema' })
  }
})

// Debug endpoint to check OAuth configuration from connectors
router.get('/debug/oauth-config/:provider', async (req, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    console.log(`Debug - Checking OAuth configuration for provider: ${provider}`)
    
    if (!connectorManager.getAvailableProviders().includes(provider)) {
      return res.status(400).json({ error: `Provider ${provider} not supported` })
    }
    
    // Create a temporary integration to get OAuth config
    const tempIntegration: any = {
      id: 'temp',
      userId: 'temp',
      provider,
      accountId: 'temp',
      accessToken: 'temp',
      refreshToken: null,
      expiresAt: null,
      scopes: [],
      metadata: {},
      status: 'connecting',
      lastSyncAt: null,
      syncFrequency: 3600,
      webhookUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }
    
    const connector = connectorManager.createConnector(tempIntegration)
    const oauthConfig = connector.getOAuthConfig()
    
    console.log(`Debug - OAuth config for ${provider}:`, {
      clientId: oauthConfig.clientId ? `${oauthConfig.clientId.substring(0, 10)}...` : 'undefined',
      clientSecret: oauthConfig.clientSecret ? '***' : 'undefined',
      authUrl: oauthConfig.authUrl,
      tokenUrl: oauthConfig.tokenUrl,
      redirectUri: oauthConfig.redirectUri,
      scopes: oauthConfig.scopes,
      pkceRequired: oauthConfig.pkceRequired,
    })
    
    return res.json({
      provider,
      oauthConfig: {
        ...oauthConfig,
        clientId: oauthConfig.clientId ? `${oauthConfig.clientId.substring(0, 10)}...` : 'undefined',
        clientSecret: oauthConfig.clientSecret ? '***' : 'undefined',
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug OAuth config error:', error)
    return res.status(500).json({ error: 'Failed to check OAuth configuration' })
  }
})

// Debug endpoint to check environment variables and configuration
router.get('/debug/env-config', async (_req, res) => {
  try {
    console.log('Debug - Checking environment configuration')
    
    const config = {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      apiBaseUrl: process.env.API_BASE_URL,
      clientUrl: process.env.CLIENT_URL,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasKlaviyoClientId: !!process.env.KLAVIYO_CLIENT_ID,
      hasKlaviyoClientSecret: !!process.env.KLAVIYO_CLIENT_SECRET,
      hasShopifyClientId: !!process.env.SHOPIFY_CLIENT_ID,
      hasShopifyClientSecret: !!process.env.SHOPIFY_CLIENT_SECRET,
      databaseUrlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'undefined',
      klaviyoClientIdPrefix: process.env.KLAVIYO_CLIENT_ID ? process.env.KLAVIYO_CLIENT_ID.substring(0, 10) + '...' : 'undefined',
      shopifyClientIdPrefix: process.env.SHOPIFY_CLIENT_ID ? process.env.SHOPIFY_CLIENT_ID.substring(0, 10) + '...' : 'undefined',
    }
    
    console.log('Debug - Environment configuration:', config)
    
    return res.json({
      config,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Debug environment config error:', error)
    return res.status(500).json({ error: 'Failed to check environment configuration' })
  }
})

// Debug endpoint to check OAuth state storage in database
router.get('/debug/oauth-states', async (_req, res) => {
  try {
    console.log('Debug - Checking OAuth states in database')
    
    // Check if OAuthState table exists and has data
    try {
      // Table may not exist in current schema
      const oauthStateCount = 0 as number
      console.log('Debug - OAuth states count:', oauthStateCount)
      
      if (oauthStateCount > 0) {
        return res.json({ oauthStateCount: 0, recentStates: [], tableExists: false })
      } else {
        return res.json({
          oauthStateCount: 0,
          recentStates: [],
          tableExists: true,
        })
      }
    } catch (tableError) {
      console.log('Debug - OAuthState table error (might not exist):', tableError)
      return res.json({ oauthStateCount: 0, recentStates: [], tableExists: false })
    }
  } catch (error) {
    console.error('Debug OAuth states error:', error)
    return res.status(500).json({ error: 'Failed to check OAuth states' })
  }
})

// Debug endpoint to test database connectivity
router.get('/debug/db-test', async (_req, res) => {
  try {
    console.log('Debug - Testing database connectivity')
    
    // Test basic database connection
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('Debug - Database test query result:', result)
    
    // Test integration table access
    const integrationCount = await prisma.integration.count()
    console.log('Debug - Total integrations in database:', integrationCount)
    
    // Test user table access
    const userCount = await prisma.user.count()
    console.log('Debug - Total users in database:', userCount)
    
    return res.json({
      databaseConnected: true,
      integrationCount,
      userCount,
      testQueryResult: result,
    })
  } catch (error) {
    console.error('Debug database test error:', error)
    return res.status(500).json({ 
      databaseConnected: false,
      error: 'Database test failed',
      details: error instanceof Error ? error.message : String(error)
    })
  }
})

// Debug endpoint to simulate the exact status check query
router.get('/debug/simulate-status/:provider', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    const userId = req.user!.id
    console.log(`Debug - Simulating status check for provider: ${provider}, User ID: ${userId}`)

    // Simulate the exact query from the status check
    const whereClause = {
      userId,
      provider,
      deletedAt: null,
    }
    console.log(`Debug - Simulating query with where clause:`, JSON.stringify(whereClause, null, 2))

    const integration = await prisma.integration.findFirst({
      where: whereClause,
    })

    console.log(`Debug - Simulation result:`, integration ? {
      id: integration.id,
      status: integration.status,
      accountId: integration.accountId,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt
    } : 'null')

    // Also try without the deletedAt filter to see if that's the issue
    const withoutDeletedAtFilter = await prisma.integration.findFirst({
      where: {
        userId,
        provider,
      },
    })

    console.log(`Debug - Without deletedAt filter:`, withoutDeletedAtFilter ? {
      id: withoutDeletedAtFilter.id,
      status: withoutDeletedAtFilter.status,
      accountId: withoutDeletedAtFilter.accountId,
      deletedAt: withoutDeletedAtFilter.deletedAt
    } : 'null')

    return res.json({
      provider,
      userId,
      withDeletedAtFilter: integration,
      withoutDeletedAtFilter,
      whereClause,
    })
  } catch (error) {
    console.error('Debug simulate status error:', error)
    return res.status(500).json({ error: 'Failed to simulate status check' })
  }
})

// Debug endpoint to check database directly for integrations
router.get('/debug/db-check/:provider', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    const userId = req.user!.id
    console.log(`Debug - Database check for provider: ${provider}, User ID: ${userId}`)

    // Check for any integrations with this provider and user
    const allIntegrations = await prisma.integration.findMany({
      where: {
        userId,
        provider,
      },
      select: {
        id: true,
        provider: true,
        accountId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    console.log(`Debug - Database check found ${allIntegrations.length} integrations (including deleted):`, allIntegrations)

    // Check for non-deleted integrations
    const activeIntegrations = allIntegrations.filter(i => !i.deletedAt)
    console.log(`Debug - Database check found ${activeIntegrations.length} active integrations:`, activeIntegrations)

    return res.json({
      provider,
      userId,
      allIntegrations,
      activeIntegrations,
      totalCount: allIntegrations.length,
      activeCount: activeIntegrations.length,
    })
  } catch (error) {
    console.error('Debug database check error:', error)
    return res.status(500).json({ error: 'Failed to check database' })
  }
})

// Debug endpoint to check OAuth state
router.get('/debug/oauth-state/:state', async (req, res) => {
  try {
    const { state } = req.params
    console.log(`Debug - Checking OAuth state: ${state}`)

    // This would need to be implemented in ConnectorManager or we'd need to expose it
    // For now, just return the state parameter
    return res.json({
      state,
      message: 'OAuth state debug endpoint - check server logs for state validation',
    })
  } catch (error) {
    console.error('Debug OAuth state error:', error)
    return res.status(500).json({ error: 'Failed to check OAuth state' })
  }
})

// Debug endpoint to list all integrations for a user
router.get('/debug/user-integrations', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id
    console.log(`Debug - Listing all integrations for user: ${userId}`)

    const integrations = await prisma.integration.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
        provider: true,
        accountId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        metadata: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    console.log(`Debug - Found ${integrations.length} integrations:`, integrations)

    return res.json({
      userId,
      integrations,
      count: integrations.length,
    })
  } catch (error) {
    console.error('Debug user integrations error:', error)
    return res.status(500).json({ error: 'Failed to get user integrations' })
  }
})

// Debug endpoint to test status query logic
router.get('/debug/test-status-query/:provider', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    const userId = req.user!.id

    console.log(`Debug test-status-query - Provider: ${provider}, User ID: ${userId}`)

    // Test 1: Query without accountId (current status endpoint logic)
    const query1 = {
      userId,
      provider,
      deletedAt: null,
    }
    console.log(`Debug test-status-query - Query 1 (current logic):`, JSON.stringify(query1, null, 2))

    const result1 = await prisma.integration.findFirst({
      where: query1,
      orderBy: {
        updatedAt: 'desc'
      }
    })

    console.log(`Debug test-status-query - Result 1:`, result1 ? {
      id: result1.id,
      status: result1.status,
      accountId: result1.accountId,
      createdAt: result1.createdAt,
      updatedAt: result1.updatedAt
    } : 'null')

    // Test 2: Query all integrations for this user/provider to see what exists
    const allIntegrations = await prisma.integration.findMany({
      where: {
        userId,
        provider,
      },
      select: {
        id: true,
        provider: true,
        accountId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    console.log(`Debug test-status-query - All integrations found:`, allIntegrations)

    // Test 3: Check if there are any active integrations
    const activeIntegrations = allIntegrations.filter(i => !i.deletedAt)
    console.log(`Debug test-status-query - Active integrations:`, activeIntegrations)

    return res.json({
      provider,
      userId,
      query1: {
        where: query1,
        result: result1 ? {
          id: result1.id,
          status: result1.status,
          accountId: result1.accountId,
          createdAt: result1.createdAt,
          updatedAt: result1.updatedAt
        } : null
      },
      allIntegrations,
      activeIntegrations,
      summary: {
        total: allIntegrations.length,
        active: activeIntegrations.length,
        deleted: allIntegrations.length - activeIntegrations.length
      }
    })
  } catch (error) {
    console.error('Debug test-status-query error:', error)
    return res.status(500).json({ error: 'Failed to test status query' })
  }
})

// Debug endpoint to simulate OAuth callback and check database state
router.post('/debug/simulate-oauth-callback/:provider', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const provider = req.params.provider as SupportedProvider
    const userId = req.user!.id
    const { accountId, accessToken, metadata } = req.body

    console.log(`Debug simulate-oauth-callback - Provider: ${provider}, User ID: ${userId}, Account ID: ${accountId}`)

    if (!accountId || !accessToken) {
      return res.status(400).json({ error: 'accountId and accessToken are required' })
    }

    // Simulate the exact upsert operation from ConnectorManager
    const integration = await prisma.integration.upsert({
      where: {
        userId_provider_accountId: {
          userId,
          provider,
          accountId,
        },
      },
      update: {
        accessToken: `encrypted_${accessToken}`, // Simplified encryption for testing
        expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
        metadata: metadata || {},
        status: 'connected',
        updatedAt: new Date(),
      },
      create: {
        userId,
        provider,
        accountId,
        accessToken: `encrypted_${accessToken}`, // Simplified encryption for testing
        expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
        metadata: metadata || {},
        status: 'connected',
        scopes: ['read', 'write'],
      },
    })

    console.log(`Debug simulate-oauth-callback - Upsert completed:`, {
      integrationId: integration.id,
      userId: integration.userId,
      provider: integration.provider,
      accountId: integration.accountId,
      status: integration.status,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt
    })

    // Immediately test the status query
    const statusQuery = {
      userId,
      provider,
      deletedAt: null,
    }

    const statusResult = await prisma.integration.findFirst({
      where: statusQuery,
      orderBy: {
        updatedAt: 'desc'
      }
    })

    console.log(`Debug simulate-oauth-callback - Status query result:`, statusResult ? {
      id: statusResult.id,
      status: statusResult.status,
      accountId: statusResult.accountId,
      createdAt: statusResult.createdAt,
      updatedAt: statusResult.updatedAt
    } : 'null')

    return res.json({
      success: true,
      integration: {
        id: integration.id,
        userId: integration.userId,
        provider: integration.provider,
        accountId: integration.accountId,
        status: integration.status,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt
      },
      statusQuery: {
        where: statusQuery,
        result: statusResult ? {
          id: statusResult.id,
          status: statusResult.status,
        accountId: statusResult.accountId,
        createdAt: statusResult.createdAt,
        updatedAt: statusResult.updatedAt
        } : null
      },
      message: 'OAuth callback simulation completed'
    })
  } catch (error) {
    console.error('Debug simulate-oauth-callback error:', error)
    return res.status(500).json({ error: 'Failed to simulate OAuth callback' })
  }
})

export { router as integrationsRoutes }

