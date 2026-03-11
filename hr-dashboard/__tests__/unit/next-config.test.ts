import { describe, expect, it } from 'vitest'

import nextConfig, { buildContentSecurityPolicy, buildSecurityHeaders } from '../../next.config'

function toHeaderMap(isProduction: boolean) {
  return Object.fromEntries(
    buildSecurityHeaders(isProduction).map((header) => [header.key, header.value]),
  )
}

describe('next.config security headers', () => {
  it('enables defense-in-depth headers for all routes', async () => {
    const headers = await nextConfig.headers?.()

    expect(headers).toEqual([
      {
        source: '/:path*',
        headers: buildSecurityHeaders(false),
      },
    ])
  })

  it('keeps development CSP compatible with local tooling', () => {
    const csp = buildContentSecurityPolicy(false)
    const headers = toHeaderMap(false)

    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toContain('upgrade-insecure-requests')
    expect(headers['Strict-Transport-Security']).toBeUndefined()
  })

  it('tightens production-only browser policy', () => {
    const csp = buildContentSecurityPolicy(true)
    const headers = toHeaderMap(true)

    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain('upgrade-insecure-requests')
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()')
  })

  it('disables the framework fingerprint header', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })
})
