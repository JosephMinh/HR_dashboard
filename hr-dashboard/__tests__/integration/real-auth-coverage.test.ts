/**
 * Real Auth/Session Integration Coverage
 *
 * Proves that auth gates, role checks, and session-state enforcement
 * work with real DB-backed authentication (setupTestAuth), not mocks.
 *
 * Focus areas (per hr-kfwh.20.3):
 * 1. Admin user management — MANAGE_USERS permission
 * 2. Onboarding & password lifecycle — mustChangePassword gating
 * 3. Privileged recruiter mutations — MUTATE permission
 *
 * What this catches that mock-based tests miss:
 * - Deactivated user → auth() returns null → 401
 * - Role changed in DB → permission check uses new role
 * - User deleted → auth() returns null → 401
 * - mustChangePassword set in DB → session reflects it → 403 on gated routes
 *
 * Bead: hr-kfwh.20.3
 */

import { describe, it, expect, vi } from "vitest"
import {
  setupIntegrationTests,
  getTestPrisma,
  createTestFactories,
  setupEmailHarness,
  setupRateLimitHarness,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

// Real auth via setupTestAuth — exercises refreshJwtTokenFromDatabase
const testAuth = setupTestAuth()

// Ensure route handlers share the test Prisma pool to avoid deadlocks
vi.mock("@/lib/prisma", async () => {
  const { getTestPrisma } = await import("@/test/test-db")
  return { prisma: getTestPrisma() }
})

// Pass-through mocks for Vitest module re-evaluation compatibility
vi.mock("@/lib/email", async (importOriginal) => {
  return importOriginal()
})
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  return importOriginal()
})

