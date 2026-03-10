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

describe("Integration: POST /api/candidates", () => {
  setupIntegrationTests({ logger: true })
  const factories = createTestFactories()

  beforeEach(() => {
    authMock.mockResolvedValue(createMockSession({ role: "RECRUITER" }))
  })

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null)

    const { POST } = await import("@/app/api/candidates/route")
    const response = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Ava",
          lastName: "Chen",
        }),
      }) as never,
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 403 for viewer role", async () => {
    authMock.mockResolvedValue(createMockSession({ role: "VIEWER" }))

    const { POST } = await import("@/app/api/candidates/route")
    const response = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Ava",
          lastName: "Chen",
        }),
      }) as never,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "Only admins and recruiters can create, update, or delete recruiting data.",
    })
  })

  it("rejects invalid resume key format", async () => {
    const { POST } = await import("@/app/api/candidates/route")
    const response = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Ava",
          lastName: "Chen",
          resumeKey: "invalid-key",
          resumeName: "resume.pdf",
        }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Invalid resume key format" })
  })

  it("requires resume key and name together", async () => {
    const { POST } = await import("@/app/api/candidates/route")
    const response = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Ava",
          lastName: "Chen",
          resumeKey: "resumes/123e4567-e89b-12d3-a456-426614174000.pdf",
        }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "resumeKey and resumeName must be provided together",
    })
  })

  it("returns 400 when jobId is not found", async () => {
    const { POST } = await import("@/app/api/candidates/route")
    const response = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Ava",
          lastName: "Chen",
          jobId: "missing-job",
        }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Job not found" })
  })

  it("creates candidate and links job application", async () => {
    const prisma = getTestPrisma()
    const job = await factories.createJob({
      title: "Backend Engineer",
      department: "Engineering",
      status: "OPEN",
    })
    await prisma.job.update({
      where: { id: job.id },
      data: { pipelineHealth: "ON_TRACK" },
    })

    const { POST } = await import("@/app/api/candidates/route")
    const response = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Ava",
          lastName: "Chen",
          email: "ava.chen@example.com",
          jobId: job.id,
          resumeKey: "resumes/123e4567-e89b-12d3-a456-426614174000.pdf",
          resumeName: "resume.pdf",
        }),
      }) as never,
    )

    expect(response.status).toBe(201)
    const payload = await response.json()
    expect(payload.candidate.email).toBe("ava.chen@example.com")
    expect(payload.linkedJobId).toBe(job.id)

    const storedCandidate = await prisma.candidate.findUnique({
      where: { id: payload.candidate.id },
    })
    expect(storedCandidate).not.toBeNull()

    const application = await prisma.application.findFirst({
      where: { jobId: job.id, candidateId: payload.candidate.id },
    })
    expect(application).not.toBeNull()
    expect(application?.stage).toBe("NEW")

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: payload.candidate.id, action: "CANDIDATE_CREATED" },
    })
    expect(audit).not.toBeNull()
  })
})
