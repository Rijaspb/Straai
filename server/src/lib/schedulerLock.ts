import { prisma } from './prisma'

// Uses Postgres advisory locks keyed by a string via hashtext(key)::int4
// Ensures only one process across all instances runs a given job at a time

export async function tryAcquireLock(lockKey: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      'SELECT pg_try_advisory_lock(hashtext($1)::int4, 0) AS ok',
      lockKey,
    )
    return !!rows?.[0]?.ok
  } catch {
    return false
  }
}

export async function releaseLock(lockKey: string): Promise<void> {
  try {
    await prisma.$queryRawUnsafe('SELECT pg_advisory_unlock(hashtext($1)::int4, 0)', lockKey)
  } catch {
    // ignore
  }
}

export async function withAdvisoryLock<T>(
  lockKey: string,
  fn: () => Promise<T>
): Promise<T | undefined> {
  const acquired = await tryAcquireLock(lockKey)
  if (!acquired) return undefined
  try {
    const result = await fn()
    return result
  } finally {
    await releaseLock(lockKey)
  }
}


