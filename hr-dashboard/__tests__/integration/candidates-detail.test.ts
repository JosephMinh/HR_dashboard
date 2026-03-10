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

describe("Integration: GET/PATCH /api/candidates/[id]", () => {
  setupIntegrationTests({ logger: true })
  const factories = createTestFactories()

  beforeEach(() => {
    authMock.mockResolvedValue(createMockSession({ role: "RECRUITER" }))
  })

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null)

    const { GET } = await import("@/app/api/candidates/[id]/route")
    const response = await GET(
      new Request("http://localhost/api/candidates/missing") as never,
      { params: Promise.resolve({ id: "missing" }) },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 404 when candidate is missing", async () => {
    const { GET } = await import("@/app/api/candidates/[id]/route")
    // Use a valid UUID format that doesn't exist in the database
    const nonExistentId = "00000000-0000-4000-a000-000000000000"
    const response = await GET(
      new Request(`http://localhost/api/candidates/${nonExistentId}`) as never,
      { params: Promise.resolve({ id: nonExistentId }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: "Candidate not found" })
  })

  it("returns candidate with applications and job details", async () => {
    const prisma = getTestPrisma()
    const job = await factories.createJob({
      title: "Product Manager",
      department: "Product",
      status: "OPEN",
    })
    await prisma.job.update({
      where: { id: job.id },
      data: { pipelineHealth: "ON_TRACK" },
    })

    const candidate = await factories.createCandidate({
      firstName: "Ava",
      lastName: "Chen",
      email: "ava.chen@example.com",
    })
    await factories.createApplication({
      jobId: job.id,
      candidateId: candidate.id,
      stage: "INTERVIEWING",
    })

    const { GET } = await import("@/app/api/candidates/[id]/route")
    const response = await GET(
      new Request(`http://localhost/api/candidates/${candidate.id}`) as never,
      { params: Promise.resolve({ id: candidate.id }) },
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.candidate.email).toBe("ava.chen@example.com")
    expect(payload.candidate.applications).toHaveLength(1)
    expect(payload.candidate.applications[0].job.title).toBe("Product Manager")
  })

  it("returns 403 for viewer role on patch", async () => {
    authMock.mockResolvedValue(createMockSession({ role: "VIEWER" }))

    const candidate = await factories.createCandidate({
      firstName: "Jordan",
      lastName: "Kim",
    })

    const { PATCH } = await import("@/app/api/candidates/[id]/route")
    const response = await PATCH(
      new Request(`http://localhost/api/candidates/${candidate.id}`, {
        method: "PATCH",
        body: JSON.stringify({ firstName: "Updated" }),
      }) as never,
      { params: Promise.resolve({ id: candidate.id }) },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "Only admins and recruiters can create, update, or delete recruiting data.",
    })
  })

  it("rejects invalid email format", async () => {
    const candidate = await factories.createCandidate({
      firstName: "Taylor",
      lastName: "Ray",
    })

    const { PATCH } = await import("@/app/api/candidates/[id]/route")
    const response = await PATCH(
      new Request(`http://localhost/api/candidates/${candidate.id}`, {
        method: "PATCH",
        body: JSON.stringify({ email: "not-an-email" }),
      }) as never,
      { params: Promise.resolve({ id: candidate.id }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Invalid email format" })
  })

  it("requires resume key and name together", async () => {
    const candidate = await factories.createCandidate({
      firstName: "Riley",
      lastName: "Stone",
    })

    const { PATCH } = await import("@/app/api/candidates/[id]/route")
    const response = await PATCH(
      new Request(`http://localhost/api/candidates/${candidate.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          resumeKey: "resumes/123e4567-e89b-12d3-a456-426614174000.pdf",
        }),
      }) as never,
      { params: Promise.resolve({ id: candidate.id }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "resumeKey and resumeName must be provided together",
    })
  })

  it("updates candidate and writes audit log", async () => {
    const prisma = getTestPrisma()
    const candidate = await factories.createCandidate({
      firstName: "Lillian",
      lastName: "Patel",
    })

    const { PATCH } = await import("@/app/api/candidates/[id]/route")
    const response = await PATCH(
      new Request(`http://localhost/api/candidates/${candidate.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: "Lia",
          lastName: "Patel",
          email: "lia.patel@example.com",
        }),
      }) as never,
      { params: Promise.resolve({ id: candidate.id }) },
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.candidate.firstName).toBe("Lia")
    expect(payload.candidate.email).toBe("lia.patel@example.com")

    const updated = await prisma.candidate.findUnique({
      where: { id: candidate.id },
    })
    expect(updated?.firstName).toBe("Lia")

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: candidate.id, action: "CANDIDATE_UPDATED" },
    })
    expect(audit).not.toBeNull()
  })
})
