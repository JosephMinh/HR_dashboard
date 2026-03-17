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

// ---------------------------------------------------------------------------
// Safety guard: never run integration tests against a production-like database
// ---------------------------------------------------------------------------
function assertSafeTestUrl(url: string): void {
  const portMatch = url.match(/:(\d+)\//)
  const port = portMatch?.[1] ?? "5432"
  const dbMatch = url.match(/\/([^/?]+)(\?|$)/)
  const dbName = dbMatch?.[1] ?? ""

  if (port === "5432") {
    throw new Error(
      `SAFETY: Refusing to run integration tests against port 5432 (default PostgreSQL port).\n` +
        `The test database should use port 5433 to avoid accidental dev/prod data loss.\n` +
        `Current URL: ${url}\n` +
        `Fix: Set DATABASE_URL_TEST to use port 5433, or run: npm run test:db:up`,
    )
  }

  if (!dbName.toLowerCase().includes("test")) {
    throw new Error(
      `SAFETY: Refusing to run integration tests against database "${dbName}".\n` +
        `The test database name must contain "test" to prevent accidental dev/prod data loss.\n` +
        `Current URL: ${url}\n` +
        `Fix: Use a database named "hr_dashboard_test" or similar.`,
    )
  }
}

assertSafeTestUrl(TEST_DATABASE_URL)

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
  tables: Array<"User" | "Job" | "Candidate" | "Application" | "AuditLog" | "SetPasswordToken" | "HeadcountProjection" | "Tradeoff">,
): Promise<void> {
  const prisma = getTestPrisma()

  // Clean in dependency order (children first)
  const cleanOrder = ["AuditLog", "SetPasswordToken", "Tradeoff", "HeadcountProjection", "Application", "Candidate", "Job", "User"]
  const tablesToClean = cleanOrder.filter((t) => tables.includes(t as never))

  for (const table of tablesToClean) {
    switch (table) {
      case "AuditLog":
        await prisma.auditLog.deleteMany()
        break
      case "SetPasswordToken":
        await prisma.setPasswordToken.deleteMany()
        break
      case "Tradeoff":
        await prisma.tradeoff.deleteMany()
        break
      case "HeadcountProjection":
        await prisma.headcountProjection.deleteMany()
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
 * Get row counts for all application tables.
 * Useful for verifying reset worked or debugging leftover state.
 */
export async function getTableCounts(): Promise<Record<string, number>> {
  const prisma = getTestPrisma()
  const [users, jobs, candidates, applications, auditLogs, setPasswordTokens, headcountProjections, tradeoffs] =
    await Promise.all([
      prisma.user.count(),
      prisma.job.count(),
      prisma.candidate.count(),
      prisma.application.count(),
      prisma.auditLog.count(),
      prisma.setPasswordToken.count(),
      prisma.headcountProjection.count(),
      prisma.tradeoff.count(),
    ])

  return { users, jobs, candidates, applications, auditLogs, setPasswordTokens, headcountProjections, tradeoffs }
}

/**
 * Assert the database is completely empty (all tables have 0 rows).
 * Throws with a detailed report if any table has leftover data.
 * Call after resetDatabase() to verify cleanup in critical tests.
 */
export async function assertDatabaseClean(): Promise<void> {
  const counts = await getTableCounts()
  const nonEmpty = Object.entries(counts).filter(([, count]) => count > 0)

  if (nonEmpty.length > 0) {
    const details = nonEmpty
      .map(([table, count]) => `  ${table}: ${count} rows`)
      .join("\n")
    throw new Error(
      `Database is not clean after reset. Leftover data found:\n${details}\n\n` +
        "This indicates test pollution — a previous test's data survived cleanup.\n" +
        "Check that resetDatabase() completed without error before this test ran.",
    )
  }
}

/**
 * Push the Prisma schema to the test database with retry logic.
 * Retries up to 3 times with exponential backoff for transient failures.
 */
export async function pushSchema(maxRetries = 3): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      execSync("npx prisma db push --accept-data-loss", {
        env: {
          ...process.env,
          DATABASE_URL: TEST_DATABASE_URL,
        },
        stdio: process.env.DEBUG_PRISMA === "true" ? "inherit" : "pipe",
      })
      return
    } catch (error) {
      lastError = error
      if (attempt < maxRetries) {
        const delayMs = 1000 * 2 ** (attempt - 1)
        console.warn(
          `[test-db] Schema push attempt ${attempt}/${maxRetries} failed, retrying in ${delayMs}ms...`,
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  throw new Error(
    `Failed to push schema to test database after ${maxRetries} attempts.\n` +
      `Connection: ${TEST_DATABASE_URL}\n` +
      `Troubleshooting:\n` +
      `  1. Is the test database container running? Run: docker ps | grep hr-dashboard-test-db\n` +
      `  2. Start it with: npm run test:db:up\n` +
      `Original error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
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
 * Diagnose why the test database is unreachable.
 * Checks Docker, container state, and port availability.
 */
function diagnoseDatabaseFailure(): string {
  const lines: string[] = [
    `Test database not reachable at: ${TEST_DATABASE_URL}`,
    "",
    "Diagnostics:",
  ]

  try {
    execSync("docker info", { stdio: "pipe" })
    lines.push("  [OK]   Docker is running")
  } catch {
    lines.push(
      "  [FAIL] Docker is not running or not installed.",
      "         Start Docker and retry.",
    )
    return lines.join("\n")
  }

  try {
    const status = execSync(
      "docker inspect -f '{{.State.Status}}' hr-dashboard-test-db 2>/dev/null",
      { stdio: "pipe", encoding: "utf-8" },
    ).trim()
    if (status === "running") {
      lines.push(`  [OK]   Container hr-dashboard-test-db is ${status}`)
    } else {
      lines.push(
        `  [FAIL] Container hr-dashboard-test-db exists but status is: ${status}`,
        "         Run: npm run test:db:up",
      )
      return lines.join("\n")
    }
  } catch {
    lines.push(
      "  [FAIL] Container hr-dashboard-test-db not found.",
      "         Run: npm run test:db:up",
    )
    return lines.join("\n")
  }

  try {
    execSync("nc -z localhost 5433", { stdio: "pipe", timeout: 2000 })
    lines.push("  [OK]   Port 5433 is accepting connections")
  } catch {
    lines.push(
      "  [FAIL] Port 5433 is not accepting connections.",
      "         The container may still be starting. Check: docker logs hr-dashboard-test-db",
    )
  }

  lines.push(
    "",
    "If the container is running and healthy but tests still fail,",
    "check the container logs: docker logs hr-dashboard-test-db",
  )
  return lines.join("\n")
}

/**
 * Wait for the test database to be ready with timeout.
 * On failure, runs diagnostics and provides actionable error messages.
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

  const diagnosis = diagnoseDatabaseFailure()
  throw new Error(
    `Database not ready after ${timeoutMs}ms.\n\n${diagnosis}`,
  )
}

// Export the URL for external use
export { TEST_DATABASE_URL }
