import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compare, hash } from 'bcryptjs'

import {
  hashSetPasswordToken,
  issueSetPasswordToken,
} from '@/lib/password-setup-tokens'
import {
  createTestFactories,
  getTestPrisma,
  setupIntegrationTests,
} from '@/test/setup-integration'

const { enforceRouteRateLimitMock, getClientAddressMock } = vi.hoisted(() => ({
  enforceRouteRateLimitMock: vi.fn(),
  getClientAddressMock: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  enforceRouteRateLimit: enforceRouteRateLimitMock,
  getClientAddress: getClientAddressMock,
}))

describe('Integration: Password Setup API', () => {
  setupIntegrationTests()
  const factories = createTestFactories()

  beforeEach(() => {
    enforceRouteRateLimitMock.mockResolvedValue(null)
    getClientAddressMock.mockReturnValue('127.0.0.1')
  })

  describe('GET /api/password-setup', () => {
    it('returns valid=true and a masked email for an active token', async () => {
      const user = await factories.createUser({ email: 'candidate@example.com' })
      const issued = await issueSetPasswordToken({ userId: user.id })

      const { GET } = await import('@/app/api/password-setup/route')
      const response = await GET(
        new Request(`http://localhost/api/password-setup?token=${issued.token}`) as never,
      )

      expect(response.status).toBe(200)
      expect(enforceRouteRateLimitMock).toHaveBeenCalled()

      const data = await response.json()
      expect(data.valid).toBe(true)
      expect(data.emailMasked).toContain('@')
      expect(data.emailMasked).not.toBe('candidate@example.com')
    })

    it('returns invalid when token is missing or malformed', async () => {
      const { GET } = await import('@/app/api/password-setup/route')

      const missingResponse = await GET(
        new Request('http://localhost/api/password-setup') as never,
      )
      expect(missingResponse.status).toBe(200)
      await expect(missingResponse.json()).resolves.toEqual({
        valid: false,
        reason: 'invalid',
      })

      const malformedResponse = await GET(
        new Request('http://localhost/api/password-setup?token=bad') as never,
      )
      expect(malformedResponse.status).toBe(200)
      await expect(malformedResponse.json()).resolves.toEqual({
        valid: false,
        reason: 'invalid',
      })
    })

    it('returns expired for an expired token', async () => {
      const prisma = getTestPrisma()
      const user = await factories.createUser({ email: 'expired@example.com' })
      const rawToken = 'A'.repeat(43)

      await prisma.setPasswordToken.create({
        data: {
          userId: user.id,
          tokenHash: hashSetPasswordToken(rawToken),
          expiresAt: new Date(Date.now() - 60_000),
        },
      })

      const { GET } = await import('@/app/api/password-setup/route')
      const response = await GET(
        new Request(`http://localhost/api/password-setup?token=${rawToken}`) as never,
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        valid: false,
        reason: 'expired',
      })
    })

    it('returns used for a consumed token', async () => {
      const prisma = getTestPrisma()
      const user = await factories.createUser({ email: 'used@example.com' })
      const issued = await issueSetPasswordToken({ userId: user.id })

      await prisma.setPasswordToken.updateMany({
        where: { tokenHash: hashSetPasswordToken(issued.token) },
        data: { usedAt: new Date() },
      })

      const { GET } = await import('@/app/api/password-setup/route')
      const response = await GET(
        new Request(`http://localhost/api/password-setup?token=${issued.token}`) as never,
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        valid: false,
        reason: 'used',
      })
    })
  })

  describe('POST /api/password-setup', () => {
    it('consumes a valid token, updates password, and clears mustChangePassword', async () => {
      const prisma = getTestPrisma()
      const originalHash = await hash('InitialPass#123', 10)
      const user = await factories.createUser({
        email: 'reset-target@example.com',
        passwordHash: originalHash,
      })
      await prisma.user.update({
        where: { id: user.id },
        data: { mustChangePassword: true },
      })

      const issued = await issueSetPasswordToken({ userId: user.id })

      const { POST } = await import('@/app/api/password-setup/route')
      const response = await POST(
        new Request('http://localhost/api/password-setup', {
          method: 'POST',
          body: JSON.stringify({
            token: issued.token,
            newPassword: 'BrandNewPass#123',
          }),
        }) as never,
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ success: true })

      const updated = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          passwordHash: true,
          mustChangePassword: true,
        },
      })
      expect(updated).not.toBeNull()
      expect(updated?.mustChangePassword).toBe(false)
      expect(updated?.passwordHash).not.toBe(originalHash)
      await expect(compare('BrandNewPass#123', updated?.passwordHash ?? '')).resolves.toBe(true)

      const tokenRecord = await prisma.setPasswordToken.findUnique({
        where: { tokenHash: hashSetPasswordToken(issued.token) },
        select: { usedAt: true },
      })
      expect(tokenRecord?.usedAt).toBeInstanceOf(Date)
    })

    it('returns 400 with unmet requirements for weak passwords', async () => {
      const user = await factories.createUser({ email: 'weak-password@example.com' })
      const issued = await issueSetPasswordToken({ userId: user.id })

      const { POST } = await import('@/app/api/password-setup/route')
      const response = await POST(
        new Request('http://localhost/api/password-setup', {
          method: 'POST',
          body: JSON.stringify({
            token: issued.token,
            newPassword: 'weak',
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Password does not meet policy requirements')
      expect(Array.isArray(data.unmetRequirements)).toBe(true)
      expect(data.unmetRequirements.length).toBeGreaterThan(0)
    })

    it('returns explicit invalid/expired/used reasons for bad tokens', async () => {
      const prisma = getTestPrisma()
      const user = await factories.createUser({ email: 'reason-checks@example.com' })
      // Use a separate user for the expired token so that issueSetPasswordToken
      // (which invalidates all unused tokens for its user) doesn't mark it used.
      const expiredUser = await factories.createUser({ email: 'reason-expired@example.com' })

      const expiredToken = 'B'.repeat(43)
      await prisma.setPasswordToken.create({
        data: {
          userId: expiredUser.id,
          tokenHash: hashSetPasswordToken(expiredToken),
          expiresAt: new Date(Date.now() - 1_000),
        },
      })

      const used = await issueSetPasswordToken({ userId: user.id })
      await prisma.setPasswordToken.updateMany({
        where: { tokenHash: hashSetPasswordToken(used.token) },
        data: { usedAt: new Date() },
      })

      const { POST } = await import('@/app/api/password-setup/route')
      const malformedToken = 'bad'

      const invalidResponse = await POST(
        new Request('http://localhost/api/password-setup', {
          method: 'POST',
          body: JSON.stringify({
            token: malformedToken,
            newPassword: 'ValidPass#123',
          }),
        }) as never,
      )
      expect(invalidResponse.status).toBe(400)
      await expect(invalidResponse.json()).resolves.toMatchObject({
        reason: 'invalid',
      })

      const expiredResponse = await POST(
        new Request('http://localhost/api/password-setup', {
          method: 'POST',
          body: JSON.stringify({
            token: expiredToken,
            newPassword: 'ValidPass#123',
          }),
        }) as never,
      )
      expect(expiredResponse.status).toBe(400)
      await expect(expiredResponse.json()).resolves.toMatchObject({
        reason: 'expired',
      })

      const usedResponse = await POST(
        new Request('http://localhost/api/password-setup', {
          method: 'POST',
          body: JSON.stringify({
            token: used.token,
            newPassword: 'ValidPass#123',
          }),
        }) as never,
      )
      expect(usedResponse.status).toBe(400)
      await expect(usedResponse.json()).resolves.toMatchObject({
        reason: 'used',
      })
    })
  })

  it('invalidates prior unused tokens when issuing a new token', async () => {
    const user = await factories.createUser({ email: 'rotate@example.com' })
    const first = await issueSetPasswordToken({ userId: user.id })
    const second = await issueSetPasswordToken({ userId: user.id })

    const { GET } = await import('@/app/api/password-setup/route')

    const firstValidation = await GET(
      new Request(`http://localhost/api/password-setup?token=${first.token}`) as never,
    )
    await expect(firstValidation.json()).resolves.toEqual({
      valid: false,
      reason: 'used',
    })

    const secondValidation = await GET(
      new Request(`http://localhost/api/password-setup?token=${second.token}`) as never,
    )
    await expect(secondValidation.json()).resolves.toMatchObject({
      valid: true,
    })
  })
})
