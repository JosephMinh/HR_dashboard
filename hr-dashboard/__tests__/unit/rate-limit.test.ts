import { afterEach, describe, expect, it } from 'vitest'

import {
  consumeRateLimit,
  enforceApiRateLimit,
  getClientAddress,
  resetRateLimitStore,
  resolveRateLimitScope,
} from '@/lib/rate-limit'

function createRequest(pathname: string, method = 'GET', forwardedFor = '203.0.113.10') {
  return {
    method,
    headers: new Headers({ 'x-forwarded-for': forwardedFor }),
    nextUrl: new URL(`https://example.com${pathname}`),
  }
}

describe('rate-limit helpers', () => {
  afterEach(() => {
    resetRateLimitStore()
  })

  it('classifies API requests into the expected limiter scopes', () => {
    expect(resolveRateLimitScope('/dashboard', 'GET')).toBeNull()
    expect(resolveRateLimitScope('/api/auth/signin', 'POST')).toBe('auth')
    expect(resolveRateLimitScope('/api/auth/callback/credentials', 'POST')).toBe('auth')
    expect(resolveRateLimitScope('/api/auth/session', 'GET')).toBe('read')
    expect(resolveRateLimitScope('/api/auth/providers', 'GET')).toBe('read')
    expect(resolveRateLimitScope('/api/auth/error', 'GET')).toBe('read')
    expect(resolveRateLimitScope('/api/upload/resume', 'POST')).toBe('upload')
    expect(resolveRateLimitScope('/api/jobs', 'PATCH')).toBe('write')
    expect(resolveRateLimitScope('/api/jobs', 'GET')).toBe('read')
  })

  it('extracts the first forwarded client IP', () => {
    const clientAddress = getClientAddress({
      headers: new Headers({ 'x-forwarded-for': '198.51.100.7, 198.51.100.8' }),
    })

    expect(clientAddress).toBe('198.51.100.7')
  })

  it('prefers trusted proxy headers over x-forwarded-for', () => {
    const clientAddress = getClientAddress({
      headers: new Headers({
        'cf-connecting-ip': '203.0.113.99',
        'x-forwarded-for': '198.51.100.7, 198.51.100.8',
      }),
    })

    expect(clientAddress).toBe('203.0.113.99')
  })

  it('tracks quota within a rolling auth window', () => {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const result = consumeRateLimit('auth', '198.51.100.9', 1_000 + attempt)
      expect(result.allowed).toBe(true)
    }

    const tenthRequest = consumeRateLimit('auth', '198.51.100.9', 1_100)
    const eleventhRequest = consumeRateLimit('auth', '198.51.100.9', 1_101)

    expect(tenthRequest.allowed).toBe(true)
    expect(tenthRequest.remaining).toBe(0)
    expect(eleventhRequest.allowed).toBe(false)
    expect(eleventhRequest.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('returns a 429 response with retry metadata after the write quota is exhausted', async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const allowedResponse = await enforceApiRateLimit(
        createRequest('/api/jobs', 'POST', '192.0.2.15'),
        10_000 + attempt,
      )
      expect(allowedResponse).toBeUndefined()
    }

    const blockedResponse = await enforceApiRateLimit(
      createRequest('/api/jobs', 'POST', '192.0.2.15'),
      10_500,
    )

    expect(blockedResponse).toBeDefined()
    expect(blockedResponse?.status).toBe(429)
    expect(blockedResponse?.headers.get('Retry-After')).toBeTruthy()
    expect(blockedResponse?.headers.get('X-RateLimit-Limit')).toBe('60')
    expect(blockedResponse?.headers.get('X-RateLimit-Remaining')).toBe('0')

    const payload = await blockedResponse?.json()
    expect(payload).toMatchObject({
      error: 'Too many requests',
      scope: 'write',
    })
  })
})
