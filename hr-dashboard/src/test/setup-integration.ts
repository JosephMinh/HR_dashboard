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
  assertDatabaseClean,
} from "./test-db"
import { TestLogger } from "./logger"

// Re-export for convenience
export {
  getTestPrisma,
  disconnectTestPrisma,
  resetDatabase,
  cleanTables,
  assertDatabaseClean,
  getTableCounts,
  TEST_DATABASE_URL,
} from "./test-db"
export { TestLogger } from "./logger"
export { createMockSession } from "./auth"

/**
 * Setup integration test environment
 * Call this at the top of your test file or in a shared setup
 *
 * @param resetBeforeEach - Truncate all tables before each test (default: true)
 * @param resetBeforeAll  - Truncate all tables once before the suite (default: false)
 * @param verifyClean     - Assert tables are empty after reset (default: false). Enable
 *                          when debugging test pollution — adds ~5ms per reset.
 * @param logger          - Create a TestLogger per test (default: false)
 */
export function setupIntegrationTests(options?: {
  resetBeforeEach?: boolean
  resetBeforeAll?: boolean
  verifyClean?: boolean
  logger?: boolean
}) {
  const {
    resetBeforeEach = true,
    resetBeforeAll = false,
    verifyClean = false,
    logger = false,
  } = options ?? {}

  let testLogger: TestLogger | undefined

  beforeAll(async () => {
    // Wait for database to be ready (with diagnostic errors on failure)
    await waitForDatabase()

    // Push schema if needed (idempotent, with retry)
    await pushSchema()

    // Reset database if requested
    if (resetBeforeAll) {
      await resetDatabase()
      if (verifyClean) {
        await assertDatabaseClean()
      }
    }
  })

  afterAll(async () => {
    await disconnectTestPrisma()
  })

  beforeEach(async (context) => {
    // Reset database before each test for isolation
    if (resetBeforeEach) {
      await resetDatabase()
      if (verifyClean) {
        await assertDatabaseClean()
      }
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
  const prisma = () => getTestPrisma()

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
      return prisma().user.create({
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
        id?: string
        title?: string
        department?: string
        description?: string
        location?: string | null
        hiringManager?: string | null
        recruiterOwner?: string | null
        status?: "OPEN" | "CLOSED" | "ON_HOLD"
        priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
        pipelineHealth?: "AHEAD" | "ON_TRACK" | "BEHIND" | null
        isCritical?: boolean
        openedAt?: Date | null
        targetFillDate?: Date | null
        closedAt?: Date | null
        // WFP provenance
        importKey?: string | null
        sourceSheet?: string | null
        sourceRow?: number | null
        tempJobId?: number | null
        // WFP metadata
        function?: string | null
        employeeType?: string | null
        level?: string | null
        functionalPriority?: string | null
        corporatePriority?: string | null
        asset?: string | null
        keyCapability?: string | null
        businessRationale?: string | null
        milestone?: string | null
        talentAssessment?: string | null
        horizon?: string | null
        isTradeoff?: boolean
        recruitingStatus?: string | null
        fpaLevel?: string | null
        fpaTiming?: string | null
        fpaNote?: string | null
        fpaApproved?: string | null
        hiredName?: string | null
        hibobId?: number | null
        notes?: string | null
      } = {},
    ) {
      return prisma().job.create({
        data: {
          ...(data.id != null && { id: data.id }),
          title: data.title ?? "Test Job",
          department: data.department ?? "Engineering",
          description: data.description ?? "Test job description",
          status: data.status ?? "OPEN",
          priority: data.priority ?? "MEDIUM",
          ...(data.location !== undefined && { location: data.location }),
          ...(data.hiringManager !== undefined && { hiringManager: data.hiringManager }),
          ...(data.recruiterOwner !== undefined && { recruiterOwner: data.recruiterOwner }),
          ...(data.pipelineHealth !== undefined && { pipelineHealth: data.pipelineHealth }),
          ...(data.isCritical !== undefined && { isCritical: data.isCritical }),
          ...(data.openedAt !== undefined && { openedAt: data.openedAt }),
          ...(data.targetFillDate !== undefined && { targetFillDate: data.targetFillDate }),
          ...(data.closedAt !== undefined && { closedAt: data.closedAt }),
          ...(data.importKey !== undefined && { importKey: data.importKey }),
          ...(data.sourceSheet !== undefined && { sourceSheet: data.sourceSheet }),
          ...(data.sourceRow !== undefined && { sourceRow: data.sourceRow }),
          ...(data.tempJobId !== undefined && { tempJobId: data.tempJobId }),
          ...(data.function !== undefined && { function: data.function }),
          ...(data.employeeType !== undefined && { employeeType: data.employeeType }),
          ...(data.level !== undefined && { level: data.level }),
          ...(data.functionalPriority !== undefined && { functionalPriority: data.functionalPriority }),
          ...(data.corporatePriority !== undefined && { corporatePriority: data.corporatePriority }),
          ...(data.asset !== undefined && { asset: data.asset }),
          ...(data.keyCapability !== undefined && { keyCapability: data.keyCapability }),
          ...(data.businessRationale !== undefined && { businessRationale: data.businessRationale }),
          ...(data.milestone !== undefined && { milestone: data.milestone }),
          ...(data.talentAssessment !== undefined && { talentAssessment: data.talentAssessment }),
          ...(data.horizon !== undefined && { horizon: data.horizon }),
          ...(data.isTradeoff !== undefined && { isTradeoff: data.isTradeoff }),
          ...(data.recruitingStatus !== undefined && { recruitingStatus: data.recruitingStatus }),
          ...(data.fpaLevel !== undefined && { fpaLevel: data.fpaLevel }),
          ...(data.fpaTiming !== undefined && { fpaTiming: data.fpaTiming }),
          ...(data.fpaNote !== undefined && { fpaNote: data.fpaNote }),
          ...(data.fpaApproved !== undefined && { fpaApproved: data.fpaApproved }),
          ...(data.hiredName !== undefined && { hiredName: data.hiredName }),
          ...(data.hibobId !== undefined && { hibobId: data.hibobId }),
          ...(data.notes !== undefined && { notes: data.notes }),
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
      return prisma().candidate.create({
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
      return prisma().application.create({
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

    /**
     * Create a test headcount projection
     */
    async createHeadcountProjection(data: {
      id?: string
      importKey: string
      sourceRow?: number
      tempJobId?: number | null
      rawTempJobId?: string | null
      matchedJobId?: string | null
      department?: string
      employeeName?: string | null
      level?: string | null
      jobTitle?: string | null
      startDate?: Date | null
      monthlyFte?: Record<string, number | null>
    }) {
      return prisma().headcountProjection.create({
        data: {
          ...(data.id != null && { id: data.id }),
          importKey: data.importKey,
          sourceRow: data.sourceRow ?? 1,
          ...(data.tempJobId !== undefined && { tempJobId: data.tempJobId }),
          ...(data.rawTempJobId !== undefined && { rawTempJobId: data.rawTempJobId }),
          ...(data.matchedJobId !== undefined && { matchedJobId: data.matchedJobId }),
          department: data.department ?? "Engineering",
          ...(data.employeeName !== undefined && { employeeName: data.employeeName }),
          ...(data.level !== undefined && { level: data.level }),
          ...(data.jobTitle !== undefined && { jobTitle: data.jobTitle }),
          ...(data.startDate !== undefined && { startDate: data.startDate }),
          monthlyFte: data.monthlyFte ?? {},
        },
      })
    },

    /**
     * Create a test tradeoff
     */
    async createTradeoff(data: {
      id?: string
      importKey: string
      sourceRow?: number
      rowType?: string
      sourceTempJobId?: number | null
      sourceJobId?: string | null
      sourceDepartment?: string | null
      sourceLevel?: string | null
      sourceTitle?: string | null
      targetTempJobId?: number | null
      targetJobId?: string | null
      targetDepartment?: string | null
      targetLevel?: string | null
      targetTitle?: string | null
      levelDifference?: number | null
      status?: string | null
      notes?: string | null
    }) {
      return prisma().tradeoff.create({
        data: {
          ...(data.id != null && { id: data.id }),
          importKey: data.importKey,
          sourceRow: data.sourceRow ?? 1,
          rowType: data.rowType ?? "PAIR",
          ...(data.sourceTempJobId !== undefined && { sourceTempJobId: data.sourceTempJobId }),
          ...(data.sourceJobId !== undefined && { sourceJobId: data.sourceJobId }),
          ...(data.sourceDepartment !== undefined && { sourceDepartment: data.sourceDepartment }),
          ...(data.sourceLevel !== undefined && { sourceLevel: data.sourceLevel }),
          ...(data.sourceTitle !== undefined && { sourceTitle: data.sourceTitle }),
          ...(data.targetTempJobId !== undefined && { targetTempJobId: data.targetTempJobId }),
          ...(data.targetJobId !== undefined && { targetJobId: data.targetJobId }),
          ...(data.targetDepartment !== undefined && { targetDepartment: data.targetDepartment }),
          ...(data.targetLevel !== undefined && { targetLevel: data.targetLevel }),
          ...(data.targetTitle !== undefined && { targetTitle: data.targetTitle }),
          ...(data.levelDifference !== undefined && { levelDifference: data.levelDifference }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
      })
    },
  }
}

export type TestFactories = ReturnType<typeof createTestFactories>
