/**
 * Test Database Utilities
 *
 * Provides isolated database connections for integration tests.
 * Each test suite gets a clean database state.
 */

import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { execSync } from "node:child_process"

// Test database URL - uses port 5433 to avoid conflicts with dev
const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://postgres:postgres@localhost:5433/hr_dashboard_test"

// Set DATABASE_URL for Prisma to use
process.env.DATABASE_URL = TEST_DATABASE_URL

let testPrisma: PrismaClient | null = null

/**
 * Get the test Prisma client singleton
 * Uses PrismaPg adapter like the main app
 */
export function getTestPrisma(): PrismaClient {
  if (!testPrisma) {
    const adapter = new PrismaPg({ connectionString: TEST_DATABASE_URL })
    testPrisma = new PrismaClient({ adapter })
  }
  return testPrisma
}

/**
 * Disconnect the test Prisma client
 */
export async function disconnectTestPrisma(): Promise<void> {
  if (testPrisma) {
    await testPrisma.$disconnect()
    testPrisma = null
  }
}

/**
 * Reset the test database to a clean state
 * Uses Prisma's transaction to truncate all tables
 */
export async function resetDatabase(): Promise<void> {
  const prisma = getTestPrisma()

  // Disable foreign key checks, truncate all tables, re-enable
  // Using raw SQL for performance
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      -- Disable triggers
      SET session_replication_role = 'replica';

      -- Truncate all tables in the current schema
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename != '_prisma_migrations') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;

      -- Re-enable triggers
      SET session_replication_role = 'origin';
    END $$;
  `)
}

/**
 * Clean specific tables - faster than full reset for targeted cleanup
 */
export async function cleanTables(
  tables: Array<"User" | "Job" | "Candidate" | "Application" | "AuditLog">,
): Promise<void> {
  const prisma = getTestPrisma()

  // Clean in dependency order (children first)
  const cleanOrder = ["AuditLog", "Application", "Candidate", "Job", "User"]
  const tablesToClean = cleanOrder.filter((t) => tables.includes(t as never))

  for (const table of tablesToClean) {
    switch (table) {
      case "AuditLog":
        await prisma.auditLog.deleteMany()
        break
      case "Application":
        await prisma.application.deleteMany()
        break
      case "Candidate":
        await prisma.candidate.deleteMany()
        break
      case "Job":
        await prisma.job.deleteMany()
        break
      case "User":
        await prisma.user.deleteMany()
        break
    }
  }
}

/**
 * Push the Prisma schema to the test database
 * Call this once before running tests
 */
export async function pushSchema(): Promise<void> {
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
      },
      stdio: process.env.DEBUG_PRISMA === "true" ? "inherit" : "pipe",
    })
  } catch (error) {
    console.error("Failed to push schema to test database:", error)
    throw new Error(
      "Failed to push schema to test database. Is the database running?",
    )
  }
}

/**
 * Check if the test database is accessible
 */
export async function isDatabaseReady(): Promise<boolean> {
  try {
    const prisma = getTestPrisma()
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

/**
 * Wait for the test database to be ready with timeout
 */
export async function waitForDatabase(
  timeoutMs = 30000,
  intervalMs = 500,
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (await isDatabaseReady()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(`Database not ready after ${timeoutMs}ms`)
}

// Export the URL for external use
export { TEST_DATABASE_URL }
