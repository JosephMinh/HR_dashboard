import { beforeEach, describe, expect, it } from "vitest"

import {
  createTestFactories,
  getTestPrisma,
  setupIntegrationTests,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

const testAuth = setupTestAuth()

describe("Integration: GET/PATCH /api/jobs/[id]", () => {
  setupIntegrationTests({ logger: true })
  const factories = createTestFactories()

  beforeEach(async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })
  })

  it("returns job detail with active candidate count", async () => {
    const prisma = getTestPrisma()
    const job = await factories.createJob({
      title: "Senior Developer",
      department: "Engineering",
      status: "OPEN",
    })
    await prisma.job.update({
      where: { id: job.id },
      data: { pipelineHealth: "ON_TRACK" },
    })

    const candidateOne = await factories.createCandidate({
      firstName: "Ada",
      lastName: "Lovelace",
    })
    const candidateTwo = await factories.createCandidate({
      firstName: "Grace",
      lastName: "Hopper",
    })

    await factories.createApplication({
      jobId: job.id,
      candidateId: candidateOne.id,
      stage: "SCREENING",
    })
    await factories.createApplication({
      jobId: job.id,
      candidateId: candidateTwo.id,
      stage: "REJECTED",
    })

    const { GET } = await import("@/app/api/jobs/[id]/route")
    const response = await GET(
      new Request(`http://localhost/api/jobs/${job.id}`) as never,
      { params: Promise.resolve({ id: job.id }) },
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.id).toBe(job.id)
    expect(payload.activeCandidateCount).toBe(1)
    expect(payload.applications).toHaveLength(2)
    expect(payload.applications[0].candidate).toHaveProperty("email")
  })

  it("returns 404 when job is missing", async () => {
    const { GET } = await import("@/app/api/jobs/[id]/route")
    // Use a valid UUID format that doesn't exist in the database
    const nonExistentId = "00000000-0000-4000-a000-000000000000"
    const response = await GET(
      new Request(`http://localhost/api/jobs/${nonExistentId}`) as never,
      { params: Promise.resolve({ id: nonExistentId }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: "Job not found" })
  })

  it("returns 403 for viewer role on patch", async () => {
    await testAuth.loginAsNewUser({ role: "VIEWER" })

    const job = await factories.createJob({
      title: "Support Engineer",
      department: "Support",
      status: "OPEN",
    })

    const { PATCH } = await import("@/app/api/jobs/[id]/route")
    const response = await PATCH(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      }) as never,
      { params: Promise.resolve({ id: job.id }) },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "Only admins and recruiters can create, update, or delete recruiting data.",
    })
  })

  it("rejects closedAt when status is not CLOSED", async () => {
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

    const { PATCH } = await import("@/app/api/jobs/[id]/route")
    const response = await PATCH(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          closedAt: "2026-03-10T01:00:00.000Z",
        }),
      }) as never,
      { params: Promise.resolve({ id: job.id }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "closedAt can only be set when status is CLOSED",
    })
  })

  it("sets closedAt when closing a job and writes audit log", async () => {
    const prisma = getTestPrisma()
    const job = await factories.createJob({
      title: "QA Engineer",
      department: "Quality",
      status: "OPEN",
    })
    await prisma.job.update({
      where: { id: job.id },
      data: { pipelineHealth: "ON_TRACK" },
    })

    const { PATCH } = await import("@/app/api/jobs/[id]/route")
    const response = await PATCH(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "CLOSED" }),
      }) as never,
      { params: Promise.resolve({ id: job.id }) },
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.status).toBe("CLOSED")
    expect(payload.closedAt).not.toBeNull()

    const updated = await prisma.job.findUnique({ where: { id: job.id } })
    expect(updated?.closedAt).not.toBeNull()

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: job.id, action: "JOB_UPDATED" },
    })
    expect(audit).not.toBeNull()
  })
})
