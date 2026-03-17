import { beforeEach, describe, expect, it } from "vitest"

import {
  getTestPrisma,
  setupIntegrationTests,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

const testAuth = setupTestAuth()

describe("Integration: POST /api/jobs", () => {
  setupIntegrationTests({ logger: true })

  beforeEach(async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })
  })

  it("returns 401 when unauthenticated", async () => {
    testAuth.logout()

    const { POST } = await import("@/app/api/jobs/route")
    const response = await POST(
      new Request("http://localhost/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: "Security Engineer",
          department: "Security",
          description: "Protect infrastructure and data.",
          pipelineHealth: "ON_TRACK",
        }),
      }) as never,
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 403 for viewer role", async () => {
    await testAuth.loginAsNewUser({ role: "VIEWER" })

    const { POST } = await import("@/app/api/jobs/route")
    const response = await POST(
      new Request("http://localhost/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: "Support Engineer",
          department: "Support",
          description: "Handle customer support escalations.",
          pipelineHealth: "ON_TRACK",
        }),
      }) as never,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "Only admins and recruiters can create, update, or delete recruiting data.",
    })
  })

  it("rejects targetFillDate before openedAt", async () => {
    const { POST } = await import("@/app/api/jobs/route")
    const response = await POST(
      new Request("http://localhost/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: "Platform Engineer",
          department: "Engineering",
          description: "Own platform reliability.",
          openedAt: "2026-04-10T00:00:00.000Z",
          targetFillDate: "2026-04-01T00:00:00.000Z",
          pipelineHealth: "ON_TRACK",
        }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Target fill date must be on or after opened date",
    })
  })

  it("requires pipeline health for open jobs", async () => {
    const { POST } = await import("@/app/api/jobs/route")
    const response = await POST(
      new Request("http://localhost/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: "UX Designer",
          department: "Design",
          description: "Drive interaction design quality.",
          status: "OPEN",
        }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Pipeline health is required for open jobs",
    })
  })

  it("creates a closed job and logs audit entry", async () => {
    const { POST } = await import("@/app/api/jobs/route")
    const response = await POST(
      new Request("http://localhost/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: "Staff Engineer",
          department: "Engineering",
          description: "Lead core platform strategy.",
          status: "CLOSED",
          priority: "HIGH",
        }),
      }) as never,
    )

    expect(response.status).toBe(201)
    const payload = await response.json()
    expect(payload.status).toBe("CLOSED")
    expect(payload.closedAt).not.toBeNull()

    const prisma = getTestPrisma()
    const job = await prisma.job.findUnique({ where: { id: payload.id } })
    expect(job).not.toBeNull()
    expect(job?.status).toBe("CLOSED")

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: payload.id, action: "JOB_CREATED" },
    })
    expect(audit).not.toBeNull()
  })
})
