/**
 * Integration Tests: Self-Service API (profile + password change)
 *
 * Covers: PATCH /api/users/me, POST /api/users/me/password
 *
 * Bead: hr-1o3f.2
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { compare } from "bcryptjs"

import {
  getTestPrisma,
  setupIntegrationTests,
  createTestFactories,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

const testAuth = setupTestAuth()

// Mock rate limiting to avoid Redis dependency in tests
vi.mock("@/lib/rate-limit", () => ({
  enforceApiRateLimit: vi.fn().mockResolvedValue(null),
  enforceRouteRateLimit: vi.fn().mockResolvedValue(null),
}))

describe("Integration: Self-Service API", () => {
  setupIntegrationTests()
  const factories = createTestFactories()

  const TEST_PASSWORD = "OldPassword123!"
  let testUserId: string

  beforeEach(async () => {
    const user = await testAuth.loginAsNewUser({
      role: "RECRUITER",
      name: "Test User",
      email: "self@test.com",
      password: TEST_PASSWORD,
      mustChangePassword: false,
    })
    testUserId = user.id
  })

  // =========================================================================
  // PATCH /api/users/me
  // =========================================================================

  describe("PATCH /api/users/me", () => {
    it("returns 401 when unauthenticated", async () => {
      testAuth.logout()
      const { PATCH } = await import("@/app/api/users/me/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "Updated" }),
        }) as never,
      )
      expect(response.status).toBe(401)
    })

    it("updates name successfully", async () => {
      const { PATCH } = await import("@/app/api/users/me/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "New Name" }),
        }) as never,
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.name).toBe("New Name")
      expect(data).not.toHaveProperty("passwordHash")
    })

    it("trims name whitespace", async () => {
      const { PATCH } = await import("@/app/api/users/me/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "  Trimmed Name  " }),
        }) as never,
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.name).toBe("Trimmed Name")
    })

    it("rejects empty name", async () => {
      const { PATCH } = await import("@/app/api/users/me/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "" }),
        }) as never,
      )
      expect(response.status).toBe(400)
    })

    it("rejects name longer than 100 chars", async () => {
      const { PATCH } = await import("@/app/api/users/me/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "a".repeat(101) }),
        }) as never,
      )
      expect(response.status).toBe(400)
    })

    it("returns 400 when no fields provided", async () => {
      const { PATCH } = await import("@/app/api/users/me/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({}),
        }) as never,
      )
      expect(response.status).toBe(400)
    })

    it("blocks gated user from profile update", async () => {
      await testAuth.setMustChangePassword(true)
      const { PATCH } = await import("@/app/api/users/me/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "Blocked" }),
        }) as never,
      )
      expect(response.status).toBe(403)
    })

    it("creates audit log for name update", async () => {
      const { PATCH } = await import("@/app/api/users/me/route")
      await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "Audited" }),
        }) as never,
      )

      const prisma = getTestPrisma()
      const log = await prisma.auditLog.findFirst({
        where: { entityId: testUserId, action: "USER_UPDATED" },
      })
      expect(log).not.toBeNull()
      expect(log?.entityType).toBe("User")
    })
  })

  // =========================================================================
  // POST /api/users/me/password
  // =========================================================================

  describe("POST /api/users/me/password", () => {
    const NEW_PASSWORD = "NewPassword456!"

    it("returns 401 when unauthenticated", async () => {
      testAuth.logout()
      const { POST } = await import("@/app/api/users/me/password/route")
      const response = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
        }) as never,
      )
      expect(response.status).toBe(401)
    })

    it("changes password successfully", async () => {
      const { POST } = await import("@/app/api/users/me/password/route")
      const response = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
        }) as never,
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).not.toHaveProperty("passwordHash")

      // Verify the new password works
      const prisma = getTestPrisma()
      const updated = await prisma.user.findUnique({ where: { id: testUserId } })
      expect(await compare(NEW_PASSWORD, updated!.passwordHash)).toBe(true)
    })

    it("clears mustChangePassword on successful change", async () => {
      // Set mustChangePassword to true first
      const prisma = getTestPrisma()
      await prisma.user.update({
        where: { id: testUserId },
        data: { mustChangePassword: true },
      })

      await testAuth.setMustChangePassword(true)

      const { POST } = await import("@/app/api/users/me/password/route")
      const response = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
        }) as never,
      )
      expect(response.status).toBe(200)

      const updated = await prisma.user.findUnique({ where: { id: testUserId } })
      expect(updated?.mustChangePassword).toBe(false)
    })

    it("returns 401 for wrong current password", async () => {
      const { POST } = await import("@/app/api/users/me/password/route")
      const response = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: "WrongPassword123!", newPassword: NEW_PASSWORD }),
        }) as never,
      )
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toContain("incorrect")
    })

    it("rejects new password that matches current", async () => {
      const { POST } = await import("@/app/api/users/me/password/route")
      const response = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD }),
        }) as never,
      )
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("different")
    })

    it("rejects password that fails policy (too short)", async () => {
      const { POST } = await import("@/app/api/users/me/password/route")
      const response = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: "Short1!" }),
        }) as never,
      )
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("policy")
      expect(data.unmetRequirements).toBeDefined()
    })

    it("rejects password without uppercase", async () => {
      const { POST } = await import("@/app/api/users/me/password/route")
      const response = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: TEST_PASSWORD,
            newPassword: "alllowercase123!",
          }),
        }) as never,
      )
      expect(response.status).toBe(400)
    })

    it("rejects password without symbol", async () => {
      const { POST } = await import("@/app/api/users/me/password/route")
      const response = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: TEST_PASSWORD,
            newPassword: "NoSymbolHere123",
          }),
        }) as never,
      )
      expect(response.status).toBe(400)
    })

    it("rejects missing fields", async () => {
      const { POST } = await import("@/app/api/users/me/password/route")
      const response = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: TEST_PASSWORD }),
        }) as never,
      )
      expect(response.status).toBe(400)
    })

    it("creates audit log with USER_PASSWORD_CHANGED", async () => {
      const { POST } = await import("@/app/api/users/me/password/route")
      await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
        }) as never,
      )

      const prisma = getTestPrisma()
      const log = await prisma.auditLog.findFirst({
        where: { entityId: testUserId, action: "USER_PASSWORD_CHANGED" },
      })
      expect(log).not.toBeNull()
      expect(log?.entityType).toBe("User")
    })
  })
})
