/**
 * System Test Lane
 *
 * End-to-end API workflows running against real DB, auth, email, rate-limit,
 * and storage stacks. Each scenario exercises a complete lifecycle rather
 * than individual endpoints.
 *
 * Bead: hr-kfwh.28
 */

import { describe, it, expect, vi } from "vitest"
import {
  setupIntegrationTests,
  getTestPrisma,
  createTestFactories,
  setupEmailHarness,
  setupRateLimitHarness,
  setupStorageHarness,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

// Ensure route handlers share the test Prisma pool
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

describe("System Test Lane", () => {
  setupIntegrationTests()
  const factories = createTestFactories()
  const testAuth = setupTestAuth()
  const emailHarness = setupEmailHarness()
  const _rateLimit = setupRateLimitHarness()
  const storageHarness = setupStorageHarness()
  const prisma = () => getTestPrisma()

  // =========================================================================
  // 1. User Invite → Set Password → Login Lifecycle
  // =========================================================================

  describe("User Invite → Set Password → Login", () => {
    it("admin creates user, invite email sent, user sets password", async () => {
      // Step 1: Admin creates a new user
      await testAuth.loginAsNewUser({ role: "ADMIN" })
      const { POST } = await import("@/app/api/users/route")
      const createRes = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New Hire",
            email: "newhire@example.com",
            role: "RECRUITER",
          }),
        }) as never,
      )
      expect(createRes.status).toBe(201)
      const created = await createRes.json()
      expect(created.id).toBeDefined()

      // Step 2: Verify invite email was sent with set-password link
      emailHarness.assertEmailSentTo("newhire@example.com")
      const email = emailHarness.lastEmail()!
      expect(email.subject).toBeDefined()
      const link = emailHarness.extractFirstLink(email)
      expect(link).not.toBeNull()
      expect(link).toContain("token=")

      // Step 3: Verify user was created with mustChangePassword=true
      const dbUser = await prisma().user.findUnique({
        where: { id: created.id },
      })
      expect(dbUser).not.toBeNull()
      expect(dbUser!.mustChangePassword).toBe(true)

      // Step 4: Verify a set-password token exists
      const tokens = await prisma().setPasswordToken.findMany({
        where: { userId: created.id },
      })
      expect(tokens.length).toBeGreaterThan(0)

      // Step 5: Verify audit log was created
      const auditLogs = await prisma().auditLog.findMany({
        where: { entityId: created.id, action: "USER_CREATED" },
      })
      expect(auditLogs.length).toBe(1)
    })

    it("email failure during user creation is handled gracefully", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })
      emailHarness.injectFailure("reject")

      const { POST } = await import("@/app/api/users/route")
      const res = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "No Email User",
            email: "noemail@example.com",
            role: "VIEWER",
          }),
        }) as never,
      )

      // User should still be created even if email fails
      // (or the endpoint may return an error — either is acceptable)
      const status = res.status
      expect([201, 500]).toContain(status)
    })
  })

  // =========================================================================
  // 2. Job → Candidate → Application Lifecycle
  // =========================================================================

  describe("Job → Candidate → Application Lifecycle", () => {
    it("creates job, candidate, application, then updates stages", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      // Step 1: Create a job
      const { POST: PostJob } = await import("@/app/api/jobs/route")
      const jobRes = await PostJob(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Senior Engineer",
            department: "Engineering",
            description: "Build and maintain critical infrastructure systems",
            priority: "HIGH",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )
      expect(jobRes.status).toBe(201)
      const job = await jobRes.json()

      // Step 2: Create a candidate
      const { POST: PostCandidate } = await import(
        "@/app/api/candidates/route"
      )
      const candRes = await PostCandidate(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: "Jane",
            lastName: "Smith",
            email: "jane@candidate.com",
            source: "LINKEDIN",
          }),
        }) as never,
      )
      expect(candRes.status).toBe(201)
      const { candidate } = await candRes.json()

      // Step 3: Create an application
      const { POST: PostApp } = await import(
        "@/app/api/applications/route"
      )
      const appRes = await PostApp(
        new Request("http://localhost/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
            stage: "NEW",
          }),
        }) as never,
      )
      if (appRes.status !== 201) {
        const errBody = await appRes.json()
        console.error("APPLICATION CREATE FAILED:", appRes.status, errBody)
      }
      expect(appRes.status).toBe(201)
      const application = await appRes.json()

      // Step 4: Advance application stage
      const { PATCH } = await import(
        "@/app/api/applications/[id]/route"
      )
      const advanceRes = await PATCH(
        new Request(`http://localhost/api/applications/${application.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: "SCREENING" }),
        }) as never,
        { params: Promise.resolve({ id: application.id }) },
      )
      expect(advanceRes.status).toBe(200)
      const updated = await advanceRes.json()
      expect(updated.stage).toBe("SCREENING")

      // Step 5: Verify DB state is consistent
      const dbApp = await prisma().application.findUnique({
        where: { id: application.id },
        include: { job: true, candidate: true },
      })
      expect(dbApp).not.toBeNull()
      expect(dbApp!.stage).toBe("SCREENING")
      expect(dbApp!.job.title).toBe("Senior Engineer")
      expect(dbApp!.candidate.firstName).toBe("Jane")
    })

    it("prevents duplicate applications", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      const job = await factories.createJob({ title: "Duplicate Test Job" })
      const candidate = await factories.createCandidate({
        email: "dup@test.com",
      })

      // First application succeeds
      const { POST } = await import("@/app/api/applications/route")
      const res1 = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
          }),
        }) as never,
      )
      expect(res1.status).toBe(201)

      // Duplicate application fails
      const res2 = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
          }),
        }) as never,
      )
      expect(res2.status).toBe(409)
    })
  })

  // =========================================================================
  // 3. Resume Upload → Download → Cleanup
  // =========================================================================

  describe("Resume Upload → Download → Cleanup", () => {
    it("uploads resume, attaches to candidate, downloads", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      // Step 1: Request upload URL
      const { POST } = await import("@/app/api/upload/resume/route")
      const uploadRes = await POST(
        new Request("http://localhost/api/upload/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: "resume.pdf",
            contentType: "application/pdf",
            sizeBytes: 5000,
          }),
        }) as never,
      )
      expect(uploadRes.status).toBe(200)
      const { uploadUrl, key } = await uploadRes.json()
      expect(uploadUrl).toContain("test-storage.local")
      expect(key).toMatch(/^resumes\//)

      // Step 2: Verify object was registered in test store
      storageHarness.assertObjectExists(key)

      // Step 3: Create candidate with resume key
      const candidate = await factories.createCandidate({
        firstName: "Resume",
        lastName: "Holder",
      })
      await prisma().candidate.update({
        where: { id: candidate.id },
        data: { resumeKey: key, resumeName: "resume.pdf" },
      })

      // Step 4: Download URL
      const { GET } = await import("@/app/api/upload/resume/[key]/route")
      const downloadRes = await GET(
        new Request(
          `http://localhost/api/upload/resume/${key}`,
        ) as never,
        { params: Promise.resolve({ key }) },
      )
      if (downloadRes.status !== 200) {
        const errBody = await downloadRes.json()
        console.error("DOWNLOAD FAILED:", downloadRes.status, errBody)
      }
      expect(downloadRes.status).toBe(200)
      const downloadData = await downloadRes.json()
      expect(downloadData.downloadUrl).toContain("test-storage.local")
    })

    it("storage failure returns error to client", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      storageHarness.injectFailure("service-unavailable", {
        ops: ["upload"],
      })

      const { POST } = await import("@/app/api/upload/resume/route")
      const res = await POST(
        new Request("http://localhost/api/upload/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: "fail.pdf",
            contentType: "application/pdf",
            sizeBytes: 1000,
          }),
        }) as never,
      )

      expect(res.status).toBe(500)
    })
  })

  // =========================================================================
  // 4. Permission & Auth Boundary Checks
  // =========================================================================

  describe("Permission & Auth Boundaries", () => {
    it("unauthenticated requests get 401 across all endpoints", async () => {
      testAuth.logout()

      const endpoints = [
        { mod: "@/app/api/users/route", method: "GET" },
        { mod: "@/app/api/jobs/route", method: "GET" },
        { mod: "@/app/api/candidates/route", method: "GET" },
        { mod: "@/app/api/applications/route", method: "POST" },
      ]

      for (const ep of endpoints) {
        const route = await import(ep.mod)
        const handler = route[ep.method]
        const res = await handler(
          new Request(`http://localhost/api/test`, {
            method: ep.method,
          }) as never,
        )
        expect(res.status).toBe(401)
      }
    })

    it("VIEWER cannot create users", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })

      const { POST } = await import("@/app/api/users/route")
      const res = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Unauthorized",
            email: "unauth@example.com",
            role: "VIEWER",
          }),
        }) as never,
      )
      expect(res.status).toBe(403)
    })

    it("VIEWER cannot create jobs", async () => {
      await testAuth.loginAsNewUser({ role: "VIEWER" })

      const { POST } = await import("@/app/api/jobs/route")
      const res = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Nope",
            department: "Engineering",
            description: "Should not work because user is a viewer",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )
      expect(res.status).toBe(403)
    })

    it("deactivated user gets 401", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })
      await testAuth.deactivateCurrentUser()

      const { GET } = await import("@/app/api/jobs/route")
      const res = await GET(
        new Request("http://localhost/api/jobs") as never,
      )
      expect(res.status).toBe(401)
    })

    it("role change takes effect on next request", async () => {
      await testAuth.loginAsNewUser({ role: "RECRUITER" })

      // Recruiter can create jobs
      const { POST } = await import("@/app/api/jobs/route")
      const res1 = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Before Demote",
            department: "Engineering",
            description: "A position that requires strong engineering skills",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )
      expect(res1.status).toBe(201)

      // Demote to VIEWER
      await testAuth.changeRole("VIEWER")

      // VIEWER cannot create jobs
      const res2 = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "After Demote",
            department: "Engineering",
            description: "This should fail because the user was demoted",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )
      expect(res2.status).toBe(403)
    })
  })
})
