import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // Create test users
  const user1 = await prisma.user.upsert({
    where: { email: 'john@example.com' },
    update: {},
    create: {
      email: 'john@example.com',
      passwordHash: '$2b$10$examplehashedpassword123', // bcrypt hashed "password123"
      emailVerified: true,
      timezone: 'America/New_York',
      companyName: 'Acme Corp',
    },
  })

  const user2 = await prisma.user.upsert({
    where: { email: 'jane@shopify-store.com' },
    update: {},
    create: {
      email: 'jane@shopify-store.com',
      passwordHash: '$2b$10$examplehashedpassword456',
      emailVerified: true,
      timezone: 'America/Los_Angeles',
      companyName: 'Fashion Forward LLC',
    },
  })

  console.log('✅ Created users')

  // Create test stores
  const store1 = await prisma.store.create({
    data: {
      userId: user1.id,
      shopifyShopDomain: 'acme-store.myshopify.com',
      shopifyAccessToken: 'shpat_example_token_12345',
      lastSyncAt: new Date(),
    },
  })

  const store2 = await prisma.store.create({
    data: {
      userId: user2.id,
      shopifyShopDomain: 'fashion-forward.myshopify.com',
      shopifyAccessToken: 'shpat_example_token_67890',
      lastSyncAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    },
  })

  console.log('✅ Created stores')

  // Create Klaviyo integrations
  await prisma.klaviyoIntegration.create({
    data: {
      userId: user1.id,
      accountId: 'klaviyo_account_123',
      accessToken: 'klv_access_token_example_123',
      refreshToken: 'klv_refresh_token_example_123',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
    },
  })

  await prisma.klaviyoIntegration.create({
    data: {
      userId: user2.id,
      accountId: 'klaviyo_account_456',
      accessToken: 'klv_access_token_example_456',
      refreshToken: 'klv_refresh_token_example_456',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
    },
  })

  console.log('✅ Created Klaviyo integrations')

  // Create subscriptions
  await prisma.subscription.create({
    data: {
      userId: user1.id,
      stripeCustomerId: 'cus_example_12345',
      stripeSubscriptionId: 'sub_example_12345',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
    },
  })

  await prisma.subscription.create({
    data: {
      userId: user2.id,
      stripeCustomerId: 'cus_example_67890',
      stripeSubscriptionId: 'sub_example_67890',
      status: 'trialing',
      trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14), // 14 days
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
    },
  })

  console.log('✅ Created subscriptions')

  // Create sample reports
  const currentWeek = new Date()
  currentWeek.setDate(currentWeek.getDate() - currentWeek.getDay()) // Start of current week

  const lastWeek = new Date(currentWeek)
  lastWeek.setDate(lastWeek.getDate() - 7)

  await prisma.report.create({
    data: {
      userId: user1.id,
      storeId: store1.id,
      weekOf: currentWeek,
      pdfPath: '/reports/acme-corp-week-current.pdf',
    },
  })

  await prisma.report.create({
    data: {
      userId: user1.id,
      storeId: store1.id,
      weekOf: lastWeek,
      pdfPath: '/reports/acme-corp-week-last.pdf',
    },
  })

  await prisma.report.create({
    data: {
      userId: user2.id,
      storeId: store2.id,
      weekOf: currentWeek,
      pdfPath: '/reports/fashion-forward-week-current.pdf',
    },
  })

  console.log('✅ Created reports')

  // Create sample conversations
  await prisma.conversation.create({
    data: {
      userId: user1.id,
      messages: [
        {
          role: 'user',
          content: 'What were my top selling products last week?',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: 'Based on your Shopify data, your top 3 selling products last week were: 1) Premium Wireless Headphones (47 units), 2) Bluetooth Speaker Set (32 units), 3) Phone Cases Bundle (28 units). Total revenue from these items was $4,250.',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'user',
          content: 'How did email marketing perform?',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: 'Your Klaviyo email campaigns last week had excellent performance: 3 campaigns sent to 1,247 subscribers, achieving a 24.3% open rate and 4.7% click rate, which generated approximately $850 in attributed revenue.',
          timestamp: new Date().toISOString(),
        },
      ],
    },
  })

  await prisma.conversation.create({
    data: {
      userId: user2.id,
      messages: [
        {
          role: 'user',
          content: 'Show me my customer acquisition trends',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: 'Your customer acquisition has been growing steadily! This month you gained 127 new customers (up 18% from last month). Your top acquisition channels are: Organic Search (42%), Email Marketing (28%), and Social Media (22%). Average customer acquisition cost is $24.50.',
          timestamp: new Date().toISOString(),
        },
      ],
    },
  })

  console.log('✅ Created conversations')

  console.log('🎉 Seed completed successfully!')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
