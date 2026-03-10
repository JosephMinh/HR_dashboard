import { beforeEach, describe, expect, it, vi } from "vitest"

import { createMockSession } from "@/test/auth"
import {
  createTestFactories,
  getTestPrisma,
  setupIntegrationTests,
} from "@/test/setup-integration"

const authMock = vi.fn()

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}))

describe("Integration: Applications API (POST/PATCH/DELETE)", () => {
  setupIntegrationTests({ logger: true })
  const factories = createTestFactories()

  async function signInAs(role: "ADMIN" | "RECRUITER" | "VIEWER" = "RECRUITER") {
    const user = await factories.createUser({
      role,
      email: `${role.toLowerCase()}-${Date.now()}@example.com`,
    })
    authMock.mockResolvedValue(createMockSession({ id: user.id, role: user.role }))
    return user
  }

  beforeEach(async () => {
    await signInAs("RECRUITER")
  })

  describe("POST /api/applications", () => {
    it("returns 401 when unauthenticated", async () => {
      authMock.mockResolvedValue(null)

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: "job-1",
            candidateId: "candidate-1",
          }),
        }) as never,
      )

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    })

    it("returns 403 for viewer role", async () => {
      await signInAs("VIEWER")
      const job = await factories.createJob({ title: "Backend Engineer" })
      const candidate = await factories.createCandidate({
        firstName: "Ava",
        lastName: "Martinez",
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
          }),
        }) as never,
      )

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toEqual({
        error: "Only admins and recruiters can create, update, or delete recruiting data.",
      })
    })

    it("creates an application and logs audit", async () => {
      const actor = await signInAs("RECRUITER")
      const job = await factories.createJob({
        title: "Platform Engineer",
        department: "Engineering",
      })
      const candidate = await factories.createCandidate({
        firstName: "Ada",
        lastName: "Lovelace",
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
            recruiterOwner: " Jordan  ",
            interviewNotes: "  Initial screen scheduled  ",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.stage).toBe("NEW")
      expect(payload.recruiterOwner).toBe("Jordan")
      expect(payload.interviewNotes).toBe("Initial screen scheduled")
      expect(payload.job.id).toBe(job.id)
      expect(payload.candidate.id).toBe(candidate.id)

      const prisma = getTestPrisma()
      const stored = await prisma.application.findUnique({
        where: { id: payload.id },
      })
      expect(stored).not.toBeNull()

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: payload.id,
          action: "APPLICATION_CREATED",
          userId: actor.id,
        },
      })
      expect(audit).not.toBeNull()
    })

    it("supports explicit initial stage", async () => {
      await signInAs("ADMIN")
      const job = await factories.createJob({ title: "Data Engineer" })
      const candidate = await factories.createCandidate({
        firstName: "Grace",
        lastName: "Hopper",
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
            stage: "SCREENING",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      await expect(response.json()).resolves.toMatchObject({
        stage: "SCREENING",
      })
    })

    it("returns 409 for duplicate application", async () => {
      const job = await factories.createJob({ title: "SRE" })
      const candidate = await factories.createCandidate({
        firstName: "Linus",
        lastName: "Torvalds",
      })
      await factories.createApplication({
        jobId: job.id,
        candidateId: candidate.id,
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
          }),
        }) as never,
      )

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        error: "Candidate is already applied to this job",
      })
    })

    it("handles concurrent duplicate requests with one success and one conflict", async () => {
      const job = await factories.createJob({ title: "Frontend Engineer" })
      const candidate = await factories.createCandidate({
        firstName: "Ken",
        lastName: "Thompson",
      })

      const { POST } = await import("@/app/api/applications/route")
      const requestOne = new Request("http://localhost/api/applications", {
        method: "POST",
        body: JSON.stringify({
          jobId: job.id,
          candidateId: candidate.id,
          stage: "NEW",
        }),
      })
      const requestTwo = new Request("http://localhost/api/applications", {
        method: "POST",
        body: JSON.stringify({
          jobId: job.id,
          candidateId: candidate.id,
          stage: "NEW",
        }),
      })

      const [first, second] = await Promise.all([
        POST(requestOne as never),
        POST(requestTwo as never),
      ])
      const statuses = [first.status, second.status].sort((a, b) => a - b)
      expect(statuses).toEqual([201, 409])

      const prisma = getTestPrisma()
      const count = await prisma.application.count({
        where: { jobId: job.id, candidateId: candidate.id },
      })
      expect(count).toBe(1)
    })

    it("returns 404 when job is missing", async () => {
      const candidate = await factories.createCandidate({
        firstName: "Margaret",
        lastName: "Hamilton",
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: "missing-job",
            candidateId: candidate.id,
          }),
        }) as never,
      )

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({ error: "Job not found" })
    })

    it("returns 404 when candidate is missing", async () => {
      const job = await factories.createJob({ title: "Infra Engineer" })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: "missing-candidate",
          }),
        }) as never,
      )

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({ error: "Candidate not found" })
    })

    it("returns 400 for invalid stage enum", async () => {
      const job = await factories.createJob({ title: "ML Engineer" })
      const candidate = await factories.createCandidate({
        firstName: "Anita",
        lastName: "Borg",
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
            stage: "NOT_A_STAGE",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: "Invalid stage" })
    })
  })

  describe("PATCH /api/applications/[id]", () => {
    it("updates stage and bumps stageUpdatedAt", async () => {
      const actor = await signInAs("RECRUITER")
      const job = await factories.createJob({ title: "Staff Engineer" })
      const candidate = await factories.createCandidate({
        firstName: "Barbara",
        lastName: "Liskov",
      })
      const application = await factories.createApplication({
        jobId: job.id,
        candidateId: candidate.id,
        stage: "NEW",
      })

      const before = application.stageUpdatedAt
      const { PATCH } = await import("@/app/api/applications/[id]/route")
      const response = await PATCH(
        new Request(`http://localhost/api/applications/${application.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            stage: "SCREENING",
            interviewNotes: "Moved to screening",
          }),
        }) as never,
        { params: Promise.resolve({ id: application.id }) },
      )

      expect(response.status).toBe(200)
      const payload = await response.json()
      expect(payload.stage).toBe("SCREENING")
      expect(new Date(payload.stageUpdatedAt).getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      )

      const prisma = getTestPrisma()
      const updated = await prisma.application.findUnique({
        where: { id: application.id },
      })
      expect(updated?.stage).toBe("SCREENING")
      expect(updated?.interviewNotes).toBe("Moved to screening")
      expect(updated?.stageUpdatedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      )

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: application.id,
          action: "APPLICATION_UPDATED",
          userId: actor.id,
        },
      })
      expect(audit).not.toBeNull()
    })

    it("keeps stageUpdatedAt unchanged when stage is not modified", async () => {
      await signInAs("RECRUITER")
      const job = await factories.createJob({ title: "QA Engineer" })
      const candidate = await factories.createCandidate({
        firstName: "Donald",
        lastName: "Knuth",
      })
      const application = await factories.createApplication({
        jobId: job.id,
        candidateId: candidate.id,
        stage: "INTERVIEWING",
      })

      const { PATCH } = await import("@/app/api/applications/[id]/route")
      const response = await PATCH(
        new Request(`http://localhost/api/applications/${application.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            recruiterOwner: "  Casey Recruiter  ",
          }),
        }) as never,
        { params: Promise.resolve({ id: application.id }) },
      )

      expect(response.status).toBe(200)
      const payload = await response.json()
      expect(payload.recruiterOwner).toBe("Casey Recruiter")
      expect(new Date(payload.stageUpdatedAt).toISOString()).toBe(
        application.stageUpdatedAt.toISOString(),
      )
    })

    it("clears recruiterOwner when null is provided", async () => {
      await signInAs("RECRUITER")
      const job = await factories.createJob({ title: "Product Manager" })
      const candidate = await factories.createCandidate({
        firstName: "Edsger",
        lastName: "Dijkstra",
      })
      const application = await factories.createApplication({
        jobId: job.id,
        candidateId: candidate.id,
        recruiterOwner: "Assigned Recruiter",
      })

      const { PATCH } = await import("@/app/api/applications/[id]/route")
      const response = await PATCH(
        new Request(`http://localhost/api/applications/${application.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            recruiterOwner: null,
          }),
        }) as never,
        { params: Promise.resolve({ id: application.id }) },
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        recruiterOwner: null,
      })
    })

    it("returns 400 for invalid stage", async () => {
      await signInAs("ADMIN")
      const job = await factories.createJob({ title: "DevOps Engineer" })
      const candidate = await factories.createCandidate({
        firstName: "Frances",
        lastName: "Allen",
      })
      const application = await factories.createApplication({
        jobId: job.id,
        candidateId: candidate.id,
      })

      const { PATCH } = await import("@/app/api/applications/[id]/route")
      const response = await PATCH(
        new Request(`http://localhost/api/applications/${application.id}`, {
          method: "PATCH",
          body: JSON.stringify({ stage: "INVALID_STAGE" }),
        }) as never,
        { params: Promise.resolve({ id: application.id }) },
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: "Invalid stage" })
    })

    it("returns 404 when application is missing", async () => {
      await signInAs("ADMIN")

      const { PATCH } = await import("@/app/api/applications/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/applications/missing", {
          method: "PATCH",
          body: JSON.stringify({ stage: "SCREENING" }),
        }) as never,
        { params: Promise.resolve({ id: "missing" }) },
      )

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({
        error: "Application not found",
      })
    })

    it("returns 401 when unauthenticated", async () => {
      authMock.mockResolvedValue(null)

      const { PATCH } = await import("@/app/api/applications/[id]/route")
      const response = await PATCH(
        new Request("http://localhost/api/applications/app-1", {
          method: "PATCH",
          body: JSON.stringify({ stage: "SCREENING" }),
        }) as never,
        { params: Promise.resolve({ id: "app-1" }) },
      )

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    })

    it("returns 403 for viewer role", async () => {
      await signInAs("VIEWER")
      const job = await factories.createJob({ title: "Security Engineer" })
      const candidate = await factories.createCandidate({
        firstName: "Radia",
        lastName: "Perlman",
      })
      const application = await factories.createApplication({
        jobId: job.id,
        candidateId: candidate.id,
      })

      const { PATCH } = await import("@/app/api/applications/[id]/route")
      const response = await PATCH(
        new Request(`http://localhost/api/applications/${application.id}`, {
          method: "PATCH",
          body: JSON.stringify({ stage: "SCREENING" }),
        }) as never,
        { params: Promise.resolve({ id: application.id }) },
      )

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toEqual({
        error: "Only admins and recruiters can create, update, or delete recruiting data.",
      })
    })
  })

  describe("DELETE /api/applications/[id]", () => {
    it("deletes application, preserves related entities, and logs audit", async () => {
      const actor = await signInAs("RECRUITER")
      const prisma = getTestPrisma()
      const job = await factories.createJob({ title: "Backend Engineer" })
      const candidate = await factories.createCandidate({
        firstName: "Mary",
        lastName: "Jackson",
      })
      const application = await factories.createApplication({
        jobId: job.id,
        candidateId: candidate.id,
      })

      const { DELETE } = await import("@/app/api/applications/[id]/route")
      const response = await DELETE(
        new Request(`http://localhost/api/applications/${application.id}`, {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: application.id }) },
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ success: true })

      const deleted = await prisma.application.findUnique({
        where: { id: application.id },
      })
      expect(deleted).toBeNull()

      const survivingJob = await prisma.job.findUnique({ where: { id: job.id } })
      const survivingCandidate = await prisma.candidate.findUnique({
        where: { id: candidate.id },
      })
      expect(survivingJob).not.toBeNull()
      expect(survivingCandidate).not.toBeNull()

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: application.id,
          action: "APPLICATION_DELETED",
          userId: actor.id,
        },
      })
      expect(audit).not.toBeNull()
    })

    it("returns 404 when application does not exist", async () => {
      await signInAs("ADMIN")

      const { DELETE } = await import("@/app/api/applications/[id]/route")
      const response = await DELETE(
        new Request("http://localhost/api/applications/missing", {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: "missing" }) },
      )

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({
        error: "Application not found",
      })
    })

    it("returns 401 when unauthenticated", async () => {
      authMock.mockResolvedValue(null)

      const { DELETE } = await import("@/app/api/applications/[id]/route")
      const response = await DELETE(
        new Request("http://localhost/api/applications/app-1", {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: "app-1" }) },
      )

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    })

    it("returns 403 for viewer role", async () => {
      await signInAs("VIEWER")
      const job = await factories.createJob({ title: "Data Scientist" })
      const candidate = await factories.createCandidate({
        firstName: "Katherine",
        lastName: "Johnson",
      })
      const application = await factories.createApplication({
        jobId: job.id,
        candidateId: candidate.id,
      })

      const { DELETE } = await import("@/app/api/applications/[id]/route")
      const response = await DELETE(
        new Request(`http://localhost/api/applications/${application.id}`, {
          method: "DELETE",
        }) as never,
        { params: Promise.resolve({ id: application.id }) },
      )

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toEqual({
        error: "Only admins and recruiters can create, update, or delete recruiting data.",
      })
    })
  })
})
