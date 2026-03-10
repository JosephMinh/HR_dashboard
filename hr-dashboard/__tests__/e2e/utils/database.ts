/**
 * E2E Test Database Utilities
 *
 * Provides test data seeding and cleanup for E2E tests.
 * Uses the same database as integration tests.
 */

import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { hash } from "bcryptjs"
import { TEST_USERS, getTestPassword } from "./auth"

// Use the test database URL
const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://postgres:postgres@localhost:5433/hr_dashboard_test"

let e2ePrisma: PrismaClient | null = null

/**
 * Get the E2E Prisma client
 */
export function getE2EPrisma(): PrismaClient {
  if (!e2ePrisma) {
    const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL })
    e2ePrisma = new PrismaClient({ adapter })
  }
  return e2ePrisma
}

/**
 * Disconnect E2E Prisma client
 */
export async function disconnectE2EPrisma(): Promise<void> {
  if (e2ePrisma) {
    await e2ePrisma.$disconnect()
    e2ePrisma = null
  }
}

/**
 * Reset the E2E test database
 */
export async function resetE2EDatabase(): Promise<void> {
  const prisma = getE2EPrisma()

  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      SET session_replication_role = 'replica';
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename != '_prisma_migrations') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
      SET session_replication_role = 'origin';
    END $$;
  `)
}

/**
 * Seed test users for authentication
 */
export async function seedTestUsers(): Promise<void> {
  const prisma = getE2EPrisma()
  const passwordHash = await hash(getTestPassword(), 10)

  const users = Object.values(TEST_USERS)

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
        active: true,
      },
    })
  }

  console.log(`[E2E-DB] Seeded ${users.length} test users`)
}

/**
 * Seed sample jobs for testing
 */
export async function seedTestJobs(count = 5): Promise<string[]> {
  const prisma = getE2EPrisma()
  const departments = ["Engineering", "Product", "Design", "Marketing", "Sales"]
  const statuses = ["OPEN", "CLOSED", "ON_HOLD"] as const
  const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const
  const pipelineHealthLevels = ["BEHIND", "ON_TRACK", "AHEAD"] as const

  const jobIds: string[] = []

  for (let i = 0; i < count; i++) {
    const department = departments[i % departments.length]!
    const status = statuses[i % statuses.length]!
    const priority = priorities[i % priorities.length]!
    const pipelineHealth = pipelineHealthLevels[i % pipelineHealthLevels.length]!

    const job = await prisma.job.create({
      data: {
        title: `Test Position ${i + 1}`,
        department,
        description: `This is a test job description for position ${i + 1}. It includes various responsibilities and requirements.`,
        location: i % 2 === 0 ? "Remote" : "San Francisco, CA",
        status,
        priority,
        pipelineHealth,
        isCritical: i === 0,
        openedAt: new Date(),
      },
    })
    jobIds.push(job.id)
  }

  console.log(`[E2E-DB] Seeded ${count} test jobs`)
  return jobIds
}

/**
 * Seed sample candidates for testing
 */
export async function seedTestCandidates(count = 10): Promise<string[]> {
  const prisma = getE2EPrisma()
  const sources = ["REFERRAL", "LINKEDIN", "CAREERS_PAGE", "AGENCY", "OTHER"] as const
  const locations = ["New York, NY", "Austin, TX", "Seattle, WA"] as const

  const firstNames = ["Alice", "Bob", "Carol", "David", "Eve", "Frank", "Grace", "Henry", "Ivy", "Jack"]
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Martinez", "Taylor"]

  const candidateIds: string[] = []

  for (let i = 0; i < count; i++) {
    const firstName = firstNames[i % firstNames.length]!
    const lastName = lastNames[i % lastNames.length]!
    const source = sources[i % sources.length]!
    const location = locations[i % locations.length]!

    const candidate = await prisma.candidate.create({
      data: {
        firstName,
        lastName,
        email: `candidate${i + 1}@example.com`,
        phone: `+1 555-000-${String(i + 1).padStart(4, "0")}`,
        currentCompany: i % 2 === 0 ? `Company ${i}` : null,
        location,
        source,
        linkedinUrl: `https://linkedin.com/in/candidate${i + 1}`,
      },
    })
    candidateIds.push(candidate.id)
  }

  console.log(`[E2E-DB] Seeded ${count} test candidates`)
  return candidateIds
}

/**
 * Seed applications linking jobs and candidates
 */
export async function seedTestApplications(
  jobIds: string[],
  candidateIds: string[],
): Promise<string[]> {
  const prisma = getE2EPrisma()
  const stages = [
    "NEW",
    "SCREENING",
    "INTERVIEWING",
    "FINAL_ROUND",
    "OFFER",
    "HIRED",
    "REJECTED",
    "WITHDRAWN",
  ] as const

  const applicationIds: string[] = []

  // Create some applications - not all combinations
  for (let i = 0; i < Math.min(jobIds.length * 2, candidateIds.length); i++) {
    const jobIndex = i % jobIds.length
    const candidateIndex = i % candidateIds.length
    const jobId = jobIds[jobIndex]!
    const candidateId = candidateIds[candidateIndex]!
    const stage = stages[i % stages.length]!

    try {
      const application = await prisma.application.create({
        data: {
          jobId,
          candidateId,
          stage,
          recruiterOwner: "Test Recruiter",
          interviewNotes: i % 2 === 0 ? `Notes for application ${i + 1}` : null,
        },
      })
      applicationIds.push(application.id)
    } catch {
      // Skip duplicates
    }
  }

  console.log(`[E2E-DB] Seeded ${applicationIds.length} test applications`)
  return applicationIds
}

/**
 * Seed a complete test scenario
 */
export async function seedCompleteTestScenario(): Promise<{
  jobIds: string[]
  candidateIds: string[]
  applicationIds: string[]
}> {
  await seedTestUsers()
  const jobIds = await seedTestJobs(5)
  const candidateIds = await seedTestCandidates(10)
  const applicationIds = await seedTestApplications(jobIds, candidateIds)

  return { jobIds, candidateIds, applicationIds }
}

/**
 * Get test data counts for verification
 */
export async function getTestDataCounts(): Promise<{
  users: number
  jobs: number
  candidates: number
  applications: number
}> {
  const prisma = getE2EPrisma()

  const [users, jobs, candidates, applications] = await Promise.all([
    prisma.user.count(),
    prisma.job.count(),
    prisma.candidate.count(),
    prisma.application.count(),
  ])

  return { users, jobs, candidates, applications }
}
