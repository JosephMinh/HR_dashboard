import { beforeEach, describe, expect, it } from "vitest"

import {
  createTestFactories,
  getTestPrisma,
  setupIntegrationTests,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

const testAuth = setupTestAuth()

describe("Integration: GET /api/jobs", () => {
  setupIntegrationTests({ logger: true })
  const factories = createTestFactories()

  beforeEach(async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })
  })

  it("filters by status and returns total count", async () => {
    const openJob = await factories.createJob({
      title: "Open Role",
      department: "Engineering",
      status: "OPEN",
    })
    await factories.createJob({
      title: "Closed Role",
      department: "Engineering",
      status: "HIRED",
    })

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(new Request("http://localhost/api/jobs?status=OPEN") as never)

    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.total).toBe(1)
    expect(data.jobs).toHaveLength(1)
    expect(data.jobs[0].id).toBe(openJob.id)
  })

  it("supports title search and active candidate counts", async () => {
    const job = await factories.createJob({
      title: "Data Engineer",
      department: "Data",
      status: "OPEN",
    })
    const candidateOne = await factories.createCandidate({
      firstName: "Ada",
      lastName: "Lovelace",
    })
    const candidateTwo = await factories.createCandidate({
      firstName: "Alan",
      lastName: "Turing",
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

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request("http://localhost/api/jobs?search=Data&includeCount=true") as never,
    )

    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.total).toBe(1)
    expect(data.jobs).toHaveLength(1)
    expect(data.jobs[0].id).toBe(job.id)
    expect(data.jobs[0].activeCandidateCount).toBe(1)
  })

  it("sorts by openedAt when requested", async () => {
    const prisma = getTestPrisma()
    const older = await factories.createJob({
      title: "Older Job",
      department: "Operations",
      status: "OPEN",
    })
    const newer = await factories.createJob({
      title: "Newer Job",
      department: "Operations",
      status: "OPEN",
    })

    await prisma.job.update({
      where: { id: older.id },
      data: { openedAt: new Date("2026-01-01T00:00:00.000Z") },
    })
    await prisma.job.update({
      where: { id: newer.id },
      data: { openedAt: new Date("2026-02-01T00:00:00.000Z") },
    })

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request("http://localhost/api/jobs?sort=openedAt&order=asc") as never,
    )

    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.jobs[0].id).toBe(older.id)
    expect(data.jobs[1].id).toBe(newer.id)
  })

  describe("pagination", () => {
    it("returns pagination metadata with default values", async () => {
      await factories.createJob({ title: "Job 1", department: "Eng", status: "OPEN" })
      await factories.createJob({ title: "Job 2", department: "Eng", status: "OPEN" })

      const { GET } = await import("@/app/api/jobs/route")
      const response = await GET(new Request("http://localhost/api/jobs") as never)

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.page).toBe(1)
      expect(data.pageSize).toBe(20)
      expect(data.total).toBe(2)
      expect(data.totalPages).toBe(1)
    })

    it("paginates results correctly", async () => {
      // Create 5 jobs
      for (let i = 1; i <= 5; i++) {
        await factories.createJob({
          title: `Job ${i}`,
          department: "Engineering",
          status: "OPEN",
        })
      }

      const { GET } = await import("@/app/api/jobs/route")
      const response = await GET(
        new Request("http://localhost/api/jobs?page=2&pageSize=2") as never,
      )

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.page).toBe(2)
      expect(data.pageSize).toBe(2)
      expect(data.total).toBe(5)
      expect(data.totalPages).toBe(3)
      expect(data.jobs).toHaveLength(2)
    })

    it("returns empty page when beyond total pages", async () => {
      await factories.createJob({ title: "Only Job", department: "Eng", status: "OPEN" })

      const { GET } = await import("@/app/api/jobs/route")
      const response = await GET(
        new Request("http://localhost/api/jobs?page=10&pageSize=10") as never,
      )

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.page).toBe(10)
      expect(data.total).toBe(1)
      expect(data.totalPages).toBe(1)
      expect(data.jobs).toHaveLength(0)
    })

    it("returns 400 for invalid page parameter", async () => {
      const { GET } = await import("@/app/api/jobs/route")
      const response = await GET(
        new Request("http://localhost/api/jobs?page=-1") as never,
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("page")
    })

    it("returns 400 for invalid pageSize parameter", async () => {
      const { GET } = await import("@/app/api/jobs/route")
      const response = await GET(
        new Request("http://localhost/api/jobs?pageSize=500") as never,
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("pageSize")
    })

    it("returns 400 for invalid sort parameter", async () => {
      const { GET } = await import("@/app/api/jobs/route")
      const response = await GET(
        new Request("http://localhost/api/jobs?sort=invalid") as never,
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("sort")
    })

    it("returns 400 for invalid order parameter", async () => {
      const { GET } = await import("@/app/api/jobs/route")
      const response = await GET(
        new Request("http://localhost/api/jobs?order=random") as never,
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("order")
    })

    it("maintains deterministic ordering with tie-breaker", async () => {
      const prisma = getTestPrisma()
      // Create jobs with same updatedAt timestamp
      const job1 = await factories.createJob({ title: "Job A", department: "Eng", status: "OPEN" })
      const job2 = await factories.createJob({ title: "Job B", department: "Eng", status: "OPEN" })
      const job3 = await factories.createJob({ title: "Job C", department: "Eng", status: "OPEN" })

      // Set same updatedAt for all
      const sameTime = new Date("2026-03-10T00:00:00.000Z")
      await prisma.job.updateMany({
        where: { id: { in: [job1.id, job2.id, job3.id] } },
        data: { updatedAt: sameTime },
      })

      const { GET } = await import("@/app/api/jobs/route")

      // Request twice and ensure same order
      const response1 = await GET(new Request("http://localhost/api/jobs") as never)
      const response2 = await GET(new Request("http://localhost/api/jobs") as never)

      const data1 = await response1.json()
      const data2 = await response2.json()

      expect(data1.jobs.map((j: { id: string }) => j.id)).toEqual(
        data2.jobs.map((j: { id: string }) => j.id),
      )
    })

    it("combines pagination with filters correctly", async () => {
      // Create mix of statuses
      for (let i = 1; i <= 4; i++) {
        await factories.createJob({
          title: `Open Job ${i}`,
          department: "Engineering",
          status: "OPEN",
        })
      }
      await factories.createJob({ title: "Closed Job", department: "Engineering", status: "HIRED" })

      const { GET } = await import("@/app/api/jobs/route")
      const response = await GET(
        new Request("http://localhost/api/jobs?status=OPEN&page=1&pageSize=2") as never,
      )

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.total).toBe(4) // Only OPEN jobs counted
      expect(data.totalPages).toBe(2)
      expect(data.jobs).toHaveLength(2)
      expect(data.jobs.every((j: { status: string }) => j.status === "OPEN")).toBe(true)
    })
  })
})
