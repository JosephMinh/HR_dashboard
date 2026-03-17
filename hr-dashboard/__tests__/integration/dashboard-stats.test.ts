import { beforeEach, describe, expect, it } from "vitest"

import {
  createTestFactories,
  getTestPrisma,
  setupIntegrationTests,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

const testAuth = setupTestAuth()

describe("Integration: GET /api/dashboard/stats", () => {
  setupIntegrationTests({ logger: true })
  const factories = createTestFactories()

  beforeEach(async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })
  })

  it("returns 401 when unauthenticated", async () => {
    testAuth.logout()

    const { GET } = await import("@/app/api/dashboard/stats/route")
    const response = await GET(new Request("http://localhost/api/dashboard/stats") as never, {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns pipeline stats and critical jobs summary", async () => {
    const prisma = getTestPrisma()

    const openCritical = await factories.createJob({
      title: "Critical Role",
      department: "Engineering",
      status: "OPEN",
    })
    const openNormal = await factories.createJob({
      title: "Standard Role",
      department: "Sales",
      status: "OPEN",
    })
    await factories.createJob({
      title: "Closed Role",
      department: "Ops",
      status: "CLOSED",
    })

    await prisma.job.update({
      where: { id: openCritical.id },
      data: { pipelineHealth: "AHEAD", isCritical: true },
    })
    await prisma.job.update({
      where: { id: openNormal.id },
      data: { pipelineHealth: "BEHIND", isCritical: false },
    })

    const candidateOne = await factories.createCandidate({
      firstName: "Ada",
      lastName: "Lovelace",
    })
    const candidateTwo = await factories.createCandidate({
      firstName: "Alan",
      lastName: "Turing",
    })

    await prisma.application.create({
      data: {
        jobId: openCritical.id,
        candidateId: candidateOne.id,
        stage: "SCREENING",
      },
    })
    await prisma.application.create({
      data: {
        jobId: openCritical.id,
        candidateId: candidateTwo.id,
        stage: "REJECTED",
      },
    })
    await prisma.application.create({
      data: {
        jobId: openNormal.id,
        candidateId: candidateOne.id,
        stage: "INTERVIEWING",
      },
    })

    const { GET } = await import("@/app/api/dashboard/stats/route")
    const response = await GET(new Request("http://localhost/api/dashboard/stats") as never, {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload.jobsOpen).toBe(2)
    expect(payload.jobsClosed).toBe(1)
    expect(payload.activeCriticalJobs).toBe(1)
    expect(payload.activeCandidates).toBe(1)
    expect(payload.pipelineHealth).toEqual({ ahead: 1, onTrack: 0, behind: 1 })
    expect(payload.criticalJobs).toHaveLength(1)
    expect(payload.criticalJobs[0].id).toBe(openCritical.id)
    expect(payload.criticalJobs[0].activeCandidateCount).toBe(1)
    expect(payload.recentJobs.length).toBeGreaterThan(0)
  })
})
