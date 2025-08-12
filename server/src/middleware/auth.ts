import { Request, Response, NextFunction } from 'express'
// import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../lib/supabase'
import { prisma } from '../lib/prisma'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    supabaseId: string
    subscriptionStatus?: string
    inTrial?: boolean
  }
}

// Short-lived caches to reduce repeated Supabase and DB hits across concurrent requests
const TOKEN_TTL_MS = 15_000 // 15s token verification cache
const USER_TTL_MS = 60_000 // 60s DB user cache
const MAX_CACHE_SIZE = 100 // Prevent memory leaks

const tokenCache = new Map<string, { user: any; ts: number }>()
const tokenInflight = new Map<string, Promise<any>>()
const userCache = new Map<string, { id: string; email: string; inTrial?: boolean; ts: number }>()

// Clean up old cache entries periodically
setInterval(() => {
  const now = Date.now()
  
  // Clean token cache
  for (const [key, value] of tokenCache.entries()) {
    if (now - value.ts > TOKEN_TTL_MS) {
      tokenCache.delete(key)
    }
  }
  
  // Clean user cache
  for (const [key, value] of userCache.entries()) {
    if (now - value.ts > USER_TTL_MS) {
      userCache.delete(key)
    }
  }
  
  // Limit cache sizes to prevent memory leaks
  if (tokenCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(tokenCache.entries())
    entries.sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < entries.length - MAX_CACHE_SIZE; i++) {
      tokenCache.delete(entries[i][0])
    }
  }
  
  if (userCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(userCache.entries())
    entries.sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < entries.length - MAX_CACHE_SIZE; i++) {
      userCache.delete(entries[i][0])
    }
  }
}, 60000) // Clean every minute

async function getSupabaseUserFromToken(token: string) {
  const now = Date.now()
  const cached = tokenCache.get(token)
  if (cached && now - cached.ts < TOKEN_TTL_MS) {
    return cached.user
  }

  const inProgress = tokenInflight.get(token)
  if (inProgress) {
    return inProgress
  }

  const promise = (async () => {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) {
      throw new Error('Invalid or expired token')
    }
    tokenCache.set(token, { user, ts: Date.now() })
    return user
  })()

  tokenInflight.set(token, promise)
  try {
    const result = await promise
    return result
  } finally {
    tokenInflight.delete(token)
  }
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' })
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix

    // Verify the JWT token with Supabase (with short-lived cache)
    const supabaseUser = await getSupabaseUserFromToken(token)

    // Find or create user in our database with minimal fields
    const now = Date.now()
    const cachedDbUser = userCache.get(supabaseUser.id)
    if (cachedDbUser && now - cachedDbUser.ts < USER_TTL_MS) {
      req.user = {
        id: cachedDbUser.id,
        email: cachedDbUser.email,
        supabaseId: supabaseUser.id,
        inTrial: cachedDbUser.inTrial,
      }
      return next()
    }

    // Minimal select, no joins, no per-request heavy updates
    let dbUser = await prisma.user.findUnique({
      where: { supabaseId: supabaseUser.id },
      select: { id: true, email: true, inTrial: true },
    })

    if (!dbUser) {
      // Handle case where a user record already exists with the same email but without supabaseId
      const email = supabaseUser.email || undefined
      const existingByEmail = email
        ? await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, inTrial: true },
          })
        : null

      if (existingByEmail) {
        dbUser = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            supabaseId: supabaseUser.id,
            email: email || existingByEmail.email,
            emailVerified: !!supabaseUser.email_confirmed_at,
          },
          select: { id: true, email: true, inTrial: true },
        })
      } else {
        dbUser = await prisma.user.create({
          data: {
            supabaseId: supabaseUser.id,
            email: email || '',
            emailVerified: !!supabaseUser.email_confirmed_at,
          },
          select: { id: true, email: true, inTrial: true },
        })
      }
    }

    userCache.set(supabaseUser.id, { ...dbUser, ts: Date.now() })

    // Add user to request (minimal fields)
    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      supabaseId: supabaseUser.id,
      inTrial: dbUser.inTrial,
    }

    return next()
  } catch (error) {
    console.error('Authentication error:', error)
    return res.status(401).json({ error: 'Authentication failed' })
  }
}

export const optionalAuth = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next() // No auth header, continue without user
    }

    const token = authHeader.substring(7)

    try {
      const supabaseUser = await getSupabaseUserFromToken(token)

      const now = Date.now()
      const cachedDbUser = userCache.get(supabaseUser.id)
      if (cachedDbUser && now - cachedDbUser.ts < USER_TTL_MS) {
        req.user = {
          id: cachedDbUser.id,
          email: cachedDbUser.email,
          supabaseId: supabaseUser.id,
        }
        return next()
      }

      const dbUser = await prisma.user.findUnique({
        where: { supabaseId: supabaseUser.id },
        select: { id: true, email: true },
      })

      if (dbUser) {
        userCache.set(supabaseUser.id, { ...dbUser, ts: Date.now() })
        req.user = {
          id: dbUser.id,
          email: dbUser.email,
          supabaseId: supabaseUser.id,
        }
      }
    } catch {
      // ignore auth failures for optional
    }

    next()
  } catch (error) {
    // Continue without user if auth fails
    next()
  }
}