describe("Real Auth: Integration Coverage", () => {
  setupIntegrationTests()
  const factories = createTestFactories()
  const _emailHarness = setupEmailHarness()
  const _rateLimit = setupRateLimitHarness()

  // ========================================================================
  // 1. Admin User Management — MANAGE_USERS permission
  // ========================================================================

  describe("Admin: GET /api/users", () => {
    it("ADMIN can list users", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })

      const { GET } = await import("@/app/api/users/route")
      const res = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(res.status).toBe(200)
    })

    it("RECRUITER gets 403", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      const { GET } = await import("@/app/api/users/route")
      const res = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(res.status).toBe(403)
    })

    it("VIEWER gets 403", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })

      const { GET } = await import("@/app/api/users/route")
      const res = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(res.status).toBe(403)
    })

    it("unauthenticated gets 401", async () => {
      testAuth.logout()

      const { GET } = await import("@/app/api/users/route")
      const res = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(res.status).toBe(401)
    })

    it("deactivated ADMIN gets 401", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })
      await testAuth.deactivateCurrentUser()

      const { GET } = await import("@/app/api/users/route")
      const res = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(res.status).toBe(401)
    })

    it("ADMIN demoted to VIEWER mid-session gets 403", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })
      await testAuth.changeRole("VIEWER")

      const { GET } = await import("@/app/api/users/route")
      const res = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(res.status).toBe(403)
    })
  })

  describe("Admin: POST /api/users", () => {
    const validPayload = {
      email: "newuser@example.com",
      name: "New User",
      role: "RECRUITER",
    }

    it("ADMIN can create a user", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })

      const { POST } = await import("@/app/api/users/route")
      const res = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify(validPayload),
        }) as never,
      )
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.email).toBe("newuser@example.com")
      expect(data.role).toBe("RECRUITER")
    })

    it("RECRUITER gets 403", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      const { POST } = await import("@/app/api/users/route")
      const res = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify(validPayload),
        }) as never,
      )
      expect(res.status).toBe(403)
    })

    it("VIEWER gets 403", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })

      const { POST } = await import("@/app/api/users/route")
      const res = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify(validPayload),
        }) as never,
      )
      expect(res.status).toBe(403)
    })

    it("deactivated ADMIN gets 401", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })
      await testAuth.deactivateCurrentUser()

      const { POST } = await import("@/app/api/users/route")
      const res = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify(validPayload),
        }) as never,
      )
      expect(res.status).toBe(401)
    })
  })

  describe("Admin: PATCH /api/users/:id", () => {
    it("ADMIN can update another user's role", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })
      const target = await testAuth.createUser({ role: "VIEWER" })

      const { PATCH } = await import("@/app/api/users/[id]/route")
      const req = new Request(`http://localhost/api/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: "RECRUITER" }),
      })
      const res = await PATCH(req as never, { params: Promise.resolve({ id: target.id }) })
      expect(res.status).toBe(200)

      const prisma = getTestPrisma()
      const updated = await prisma.user.findUnique({ where: { id: target.id } })
      expect(updated?.role).toBe("RECRUITER")
    })

    it("RECRUITER gets 403 on user update", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      const target = await testAuth.createUser({ role: "VIEWER" })

      const { PATCH } = await import("@/app/api/users/[id]/route")
      const req = new Request(`http://localhost/api/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Hacked" }),
      })
      const res = await PATCH(req as never, { params: Promise.resolve({ id: target.id }) })
      expect(res.status).toBe(403)
    })

    it("deactivated ADMIN gets 401 on user update", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })
      const target = await testAuth.createUser({ role: "VIEWER" })
      await testAuth.deactivateCurrentUser()

      const { PATCH } = await import("@/app/api/users/[id]/route")
      const req = new Request(`http://localhost/api/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Nope" }),
      })
      const res = await PATCH(req as never, { params: Promise.resolve({ id: target.id }) })
      expect(res.status).toBe(401)
    })
  })

  describe("Admin: DELETE /api/users/:id", () => {
    it("ADMIN can delete a user", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })
      const target = await testAuth.createUser({ role: "VIEWER" })

      const { DELETE } = await import("@/app/api/users/[id]/route")
      const req = new Request(`http://localhost/api/users/${target.id}`, {
        method: "DELETE",
      })
      const res = await DELETE(req as never, { params: Promise.resolve({ id: target.id }) })
      expect(res.status).toBe(200)
    })

    it("RECRUITER gets 403 on user delete", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      const target = await testAuth.createUser({ role: "VIEWER" })

      const { DELETE } = await import("@/app/api/users/[id]/route")
      const req = new Request(`http://localhost/api/users/${target.id}`, {
        method: "DELETE",
      })
      const res = await DELETE(req as never, { params: Promise.resolve({ id: target.id }) })
      expect(res.status).toBe(403)
    })

    it("VIEWER gets 403 on user delete", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })
      const target = await testAuth.createUser({ role: "VIEWER" })

      const { DELETE } = await import("@/app/api/users/[id]/route")
      const req = new Request(`http://localhost/api/users/${target.id}`, {
        method: "DELETE",
      })
      const res = await DELETE(req as never, { params: Promise.resolve({ id: target.id }) })
      expect(res.status).toBe(403)
    })
  })

  // ========================================================================
  // 2. Onboarding & Password Lifecycle — mustChangePassword gating
  // ========================================================================

  describe("Self-Service: PATCH /api/users/me", () => {
    it("user without gate can update profile", async () => {
      await testAuth.loginAsNewUser({
        role: "RECRUITER",
        name: "Free User",
        mustChangePassword: false,
      })

      const { PATCH } = await import("@/app/api/users/me/route")
      const res = await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "Updated Name" }),
        }) as never,
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.name).toBe("Updated Name")
    })

    it("user with mustChangePassword=true gets 403", async () => {
      await testAuth.loginAsNewUser({
        role: "RECRUITER",
        mustChangePassword: true,
      })

      const { PATCH } = await import("@/app/api/users/me/route")
      const res = await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "Should Fail" }),
        }) as never,
      )
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toMatch(/must change.*password/i)
    })

    it("gate lifted after password change → profile update succeeds", async () => {
      await testAuth.loginAsNewUser({
        role: "RECRUITER",
        mustChangePassword: true,
      })

      await testAuth.setMustChangePassword(false)

      const { PATCH } = await import("@/app/api/users/me/route")
      const res = await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "Now Works" }),
        }) as never,
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.name).toBe("Now Works")
    })

    it("deactivated user gets 401 on profile update", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      await testAuth.deactivateCurrentUser()

      const { PATCH } = await import("@/app/api/users/me/route")
      const res = await PATCH(
        new Request("http://localhost/api/users/me", {
          method: "PATCH",
          body: JSON.stringify({ name: "Ghost" }),
        }) as never,
      )
      expect(res.status).toBe(401)
    })
  })

  describe("Self-Service: POST /api/users/me/password", () => {
    it("unauthenticated gets 401", async () => {
      testAuth.logout()

      const { POST } = await import("@/app/api/users/me/password/route")
      const res = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: "anything",
            newPassword: "ValidNewPass123!",
          }),
        }) as never,
      )
      expect(res.status).toBe(401)
    })

    it("deactivated user gets 401 on password change", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      await testAuth.deactivateCurrentUser()

      const { POST } = await import("@/app/api/users/me/password/route")
      const res = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: testAuth.DEFAULT_PASSWORD,
            newPassword: "NewSecurePass1234!",
          }),
        }) as never,
      )
      expect(res.status).toBe(401)
    })

    it("authenticated user can change password with correct current password", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      const { POST } = await import("@/app/api/users/me/password/route")
      const res = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: testAuth.DEFAULT_PASSWORD,
            newPassword: "BrandNewSecure456!",
          }),
        }) as never,
      )
      expect(res.status).toBe(200)
    })

    it("wrong current password rejected with 401", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      const { POST } = await import("@/app/api/users/me/password/route")
      const res = await POST(
        new Request("http://localhost/api/users/me/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: "WrongPassword999!",
            newPassword: "ValidNewPass123!",
          }),
        }) as never,
      )
      expect(res.status).toBe(401)
    })
  })

  // ========================================================================
  // 3. Privileged Recruiter Mutations — MUTATE permission
  // ========================================================================

  describe("Recruiter: POST /api/jobs", () => {
    const validJob = {
      title: "Software Engineer",
      department: "Engineering",
      description: "Build great software.",
      pipelineHealth: "ON_TRACK",
    }

    it("RECRUITER can create a job", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      const { POST } = await import("@/app/api/jobs/route")
      const res = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify(validJob),
        }) as never,
      )
      expect(res.status).toBe(201)
    })

    it("ADMIN can create a job", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })

      const { POST } = await import("@/app/api/jobs/route")
      const res = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify(validJob),
        }) as never,
      )
      expect(res.status).toBe(201)
    })

    it("VIEWER gets 403 on job creation", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })

      const { POST } = await import("@/app/api/jobs/route")
      const res = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify(validJob),
        }) as never,
      )
      expect(res.status).toBe(403)
    })

    it("deactivated RECRUITER gets 401", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      await testAuth.deactivateCurrentUser()

      const { POST } = await import("@/app/api/jobs/route")
      const res = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify(validJob),
        }) as never,
      )
      expect(res.status).toBe(401)
    })

    it("VIEWER promoted to RECRUITER can create a job", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })
      await testAuth.changeRole("RECRUITER")

      const { POST } = await import("@/app/api/jobs/route")
      const res = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify(validJob),
        }) as never,
      )
      expect(res.status).toBe(201)
    })
  })

  describe("Recruiter: GET /api/jobs", () => {
    it("VIEWER can read jobs", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })

      const { GET } = await import("@/app/api/jobs/route")
      const res = await GET(
        new Request("http://localhost/api/jobs") as never,
      )
      expect(res.status).toBe(200)
    })

    it("unauthenticated gets 401", async () => {
      testAuth.logout()

      const { GET } = await import("@/app/api/jobs/route")
      const res = await GET(
        new Request("http://localhost/api/jobs") as never,
      )
      expect(res.status).toBe(401)
    })
  })

  describe("Recruiter: POST /api/candidates", () => {
    const validCandidate = {
      firstName: "Jane",
      lastName: "Smith",
      email: "jane.smith@example.com",
      source: "LINKEDIN",
    }

    it("RECRUITER can create a candidate", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      const { POST } = await import("@/app/api/candidates/route")
      const res = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify(validCandidate),
        }) as never,
      )
      expect(res.status).toBe(201)
    })

    it("VIEWER gets 403 on candidate creation", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })

      const { POST } = await import("@/app/api/candidates/route")
      const res = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify(validCandidate),
        }) as never,
      )
      expect(res.status).toBe(403)
    })

    it("deactivated RECRUITER gets 401", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      await testAuth.deactivateCurrentUser()

      const { POST } = await import("@/app/api/candidates/route")
      const res = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify(validCandidate),
        }) as never,
      )
      expect(res.status).toBe(401)
    })
  })

  describe("Recruiter: POST /api/applications", () => {
    it("RECRUITER can create an application", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      const prisma = getTestPrisma()
      const job = await prisma.job.create({
        data: {
          title: "Auth Test Job",
          department: "Engineering",
          description: "Test",
          status: "OPEN",
          priority: "MEDIUM",
          pipelineHealth: "ON_TRACK",
        },
      })
      const candidate = await prisma.candidate.create({
        data: {
          firstName: "Auth",
          lastName: "Test",
          email: `auth-test-${Date.now()}@example.com`,
          source: "LINKEDIN",
        },
      })

      const { POST } = await import("@/app/api/applications/route")
      const res = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
          }),
        }) as never,
      )
      expect(res.status).toBe(201)
    })

    it("VIEWER gets 403 on application creation", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })

      const { POST } = await import("@/app/api/applications/route")
      const res = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: "fake-job",
            candidateId: "fake-candidate",
          }),
        }) as never,
      )
      expect(res.status).toBe(403)
    })

    it("unauthenticated gets 401", async () => {
      testAuth.logout()

      const { POST } = await import("@/app/api/applications/route")
      const res = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: "fake-job",
            candidateId: "fake-candidate",
          }),
        }) as never,
      )
      expect(res.status).toBe(401)
    })
  })

  describe("Recruiter: PATCH /api/jobs/:id", () => {
    it("RECRUITER can update a job", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      const prisma = getTestPrisma()
      const job = await prisma.job.create({
        data: {
          title: "Patchable Job",
          department: "Engineering",
          description: "Test",
          status: "OPEN",
          priority: "MEDIUM",
          pipelineHealth: "ON_TRACK",
        },
      })

      const { PATCH } = await import("@/app/api/jobs/[id]/route")
      const req = new Request(`http://localhost/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated Job" }),
      })
      const res = await PATCH(req as never, { params: Promise.resolve({ id: job.id }) })
      expect(res.status).toBe(200)
    })

    it("VIEWER gets 403 on job update", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })

      const prisma = getTestPrisma()
      const job = await prisma.job.create({
        data: {
          title: "Locked Job",
          department: "Engineering",
          description: "Test",
          status: "OPEN",
          priority: "MEDIUM",
          pipelineHealth: "ON_TRACK",
        },
      })

      const { PATCH } = await import("@/app/api/jobs/[id]/route")
      const req = new Request(`http://localhost/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "Hacked" }),
      })
      const res = await PATCH(req as never, { params: Promise.resolve({ id: job.id }) })
      expect(res.status).toBe(403)
    })

    it("RECRUITER demoted to VIEWER mid-session gets 403", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      const prisma = getTestPrisma()
      const job = await prisma.job.create({
        data: {
          title: "Demote Test",
          department: "Engineering",
          description: "Test",
          status: "OPEN",
          priority: "MEDIUM",
          pipelineHealth: "ON_TRACK",
        },
      })

      await testAuth.changeRole("VIEWER")

      const { PATCH } = await import("@/app/api/jobs/[id]/route")
      const req = new Request(`http://localhost/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "Should Fail" }),
      })
      const res = await PATCH(req as never, { params: Promise.resolve({ id: job.id }) })
      expect(res.status).toBe(403)
    })
  })

  describe("Dashboard: GET /api/dashboard/stats", () => {
    it("VIEWER can read dashboard stats", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })

      const { GET } = await import("@/app/api/dashboard/stats/route")
      const res = await GET(
        new Request("http://localhost/api/dashboard/stats") as never,
        { params: Promise.resolve({}) },
      )
      expect(res.status).toBe(200)
    })

    it("deactivated user gets 401 on dashboard", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })
      await testAuth.deactivateCurrentUser()

      const { GET } = await import("@/app/api/dashboard/stats/route")
      const res = await GET(
        new Request("http://localhost/api/dashboard/stats") as never,
        { params: Promise.resolve({}) },
      )
      expect(res.status).toBe(401)
    })
  })

  // ========================================================================
  // 4. Cross-Cutting: Session State Integrity
  // ========================================================================

  describe("Session State Integrity", () => {
    it("deleted user gets 401 on any route", async () => {
      const user = await testAuth.loginAsNewUser({ role: "ADMIN" })
      const prisma = getTestPrisma()
      await prisma.user.delete({ where: { id: user.id } })

      const { GET } = await import("@/app/api/users/route")
      const res = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(res.status).toBe(401)
    })

    it("re-activated user regains access", async () => {
      const user = await testAuth.loginAsNewUser({ role: "ADMIN" })
      await testAuth.deactivateCurrentUser()

      const { GET } = await import("@/app/api/users/route")
      const blocked = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(blocked.status).toBe(401)

      await testAuth.activateUser(user.id)

      const restored = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(restored.status).toBe(200)
    })

    it("multi-user scenario: switching users changes permissions", async () => {
      const admin = await testAuth.createUser({ role: "ADMIN" })
      const viewer = await testAuth.createUser({ role: "VIEWER" })

      testAuth.loginAs(admin.id)
      const { GET } = await import("@/app/api/users/route")
      const adminRes = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(adminRes.status).toBe(200)

      testAuth.loginAs(viewer.id)
      const viewerRes = await GET(
        new Request("http://localhost/api/users") as never,
      )
      expect(viewerRes.status).toBe(403)
    })
  })
})
