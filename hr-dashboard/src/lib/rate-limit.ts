import { NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

type RateLimitScope = 'auth' | 'read' | 'upload' | 'write'

type RateLimitRule = {
  limit: number
  windowMs: number
}

type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
}

type RateLimitStore = Map<string, number[]>

type RateLimitRequest = {
  headers: Headers
  method: string
  nextUrl: {
    pathname: string
  }
}

const RATE_LIMIT_RULES: Record<RateLimitScope, RateLimitRule> = {
  auth: { limit: 10, windowMs: 60_000 },
  write: { limit: 60, windowMs: 60_000 },
  read: { limit: 300, windowMs: 60_000 },
  upload: { limit: 20, windowMs: 60_000 },
}

const RATE_LIMIT_METHODS = new Set(['POST', 'PATCH', 'DELETE', 'PUT'])
const TRUSTED_CLIENT_IP_HEADERS = [
  'cf-connecting-ip',
  'x-vercel-forwarded-for',
  'x-real-ip',
]

// Redis-backed rate limiters for production (shared across serverless instances)
function getRedisRateLimiters(): Record<RateLimitScope, Ratelimit> | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    return null
  }

  const scopedGlobal = globalThis as typeof globalThis & {
    __hrDashboardRedisRateLimiters?: Record<RateLimitScope, Ratelimit>
  }

  if (!scopedGlobal.__hrDashboardRedisRateLimiters) {
    const redis = new Redis({ url, token })

    scopedGlobal.__hrDashboardRedisRateLimiters = {
      auth: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(RATE_LIMIT_RULES.auth.limit, '1 m'),
        prefix: 'ratelimit:auth',
      }),
      write: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(RATE_LIMIT_RULES.write.limit, '1 m'),
        prefix: 'ratelimit:write',
      }),
      read: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(RATE_LIMIT_RULES.read.limit, '1 m'),
        prefix: 'ratelimit:read',
      }),
      upload: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(RATE_LIMIT_RULES.upload.limit, '1 m'),
        prefix: 'ratelimit:upload',
      }),
    }
  }

  return scopedGlobal.__hrDashboardRedisRateLimiters
}

// In-memory store for local development (fallback when Redis is not configured)
function getStore(): RateLimitStore {
  const scopedGlobal = globalThis as typeof globalThis & {
    __hrDashboardRateLimitStore?: RateLimitStore
  }

  if (!scopedGlobal.__hrDashboardRateLimitStore) {
    scopedGlobal.__hrDashboardRateLimitStore = new Map()
  }

  return scopedGlobal.__hrDashboardRateLimitStore
}

function pruneStore(now: number) {
  for (const [key, timestamps] of getStore()) {
    const activeTimestamps = timestamps.filter((timestamp) => now - timestamp < 60_000)
    if (activeTimestamps.length === 0) {
      getStore().delete(key)
      continue
    }

    if (activeTimestamps.length !== timestamps.length) {
      getStore().set(key, activeTimestamps)
    }
  }
}

export function resolveRateLimitScope(pathname: string, method: string): RateLimitScope | null {
  if (!pathname.startsWith('/api/')) {
    return null
  }

  if (pathname.startsWith('/api/auth/')) {
    return 'auth'
  }

  if (pathname.startsWith('/api/upload/')) {
    return 'upload'
  }

  if (RATE_LIMIT_METHODS.has(method.toUpperCase())) {
    return 'write'
  }

  return 'read'
}

export function getClientAddress(request: Pick<RateLimitRequest, 'headers'>): string {
  for (const headerName of TRUSTED_CLIENT_IP_HEADERS) {
    const headerValue = request.headers.get(headerName)
    if (!headerValue) {
      continue
    }

    const clientIp = headerValue
      .split(',')
      .map((value) => value.trim())
      .find(Boolean)

    if (clientIp) {
      return clientIp
    }
  }

  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const firstForwardedIp = forwardedFor
      .split(',')
      .map((value) => value.trim())
      .find(Boolean)

    if (firstForwardedIp) {
      return firstForwardedIp
    }
  }

  return 'unknown'
}

export async function consumeRateLimitRedis(
  scope: RateLimitScope,
  clientAddress: string,
): Promise<RateLimitResult> {
  const limiters = getRedisRateLimiters()
  if (!limiters) {
    throw new Error('Redis rate limiters not configured')
  }

  const { success, limit, remaining, reset } = await limiters[scope].limit(clientAddress)
  const resetAt = reset
  const now = Date.now()

  return {
    allowed: success,
    limit,
    remaining,
    resetAt,
    retryAfterSeconds: success ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000)),
  }
}

