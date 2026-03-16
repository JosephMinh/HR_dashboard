/**
 * Integration Tests: Admin User Management API
 *
 * Covers: GET /api/users, POST /api/users, PATCH /api/users/:id,
 *         POST /api/users/:id/reset-password
 *
 * Bead: hr-1o3f.2
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { hash } from "bcryptjs"

import { createMockSession } from "@/test/auth"
import {
  getTestPrisma,
  setupIntegrationTests,
  createTestFactories,
} from "@/test/setup-integration"

const authMock = vi.fn()

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}))

// Mock rate limiting to avoid Redis dependency in tests
vi.mock("@/lib/rate-limit", () => ({
  enforceApiRateLimit: vi.fn().mockResolvedValue(null),
  enforceRouteRateLimit: vi.fn().mockResolvedValue(null),
}))

describe("Integration: Admin User Management API", () => {
  setupIntegrationTests()
  const factories = createTestFactories()

  beforeEach(() => {
    authMock.mockResolvedValue(createMockSession({ role: "ADMIN" }))
  })

  // =========================================================================
  // GET /api/users
  // =========================================================================

  describe("GET /api/users", () => {
    it("returns 401 when unauthenticated", async () => {
      authMock.mockResolvedValue(null)
      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(response.status).toBe(401)
    })

    it("returns 403 for non-admin role", async () => {
      authMock.mockResolvedValue(createMockSession({ role: "RECRUITER" }))
      const { GET } = await import("@/app/api/users/route")
      const response = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(response.status).toBe(403)
    })

    it("returns 403 for viewer role", async () => {
      authMock.mockResolvedValue(createMockSession({ role: "VIEWER" }))
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
      expect(data.users).toHaveLength(2)
      expect(data.total).toBe(2)
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
      expect(data.users).toHaveLength(2)
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
      authMock.mockResolvedValue(null)
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
      authMock.mockResolvedValue(createMockSession({ role: "RECRUITER" }))
      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ name: "New User", email: "new@test.com", role: "VIEWER" }),
        }) as never,
      )
      expect(response.status).toBe(403)
    })

    it("creates user with temp password and sets mustChangePassword=true", async () => {
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
      expect(data.tempPassword).toBeDefined()
      expect(typeof data.tempPassword).toBe("string")
      expect(data.tempPassword.length).toBeGreaterThanOrEqual(12)
      expect(data).not.toHaveProperty("passwordHash")
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
      authMock.mockResolvedValue(null)
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
      authMock.mockResolvedValue(createMockSession({ role: "RECRUITER" }))
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
      const prisma = getTestPrisma()
      const admin = await prisma.user.create({
        data: { name: "Admin", email: "admin@test.com", role: "ADMIN", passwordHash: "x" },
      })

      authMock.mockResolvedValue(createMockSession({ id: admin.id, role: "ADMIN" }))

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
      expect(data.error).toContain("own role")
    })

    it("prevents self-deactivation", async () => {
      const prisma = getTestPrisma()
      const admin = await prisma.user.create({
        data: { name: "Admin", email: "admin@test.com", role: "ADMIN", passwordHash: "x" },
      })

      authMock.mockResolvedValue(createMockSession({ id: admin.id, role: "ADMIN" }))

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
      expect(data.error).toContain("deactivate yourself")
    })

    it("prevents last-admin demotion", async () => {
      // Create only one admin
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
      // Need two admins so we can deactivate one
      await factories.createUser({ role: "ADMIN", email: "admin2@test.com" })
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
      authMock.mockResolvedValue(null)
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
      authMock.mockResolvedValue(createMockSession({ role: "RECRUITER" }))
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

    it("resets password and sets mustChangePassword=true", async () => {
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
      expect(data.tempPassword).toBeDefined()
      expect(typeof data.tempPassword).toBe("string")
      expect(data.tempPassword.length).toBeGreaterThanOrEqual(12)

      // Verify DB state
      const prisma = getTestPrisma()
      const updated = await prisma.user.findUnique({ where: { id: user.id } })
      expect(updated?.mustChangePassword).toBe(true)
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
})
