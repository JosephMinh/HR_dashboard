/**
 * Integration Test Setup
 *
 * Global setup and teardown for integration tests.
 * Ensures database is ready and provides test utilities.
 */

import { beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import {
  getTestPrisma,
  disconnectTestPrisma,
  resetDatabase,
  pushSchema,
  waitForDatabase,
} from "./test-db"
import { TestLogger } from "./logger"

// Re-export for convenience
export {
  getTestPrisma,
  disconnectTestPrisma,
  resetDatabase,
  cleanTables,
  TEST_DATABASE_URL,
} from "./test-db"
export { TestLogger } from "./logger"
export { createMockSession } from "./auth"

/**
 * Setup integration test environment
 * Call this at the top of your test file or in a shared setup
 */
export function setupIntegrationTests(options?: {
  resetBeforeEach?: boolean
  resetBeforeAll?: boolean
  logger?: boolean
}) {
  const {
    resetBeforeEach = true,
    resetBeforeAll = false,
    logger = false,
  } = options ?? {}

  let testLogger: TestLogger | undefined

  beforeAll(async () => {
    // Wait for database to be ready
    await waitForDatabase()

    // Push schema if needed (idempotent)
    await pushSchema()

    // Reset database if requested
    if (resetBeforeAll) {
      await resetDatabase()
    }
  })

  afterAll(async () => {
    await disconnectTestPrisma()
  })

  beforeEach(async (context) => {
    // Reset database before each test for isolation
    if (resetBeforeEach) {
      await resetDatabase()
    }

    // Create logger if enabled
    if (logger) {
      const testName =
        context.task?.name ?? context.task?.file?.name ?? "unknown"
      testLogger = new TestLogger(testName)
    }
  })

  afterEach(() => {
    // Finish logging
    testLogger?.finish()
    testLogger = undefined
  })

  return {
    getLogger: () => testLogger,
  }
}

/**
 * Create test data factories for common entities
 */
export function createTestFactories() {
  const prisma = getTestPrisma()

  return {
    /**
     * Create a test user
     */
    async createUser(
      data: {
        name?: string
        email?: string
        role?: "ADMIN" | "RECRUITER" | "VIEWER"
        passwordHash?: string
      } = {},
    ) {
      return prisma.user.create({
        data: {
          name: data.name ?? "Test User",
          email: data.email ?? `test-${Date.now()}@example.com`,
          role: data.role ?? "RECRUITER",
          passwordHash: data.passwordHash ?? "hashed-password",
        },
      })
    },

    /**
     * Create a test job
     */
    async createJob(
      data: {
        title?: string
        department?: string
        description?: string
        status?: "OPEN" | "CLOSED" | "ON_HOLD"
        priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      } = {},
    ) {
      return prisma.job.create({
        data: {
          title: data.title ?? "Test Job",
          department: data.department ?? "Engineering",
          description: data.description ?? "Test job description",
          status: data.status ?? "OPEN",
          priority: data.priority ?? "MEDIUM",
        },
      })
    },

    /**
     * Create a test candidate
     */
    async createCandidate(
      data: {
        firstName?: string
        lastName?: string
        email?: string
        source?: "REFERRAL" | "LINKEDIN" | "CAREERS_PAGE" | "AGENCY" | "OTHER"
      } = {},
    ) {
      return prisma.candidate.create({
        data: {
          firstName: data.firstName ?? "Test",
          lastName: data.lastName ?? "Candidate",
          email: data.email ?? `candidate-${Date.now()}@example.com`,
          source: data.source ?? "LINKEDIN",
        },
      })
    },

    /**
     * Create a test application
     */
    async createApplication(data: {
      jobId: string
      candidateId: string
      stage?:
        | "NEW"
        | "SCREENING"
        | "INTERVIEWING"
        | "FINAL_ROUND"
        | "OFFER"
        | "HIRED"
        | "REJECTED"
        | "WITHDRAWN"
      recruiterOwner?: string
    }) {
      return prisma.application.create({
        data: {
          jobId: data.jobId,
          candidateId: data.candidateId,
          stage: data.stage ?? "NEW",
          recruiterOwner: data.recruiterOwner ?? "Test Recruiter",
        },
      })
    },

    /**
     * Create a complete test scenario with job, candidates, and applications
     */
    async createJobWithCandidates(options?: {
      jobTitle?: string
      candidateCount?: number
    }) {
      const { jobTitle = "Test Job", candidateCount = 3 } = options ?? {}

      const job = await this.createJob({ title: jobTitle })
      const candidates = await Promise.all(
        Array.from({ length: candidateCount }, (_, i) =>
          this.createCandidate({
            firstName: `Candidate`,
            lastName: `${i + 1}`,
          }),
        ),
      )

      const applications = await Promise.all(
        candidates.map((candidate) =>
          this.createApplication({
            jobId: job.id,
            candidateId: candidate.id,
          }),
        ),
      )

      return { job, candidates, applications }
    },
  }
}

export type TestFactories = ReturnType<typeof createTestFactories>
