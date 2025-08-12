import { PrismaClient } from '@prisma/client'

// Ensure a single PrismaClient instance across hot reloads and modules
const globalForPrisma = global as unknown as { prisma?: PrismaClient }

// Configure Prisma with connection pooling and timeouts
export const prisma: PrismaClient =
  globalForPrisma.prisma || new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Ensure proper cleanup on exit
if (process.env.NODE_ENV !== 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
}