export function consumeRateLimitMemory(
  scope: RateLimitScope,
  clientAddress: string,
  now = Date.now(),
): RateLimitResult {
  pruneStore(now)

  const rule = RATE_LIMIT_RULES[scope]
  const key = `${scope}:${clientAddress}`
  const timestamps = getStore().get(key) ?? []
  const activeTimestamps = timestamps.filter((timestamp) => now - timestamp < rule.windowMs)
  const oldestActiveTimestamp = activeTimestamps[0] ?? now
  const resetAt = oldestActiveTimestamp + rule.windowMs

  if (activeTimestamps.length >= rule.limit) {
    getStore().set(key, activeTimestamps)

    return {
      allowed: false,
      limit: rule.limit,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    }
  }

  const nextTimestamps = [...activeTimestamps, now]
  getStore().set(key, nextTimestamps)

  return {
    allowed: true,
    limit: rule.limit,
    remaining: rule.limit - nextTimestamps.length,
    resetAt: now + rule.windowMs,
    retryAfterSeconds: 0,
  }
}

export function consumeRateLimit(
  scope: RateLimitScope,
  clientAddress: string,
  now = Date.now(),
): RateLimitResult {
  // Sync version for backward compatibility - uses in-memory store only
  return consumeRateLimitMemory(scope, clientAddress, now)
}

export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

function buildRateLimitResponse(
  scope: RateLimitScope,
  result: RateLimitResult,
): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many requests',
      scope,
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    },
  )
}

export async function enforceApiRateLimit(
  request: RateLimitRequest,
  now = Date.now(),
): Promise<NextResponse | undefined> {
  const scope = resolveRateLimitScope(request.nextUrl.pathname, request.method)
  if (!scope) {
    return undefined
  }

  const clientAddress = getClientAddress(request)

  // Use Redis in production, in-memory for local development
  let result: RateLimitResult
  if (isRedisConfigured()) {
    try {
      result = await consumeRateLimitRedis(scope, clientAddress)
    } catch {
      // Fall back to in-memory if Redis fails
      result = consumeRateLimitMemory(scope, clientAddress, now)
    }
  } else {
    result = consumeRateLimitMemory(scope, clientAddress, now)
  }

  if (result.allowed) {
    return undefined
  }

  return buildRateLimitResponse(scope, result)
}

/**
 * Per-route rate limiter for sensitive endpoints (e.g., password change).
 * Uses a custom key (e.g., "password-change:{userId}") with configurable limits.
 * Uses Redis when available (shared across serverless instances), falls back to in-memory.
 * Returns a 429 NextResponse if exceeded, or null if allowed.
 */
export async function enforceRouteRateLimit(
  key: string,
  rule: { limit: number; windowMs: number },
  now = Date.now(),
): Promise<NextResponse | null> {
  const storeKey = `route:${key}`

  // Use Redis when available for cross-instance consistency
  if (isRedisConfigured()) {
    try {
      const url = process.env.UPSTASH_REDIS_REST_URL!
      const token = process.env.UPSTASH_REDIS_REST_TOKEN!
      const redis = new Redis({ url, token })
      const windowSeconds = Math.ceil(rule.windowMs / 1000)
      const limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(rule.limit, `${windowSeconds} s`),
        prefix: 'ratelimit:route',
      })
      const { success, limit, remaining, reset } = await limiter.limit(storeKey)

      if (!success) {
        const retryAfterSeconds = Math.max(1, Math.ceil((reset - now) / 1000))
        return NextResponse.json(
          { error: "Too many requests", retryAfterSeconds },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfterSeconds),
              "X-RateLimit-Limit": String(limit),
              "X-RateLimit-Remaining": String(remaining),
              "X-RateLimit-Reset": String(Math.ceil(reset / 1000)),
            },
          },
        )
      }
      return null
    } catch {
      // Fall through to in-memory on Redis failure
    }
  }

  pruneStore(now)

  const timestamps = getStore().get(storeKey) ?? []
  const activeTimestamps = timestamps.filter((ts) => now - ts < rule.windowMs)

  if (activeTimestamps.length >= rule.limit) {
    getStore().set(storeKey, activeTimestamps)
    const resetAt = (activeTimestamps[0] ?? now) + rule.windowMs
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000))

    return NextResponse.json(
      { error: "Too many requests", retryAfterSeconds },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Limit": String(rule.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
        },
      },
    )
  }

  const nextTimestamps = [...activeTimestamps, now]
  getStore().set(storeKey, nextTimestamps)
  return null
}

export function resetRateLimitStore() {
  getStore().clear()
}
