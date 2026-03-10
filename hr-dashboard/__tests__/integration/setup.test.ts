/**
 * Integration Test Infrastructure Verification
 *
 * This test verifies that the test database infrastructure is working correctly.
 * Run: bun run test:integration
 */

import { describe, it, expect } from "vitest"
import {
  setupIntegrationTests,
  getTestPrisma,
  createTestFactories,
} from "@/test/setup-integration"

describe("Integration Test Infrastructure", () => {
  setupIntegrationTests()
  const factories = createTestFactories()

  it("connects to the test database", async () => {
    const prisma = getTestPrisma()
    const result = await prisma.$queryRaw<[{ version: string }]>`SELECT version()`
    expect(result[0].version).toContain("PostgreSQL")
  })

  it("can create and query a user", async () => {
    const user = await factories.createUser({
      name: "Integration Test User",
      email: "integration@test.com",
      role: "ADMIN",
    })

    const prisma = getTestPrisma()
    const found = await prisma.user.findUnique({
      where: { id: user.id },
    })

    expect(found).not.toBeNull()
    expect(found?.name).toBe("Integration Test User")
    expect(found?.email).toBe("integration@test.com")
    expect(found?.role).toBe("ADMIN")
  })

  it("can create a job", async () => {
    const job = await factories.createJob({
      title: "Senior Engineer",
      department: "Engineering",
      status: "OPEN",
    })

    const prisma = getTestPrisma()
    const found = await prisma.job.findUnique({
      where: { id: job.id },
    })

    expect(found).not.toBeNull()
    expect(found?.title).toBe("Senior Engineer")
    expect(found?.status).toBe("OPEN")
  })

  it("can create a candidate", async () => {
    const candidate = await factories.createCandidate({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    })

    const prisma = getTestPrisma()
    const found = await prisma.candidate.findUnique({
      where: { id: candidate.id },
    })

    expect(found).not.toBeNull()
    expect(found?.firstName).toBe("Jane")
    expect(found?.lastName).toBe("Doe")
  })

  it("can create an application linking job and candidate", async () => {
    const job = await factories.createJob()
    const candidate = await factories.createCandidate()
    const application = await factories.createApplication({
      jobId: job.id,
      candidateId: candidate.id,
      stage: "SCREENING",
    })

    const prisma = getTestPrisma()
    const found = await prisma.application.findUnique({
      where: { id: application.id },
      include: { job: true, candidate: true },
    })

    expect(found).not.toBeNull()
    expect(found?.job.id).toBe(job.id)
    expect(found?.candidate.id).toBe(candidate.id)
    expect(found?.stage).toBe("SCREENING")
  })

  it("resets database between tests (this test should have empty db)", async () => {
    const prisma = getTestPrisma()

    // If database reset works, these should be empty
    const userCount = await prisma.user.count()
    const jobCount = await prisma.job.count()
    const candidateCount = await prisma.candidate.count()
    const applicationCount = await prisma.application.count()

    expect(userCount).toBe(0)
    expect(jobCount).toBe(0)
    expect(candidateCount).toBe(0)
    expect(applicationCount).toBe(0)
  })

  it("createJobWithCandidates helper works", async () => {
    const { job, candidates, applications } =
      await factories.createJobWithCandidates({
        jobTitle: "Test Position",
        candidateCount: 5,
      })

    expect(job.title).toBe("Test Position")
    expect(candidates).toHaveLength(5)
    expect(applications).toHaveLength(5)

    // Verify all applications link to the correct job
    for (const app of applications) {
      expect(app.jobId).toBe(job.id)
    }
  })
})
