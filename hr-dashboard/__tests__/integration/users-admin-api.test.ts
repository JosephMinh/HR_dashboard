/**
 * Integration Tests: Admin User Management API
 *
 * Covers: GET /api/users, POST /api/users, PATCH /api/users/:id,
 *         POST /api/users/:id/reset-password, POST /api/users/:id/resend-invite
 *
 * Bead: hr-1o3f.2
 *
 * Auth: Uses real DB-backed auth harness (setupTestAuth). Edge cases that test
 * stale/race-condition sessions use forceSession().
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { hash } from "bcryptjs"

import {
  getTestPrisma,
  setupIntegrationTests,
  createTestFactories,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"
import {
  hashSetPasswordToken,
  issueSetPasswordToken,
  validateSetPasswordToken,
} from "@/lib/password-setup-tokens"

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
}))

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}))

// Mock rate limiting to avoid Redis dependency in tests
vi.mock("@/lib/rate-limit", () => ({
  enforceApiRateLimit: vi.fn().mockResolvedValue(null),
  enforceRouteRateLimit: vi.fn().mockResolvedValue(null),
}))

describe("Integration: Admin User Management API", () => {
  setupIntegrationTests()
  const factories = createTestFactories()
  const testAuth = setupTestAuth()

  beforeEach(async () => {
    await testAuth.loginAsNewUser({ role: "ADMIN" })
    sendEmailMock.mockReset()
    sendEmailMock.mockResolvedValue({
      success: true,
      messageId: "test-message-id",
    })
  })

  // =========================================================================
  // GET /api/users
  // =========================================================================

  describe("GET /api/users", () => {
    it("returns 401 when unauthenticated", async () => {
      testAuth.logout()
      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(response.status).toBe(401)
    })

    it("returns 403 for non-admin role", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(response.status).toBe(403)
    })

    it("returns 403 for viewer role", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })
      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(response.status).toBe(403)
    })

    it("returns paginated user list with defaults", async () => {
      await factories.createUser({ name: "Alice", email: "alice@test.com", role: "ADMIN" })
      await factories.createUser({ name: "Bob", email: "bob@test.com", role: "RECRUITER" })

      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      // 3 users: auth admin + Alice + Bob
      expect(data.users).toHaveLength(3)
      expect(data.total).toBe(3)
      expect(data.page).toBe(1)
      expect(data.pageSize).toBe(20)
      expect(data.totalPages).toBe(1)
    })

    it("respects page and pageSize params", async () => {
      for (let i = 0; i < 5; i++) {
        await factories.createUser({ name: `User ${i}`, email: `user${i}@test.com` })
      }

      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users?page=2&pageSize=2") as never,
      )
      const data = await response.json()
      expect(data.users).toHaveLength(2)
      expect(data.page).toBe(2)
      expect(data.pageSize).toBe(2)
      expect(data.totalPages).toBe(3)
    })

    it("searches by name (case-insensitive)", async () => {
      await factories.createUser({ name: "Alice Admin", email: "alice@test.com" })
      await factories.createUser({ name: "Bob Recruiter", email: "bob@test.com" })

      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users?search=alice") as never,
      )
      const data = await response.json()
      expect(data.users).toHaveLength(1)
      expect(data.users[0].name).toBe("Alice Admin")
    })

    it("searches by email (case-insensitive)", async () => {
      await factories.createUser({ name: "Alice", email: "alice@test.com" })
      await factories.createUser({ name: "Bob", email: "bob@test.com" })

      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users?search=bob@") as never,
      )
      const data = await response.json()
      expect(data.users).toHaveLength(1)
      expect(data.users[0].email).toBe("bob@test.com")
    })

    it("filters by active=false", async () => {
      const prisma = getTestPrisma()
      await factories.createUser({ name: "Active", email: "active@test.com" })
      const inactive = await factories.createUser({ name: "Inactive", email: "inactive@test.com" })
      await prisma.user.update({ where: { id: inactive.id }, data: { active: false } })

      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users?active=false") as never,
      )
      const data = await response.json()
      expect(data.users).toHaveLength(1)
      expect(data.users[0].name).toBe("Inactive")
    })

    it("filters by active=all shows all users", async () => {
      const prisma = getTestPrisma()
      await factories.createUser({ name: "Active", email: "active@test.com" })
      const inactive = await factories.createUser({ name: "Inactive", email: "inactive@test.com" })
      await prisma.user.update({ where: { id: inactive.id }, data: { active: false } })

      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users?active=all") as never,
      )
      const data = await response.json()
      // 3 users: auth admin (active) + Active + Inactive
      expect(data.users).toHaveLength(3)
    })

    it("excludes passwordHash from response", async () => {
      await factories.createUser({ name: "Alice", email: "alice@test.com" })

      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users") as never,
      )
      const data = await response.json()
      expect(data.users[0]).not.toHaveProperty("passwordHash")
      expect(data.users[0]).toHaveProperty("mustChangePassword")
    })
  })

  // =========================================================================
  // POST /api/users
  // =========================================================================

  describe("POST /api/users", () => {
    it("returns 401 when unauthenticated", async () => {
      testAuth.logout()
      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ name: "New User", email: "new@test.com", role: "VIEWER" }),
        }) as never,
      )
      expect(response.status).toBe(401)
    })

    it("returns 403 for non-admin", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ name: "New User", email: "new@test.com", role: "VIEWER" }),
        }) as never,
      )
      expect(response.status).toBe(403)
    })

    it("creates user with set-password invite and sets mustChangePassword=true", async () => {
      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ name: "New Hire", email: "newhire@test.com", role: "RECRUITER" }),
        }) as never,
      )
      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.name).toBe("New Hire")
      expect(data.email).toBe("newhire@test.com")
      expect(data.role).toBe("RECRUITER")
      expect(data.mustChangePassword).toBe(true)
      expect(data.active).toBe(true)
      expect(data).not.toHaveProperty("passwordHash")
      expect(data.invite).toBeDefined()
      expect(data.invite.status).toBe("sent")
      expect(data.invite.setupUrl).toBeUndefined()
    })

    it("returns the manual setup link only when invite delivery fails", async () => {
      sendEmailMock.mockResolvedValueOnce({
        success: false,
        error: "SMTP unavailable",
      })

      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ name: "Manual Share", email: "manual@test.com", role: "VIEWER" }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.invite.status).toBe("failed")
      expect(data.invite.error).toContain("could not be delivered")
      expect(typeof data.invite.setupUrl).toBe("string")
      expect(data.invite.setupUrl).toContain("/set-password?token=")
    })

    it("normalizes email to lowercase", async () => {
      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ name: "Test", email: "UPPER@Test.COM", role: "VIEWER" }),
        }) as never,
      )
      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.email).toBe("upper@test.com")
    })

    it("returns 409 for duplicate email", async () => {
      await factories.createUser({ email: "dupe@test.com" })

      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ name: "Dupe", email: "dupe@test.com", role: "VIEWER" }),
        }) as never,
      )
      expect(response.status).toBe(409)
    })

    it("rejects invalid role", async () => {
      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ name: "Bad Role", email: "bad@test.com", role: "SUPERADMIN" }),
        }) as never,
      )
      expect(response.status).toBe(400)
    })

    it("rejects empty name", async () => {
      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ name: "", email: "empty@test.com", role: "VIEWER" }),
        }) as never,
      )
      expect(response.status).toBe(400)
    })

    it("rejects invalid email", async () => {
      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ name: "Bad Email", email: "not-an-email", role: "VIEWER" }),
        }) as never,
      )
      expect(response.status).toBe(400)
    })

    it("creates audit log on user creation", async () => {
      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ name: "Audited", email: "audited@test.com", role: "VIEWER" }),
        }) as never,
      )
      expect(response.status).toBe(201)
      const data = await response.json()

      const prisma = getTestPrisma()
      const log = await prisma.auditLog.findFirst({
        where: { entityId: data.id, action: "USER_CREATED" },
      })
      expect(log).not.toBeNull()
      expect(log?.entityType).toBe("User")
    })
  })

  // =========================================================================
  // PATCH /api/users/:id
  // =========================================================================

  describe("PATCH /api/users/:id", () => {
    it("returns 401 when unauthenticated", async () => {
      testAuth.logout()
      const user = await factories.createUser({ email: "target@test.com" })
      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/" + user.id, {
          method: "PATCH",
          body: JSON.stringify({ name: "Updated" }),
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(401)
    })

    it("returns 403 for non-admin", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      const user = await factories.createUser({ email: "target@test.com" })
      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/" + user.id, {
          method: "PATCH",
          body: JSON.stringify({ name: "Updated" }),
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(403)
    })

    it("updates user name", async () => {
      const user = await factories.createUser({ name: "Original", email: "target@test.com" })
      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/" + user.id, {
          method: "PATCH",
          body: JSON.stringify({ name: "Updated Name" }),
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.name).toBe("Updated Name")
    })

    it("updates user role", async () => {
      const user = await factories.createUser({ role: "VIEWER", email: "target@test.com" })
      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/" + user.id, {
          method: "PATCH",
          body: JSON.stringify({ role: "RECRUITER" }),
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.role).toBe("RECRUITER")
    })

    it("prevents self-role-change", async () => {
      const adminId = testAuth.currentUserId!

      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/" + adminId, {
          method: "PATCH",
          body: JSON.stringify({ role: "VIEWER" }),
        }) as never,
        { params: Promise.resolve({ id: adminId }) },
      )
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("own role")
    })

    it("prevents self-deactivation", async () => {
      const adminId = testAuth.currentUserId!

      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/" + adminId, {
          method: "PATCH",
          body: JSON.stringify({ active: false }),
        }) as never,
        { params: Promise.resolve({ id: adminId }) },
      )
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("deactivate yourself")
    })

    it("prevents last-admin demotion", async () => {
      // Edge case: stale session claims ADMIN but DB role was changed concurrently.
      // The server-side guard must still prevent demoting the last real admin.
      const prisma = getTestPrisma()
      const currentUser = testAuth.currentUserId!
      const currentAdmin = testAuth.getLastUser("ADMIN")!
      await prisma.user.update({ where: { id: currentUser }, data: { role: "VIEWER" } })
      testAuth.forceSession({
        expires: new Date(Date.now() + 3600000).toISOString(),
        user: { id: currentUser, name: currentAdmin.name, email: currentAdmin.email, role: "ADMIN", mustChangePassword: false },
      })

      const admin = await factories.createUser({ role: "ADMIN", email: "only-admin@test.com" })

      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/" + admin.id, {
          method: "PATCH",
          body: JSON.stringify({ role: "VIEWER" }),
        }) as never,
        { params: Promise.resolve({ id: admin.id }) },
      )
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("last admin")
    })

    it("prevents last-admin deactivation", async () => {
      // Same edge case: stale session, last-admin deactivation guard
      const prisma = getTestPrisma()
      const currentUser = testAuth.currentUserId!
      const currentAdmin = testAuth.getLastUser("ADMIN")!
      await prisma.user.update({ where: { id: currentUser }, data: { role: "VIEWER" } })
      testAuth.forceSession({
        expires: new Date(Date.now() + 3600000).toISOString(),
        user: { id: currentUser, name: currentAdmin.name, email: currentAdmin.email, role: "ADMIN", mustChangePassword: false },
      })

      const admin = await factories.createUser({ role: "ADMIN", email: "only-admin@test.com" })

      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/" + admin.id, {
          method: "PATCH",
          body: JSON.stringify({ active: false }),
        }) as never,
        { params: Promise.resolve({ id: admin.id }) },
      )
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("last admin")
    })

    it("returns 404 for unknown legacy string user ids", async () => {
      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/seed-user-admin", {
          method: "PATCH",
          body: JSON.stringify({ name: "Updated" }),
        }) as never,
        { params: Promise.resolve({ id: "seed-user-admin" }) },
      )
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain("User not found")
    })

    it("updates legacy string-id users", async () => {
      const prisma = getTestPrisma()
      const user = await prisma.user.create({
        data: {
          id: "seed-user-admin",
          name: "Legacy Admin",
          email: "legacy-admin@test.com",
          role: "ADMIN",
          passwordHash: "x",
        },
      })

      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/" + user.id, {
          method: "PATCH",
          body: JSON.stringify({ name: "Updated Legacy Admin" }),
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.name).toBe("Updated Legacy Admin")
    })

    it("returns 400 when no fields provided", async () => {
      const user = await factories.createUser({ email: "target@test.com" })
      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/" + user.id, {
          method: "PATCH",
          body: JSON.stringify({}),
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(400)
    })

    it("returns 404 for non-existent user", async () => {
      const fakeId = "a0000000-0000-4000-a000-000000000000"
      const { PATCH } = await import("@/app/api/users/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/users/" + fakeId, {
          method: "PATCH",
          body: JSON.stringify({ name: "Ghost" }),
        }) as never,
        { params: Promise.resolve({ id: fakeId }) },
      )
      expect(response.status).toBe(404)
    })

    it("creates audit log with USER_DEACTIVATED on deactivation", async () => {
      // Auth admin + target = 2 admins, so we can deactivate the target
      const target = await factories.createUser({ role: "ADMIN", email: "target@test.com" })

      const { PATCH } = await import("@/app/api/users/[id]/route")
      await PATCH(
        new Request("http://localhost/api/users/" + target.id, {
          method: "PATCH",
          body: JSON.stringify({ active: false }),
        }) as never,
        { params: Promise.resolve({ id: target.id }) },
      )

      const prisma = getTestPrisma()
      const log = await prisma.auditLog.findFirst({
        where: { entityId: target.id, action: "USER_DEACTIVATED" },
      })
      expect(log).not.toBeNull()
    })
  })

  // =========================================================================
  // POST /api/users/:id/reset-password
  // =========================================================================

  describe("POST /api/users/:id/reset-password", () => {
    it("returns 401 when unauthenticated", async () => {
      testAuth.logout()
      const user = await factories.createUser({ email: "target@test.com" })
      const { POST } = await import("@/app/api/users/[id]/reset-password/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/reset-password", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(401)
    })

    it("returns 403 for non-admin", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      const user = await factories.createUser({ email: "target@test.com" })
      const { POST } = await import("@/app/api/users/[id]/reset-password/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/reset-password", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(403)
    })

    it("sends reset email and invalidates password on success", async () => {
      const user = await factories.createUser({ email: "target@test.com" })

      const { POST } = await import("@/app/api/users/[id]/reset-password/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/reset-password", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data).not.toHaveProperty("tempPassword")

      // Verify DB state
      const prisma = getTestPrisma()
      const updated = await prisma.user.findUnique({ where: { id: user.id } })
      expect(updated?.mustChangePassword).toBe(true)
    })

    it("preserves the prior active token and current password when email delivery fails", async () => {
      const prisma = getTestPrisma()
      const originalPasswordHash = await hash("CurrentPassword123!", 10)
      const user = await factories.createUser({ email: "target@test.com" })
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: originalPasswordHash,
          mustChangePassword: false,
        },
      })

      const existingToken = await issueSetPasswordToken({ userId: user.id })
      sendEmailMock.mockResolvedValueOnce({
        success: false,
        error: "SMTP unavailable",
      })

      const { POST } = await import("@/app/api/users/[id]/reset-password/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/reset-password", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )

      expect(response.status).toBe(502)
      const data = await response.json()
      expect(data.error).toContain("existing password remains unchanged")

      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } })
      expect(updatedUser?.passwordHash).toBe(originalPasswordHash)
      expect(updatedUser?.mustChangePassword).toBe(false)

      const existingTokenState = await validateSetPasswordToken(existingToken.token)
      expect(existingTokenState).toMatchObject({
        valid: true,
        userId: user.id,
      })

      const activeTokens = await prisma.setPasswordToken.findMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      })
      expect(activeTokens).toHaveLength(1)
      expect(activeTokens[0]?.tokenHash).toBe(hashSetPasswordToken(existingToken.token))
    })

    it("returns 404 for unknown legacy string user ids", async () => {
      const { POST } = await import("@/app/api/users/[id]/reset-password/route")
      const response = await POST(
        new Request("http://localhost/api/users/seed-user-admin/reset-password", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: "seed-user-admin" }) },
      )
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain("User not found")
    })

    it("resets passwords for legacy string-id users", async () => {
      const prisma = getTestPrisma()
      const user = await prisma.user.create({
        data: {
          id: "seed-user-recruiter",
          name: "Legacy Recruiter",
          email: "legacy-recruiter@test.com",
          role: "RECRUITER",
          passwordHash: "existing-password",
          active: true,
        },
      })

      const { POST } = await import("@/app/api/users/[id]/reset-password/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/reset-password", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it("returns 404 for non-existent user", async () => {
      const fakeId = "a0000000-0000-4000-a000-000000000000"
      const { POST } = await import("@/app/api/users/[id]/reset-password/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + fakeId + "/reset-password", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: fakeId }) },
      )
      expect(response.status).toBe(404)
    })

    it("creates audit log with USER_PASSWORD_RESET", async () => {
      const user = await factories.createUser({ email: "target@test.com" })
      const { POST } = await import("@/app/api/users/[id]/reset-password/route")
      await POST(
        new Request("http://localhost/api/users/" + user.id + "/reset-password", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )

      const prisma = getTestPrisma()
      const log = await prisma.auditLog.findFirst({
        where: { entityId: user.id, action: "USER_PASSWORD_RESET" },
      })
      expect(log).not.toBeNull()
    })
  })

  // =========================================================================
  // POST /api/users/:id/resend-invite
  // =========================================================================

  describe("POST /api/users/:id/resend-invite", () => {
    it("returns 401 when unauthenticated", async () => {
      testAuth.logout()
      const user = await factories.createUser({ email: "target@test.com" })
      const { POST } = await import("@/app/api/users/[id]/resend-invite/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/resend-invite", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(401)
    })

    it("returns 403 for non-admin", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      const user = await factories.createUser({ email: "target@test.com" })
      const { POST } = await import("@/app/api/users/[id]/resend-invite/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/resend-invite", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(403)
    })

    it("returns 404 for unknown legacy string user ids", async () => {
      const { POST } = await import("@/app/api/users/[id]/resend-invite/route")
      const response = await POST(
        new Request("http://localhost/api/users/not-a-uuid/resend-invite", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: "not-a-uuid" }) },
      )
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain("User not found")
    })

    it("returns 404 for non-existent user", async () => {
      const fakeId = "a0000000-0000-4000-a000-000000000000"
      const { POST } = await import("@/app/api/users/[id]/resend-invite/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + fakeId + "/resend-invite", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: fakeId }) },
      )
      expect(response.status).toBe(404)
    })

    it("returns 400 for inactive user", async () => {
      const prisma = getTestPrisma()
      const user = await factories.createUser({ email: "inactive@test.com" })
      await prisma.user.update({
        where: { id: user.id },
        data: { active: false, mustChangePassword: true },
      })

      const { POST } = await import("@/app/api/users/[id]/resend-invite/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/resend-invite", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("inactive")
    })

    it("returns 409 when user has already completed onboarding", async () => {
      const prisma = getTestPrisma()
      const user = await factories.createUser({ email: "onboarded@test.com" })
      await prisma.user.update({
        where: { id: user.id },
        data: { mustChangePassword: false },
      })

      const { POST } = await import("@/app/api/users/[id]/resend-invite/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/resend-invite", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(409)
      const data = await response.json()
      expect(data.error).toContain("already completed onboarding")
    })

    it("resends invite for pending user and creates audit log", async () => {
      const prisma = getTestPrisma()
      const user = await factories.createUser({ email: "pending@test.com" })
      await prisma.user.update({
        where: { id: user.id },
        data: { mustChangePassword: true },
      })

      const { POST } = await import("@/app/api/users/[id]/resend-invite/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/resend-invite", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)

      // Verify audit log
      const log = await prisma.auditLog.findFirst({
        where: { entityId: user.id, action: "USER_INVITE_RESENT" },
      })
      expect(log).not.toBeNull()
      expect(log?.entityType).toBe("User")
    })

    it("resends invites for legacy string-id pending users", async () => {
      const prisma = getTestPrisma()
      const user = await prisma.user.create({
        data: {
          id: "seed-user-viewer",
          name: "Legacy Viewer",
          email: "legacy-viewer@test.com",
          role: "VIEWER",
          passwordHash: "existing-password",
          active: true,
          mustChangePassword: true,
        },
      })

      const { POST } = await import("@/app/api/users/[id]/resend-invite/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/resend-invite", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })

    it("restores the previous invite token when resend email delivery fails", async () => {
      const prisma = getTestPrisma()
      const user = await factories.createUser({ email: "pending@test.com" })
      await prisma.user.update({
        where: { id: user.id },
        data: { mustChangePassword: true },
      })

      const existingToken = await issueSetPasswordToken({ userId: user.id })
      sendEmailMock.mockResolvedValueOnce({
        success: false,
        error: "SMTP unavailable",
      })

      const { POST } = await import("@/app/api/users/[id]/resend-invite/route")
      const response = await POST(
        new Request("http://localhost/api/users/" + user.id + "/resend-invite", {
          method: "POST",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )

      expect(response.status).toBe(502)
      const data = await response.json()
      expect(data.error).toContain("could not be sent")

      const existingTokenState = await validateSetPasswordToken(existingToken.token)
      expect(existingTokenState).toMatchObject({
        valid: true,
        userId: user.id,
      })

      const activeTokens = await prisma.setPasswordToken.findMany({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      })
      expect(activeTokens).toHaveLength(1)
      expect(activeTokens[0]?.tokenHash).toBe(hashSetPasswordToken(existingToken.token))
    })
  })

  // =========================================================================
  // DELETE /api/users/:id
  // =========================================================================

  describe("DELETE /api/users/:id", () => {
    it("returns 401 when unauthenticated", async () => {
      testAuth.logout()
      const user = await factories.createUser({ email: "target@test.com" })
      const { DELETE } = await import("@/app/api/users/[id]/route")
      const response = await DELETE(
        new Request("http://localhost/api/users/" + user.id, {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(401)
    })

    it("returns 403 for non-admin", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      const user = await factories.createUser({ email: "target@test.com" })
      const { DELETE } = await import("@/app/api/users/[id]/route")
      const response = await DELETE(
        new Request("http://localhost/api/users/" + user.id, {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: user.id }) },
      )
      expect(response.status).toBe(403)
    })

    it("returns 403 when trying to delete yourself", async () => {
      const adminId = testAuth.currentUserId!
      const { DELETE } = await import("@/app/api/users/[id]/route")
      const response = await DELETE(
        new Request("http://localhost/api/users/" + adminId, {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: adminId }) },
      )
      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain("Cannot delete yourself")
    })

    it("returns 404 for unknown legacy string user ids", async () => {
      const { DELETE } = await import("@/app/api/users/[id]/route")
      const response = await DELETE(
        new Request("http://localhost/api/users/not-a-uuid", {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: "not-a-uuid" }) },
      )
      expect(response.status).toBe(404)
    })

    it("returns 404 for non-existent user", async () => {
      const fakeId = "a0000000-0000-4000-a000-000000000000"
      const { DELETE } = await import("@/app/api/users/[id]/route")
      const response = await DELETE(
        new Request("http://localhost/api/users/" + fakeId, {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: fakeId }) },
      )
      expect(response.status).toBe(404)
    })

    it("returns 409 when deleting the last active admin", async () => {
      // Edge case: stale session — actor was deactivated but session still claims ADMIN.
      // The server must prevent deleting the last active admin regardless.
      const prisma = getTestPrisma()
      const currentUser = testAuth.currentUserId!
      const currentAdmin = testAuth.getLastUser("ADMIN")!
      const admin = await factories.createUser({ role: "ADMIN", email: "only-admin@test.com" })
      // Deactivate all admins except the target so they are the last active admin
      await prisma.user.updateMany({
        where: { role: "ADMIN", NOT: { id: admin.id } },
        data: { active: false },
      })
      testAuth.forceSession({
        expires: new Date(Date.now() + 3600000).toISOString(),
        user: { id: currentUser, name: currentAdmin.name, email: currentAdmin.email, role: "ADMIN", mustChangePassword: false },
      })

      const { DELETE } = await import("@/app/api/users/[id]/route")
      const response = await DELETE(
        new Request("http://localhost/api/users/" + admin.id, {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: admin.id }) },
      )
      expect(response.status).toBe(409)
      const data = await response.json()
      expect(data.error).toContain("last active admin")
    })

    it("deletes user successfully and creates audit log", async () => {
      const prisma = getTestPrisma()
      const target = await factories.createUser({ email: "target@test.com" })

      const { DELETE } = await import("@/app/api/users/[id]/route")
      const response = await DELETE(
        new Request("http://localhost/api/users/" + target.id, {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: target.id }) },
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ success: true })

      // Verify user is deleted
      const deleted = await prisma.user.findUnique({ where: { id: target.id } })
      expect(deleted).toBeNull()

      // Verify audit log
      const log = await prisma.auditLog.findFirst({
        where: { entityId: target.id, action: "USER_DELETED" },
      })
      expect(log).not.toBeNull()
      expect(log?.entityType).toBe("User")
    })

    it("deletes legacy string-id users successfully", async () => {
      const prisma = getTestPrisma()
      const target = await prisma.user.create({
        data: {
          id: "seed-user-recruiter",
          name: "Legacy Recruiter",
          email: "legacy-recruiter@test.com",
          role: "RECRUITER",
          passwordHash: "x",
        },
      })

      const { DELETE } = await import("@/app/api/users/[id]/route")
      const response = await DELETE(
        new Request("http://localhost/api/users/" + target.id, {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: target.id }) },
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ success: true })

      const deleted = await prisma.user.findUnique({ where: { id: target.id } })
      expect(deleted).toBeNull()
    })

    it("allows deleting an inactive admin when other active admins exist", async () => {
      const prisma = getTestPrisma()
      const inactiveAdmin = await factories.createUser({ role: "ADMIN", email: "inactive@test.com" })
      await prisma.user.update({
        where: { id: inactiveAdmin.id },
        data: { active: false },
      })

      const { DELETE } = await import("@/app/api/users/[id]/route")
      const response = await DELETE(
        new Request("http://localhost/api/users/" + inactiveAdmin.id, {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: inactiveAdmin.id }) },
      )
      expect(response.status).toBe(200)
    })

    it("preserves audit logs after user deletion (SetNull)", async () => {
      const prisma = getTestPrisma()
      const target = await factories.createUser({ email: "target@test.com" })

      // Create an audit log referencing the target user
      await prisma.auditLog.create({
        data: {
          userId: target.id,
          action: "USER_UPDATED",
          entityType: "User",
          entityId: target.id,
        },
      })

      const { DELETE } = await import("@/app/api/users/[id]/route")
      await DELETE(
        new Request("http://localhost/api/users/" + target.id, {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: target.id }) },
      )

      // Audit logs should still exist with null userId
      const logs = await prisma.auditLog.findMany({
        where: { entityId: target.id },
      })
      expect(logs.length).toBeGreaterThanOrEqual(1)
    })
  })
})
