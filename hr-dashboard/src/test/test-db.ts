/**
 * Test Database Utilities
 *
 * Provides isolated database connections for integration tests.
 * Each test suite gets a clean database state.
 */

import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { execSync } from "node:child_process"
import { getTestDatabaseUrl } from "./database"

// Test database URL - uses port 5433 to avoid conflicts with dev
const TEST_DATABASE_URL = getTestDatabaseUrl()

// ---------------------------------------------------------------------------
// Safety guard: never run integration tests against a production-like database
// ---------------------------------------------------------------------------
export function assertSafeTestUrl(url: string): void {
  const portMatch = url.match(/:(\d+)\//)
  const port = portMatch?.[1] ?? "5432"
  const dbMatch = url.match(/\/([^/?]+)(\?|$)/)
  const dbName = dbMatch?.[1] ?? ""

  if (port === "5432") {
    throw new Error(
      `SAFETY: Refusing to run integration tests against port 5432 (default PostgreSQL port).\n` +
        `The test database should use port 5433 to avoid accidental dev/prod data loss.\n` +
        `Current URL: ${url}\n` +
        `Fix: Set DATABASE_URL_TEST to use port 5433, or run: bun run test:db:up`,
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
let schemaPushPromise: Promise<void> | null = null

// Share a single PrismaClient with `@/lib/prisma` to avoid dual connection
// pools.  `src/lib/prisma.ts` checks `globalForPrisma.prisma` before creating
// its own client, so setting it here (before any route module is imported)
// ensures every `import { prisma } from "@/lib/prisma"` in the test process
// reuses the same adapter & pool — eliminating deadlocks between TRUNCATE
// (AccessExclusiveLock) and route-handler queries (RowExclusiveLock).
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function resolveAdapterSchema(connectionString: string): string | undefined {
  try {
    return new URL(connectionString).searchParams.get("schema")?.trim() || undefined
  } catch {
    return undefined
  }
}

/**
 * Get the test Prisma client singleton
 * Uses PrismaPg adapter like the main app
 */
export function getTestPrisma(): PrismaClient {
  if (!testPrisma) {
    // Use a single-connection pool to prevent lock contention between
    // TRUNCATE (AccessExclusiveLock) and concurrent DML from other pool
    // connections. Tests run sequentially, so parallelism isn't needed.
    const adapter = new PrismaPg(
      { connectionString: TEST_DATABASE_URL, max: 1 },
      { schema: resolveAdapterSchema(TEST_DATABASE_URL) },
    )
    testPrisma = new PrismaClient({ adapter })
    // Make `@/lib/prisma` reuse this same client instead of creating its own
    globalForPrisma.prisma = testPrisma
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
    // Clear the global so a fresh client is created if tests reinitialise
    delete (globalForPrisma as Record<string, unknown>).prisma
  }
}

function getResetOrder(prisma: PrismaClient) {
  return [
    () => prisma.auditLog.deleteMany(),
    () => prisma.setPasswordToken.deleteMany(),
    () => prisma.tradeoff.deleteMany(),
    () => prisma.headcountProjection.deleteMany(),
    () => prisma.application.deleteMany(),
    () => prisma.candidate.deleteMany(),
    () => prisma.job.deleteMany(),
    () => prisma.user.deleteMany(),
  ]
}

export async function resetDatabaseWithPrisma(prisma: PrismaClient): Promise<void> {
  for (const deleteRows of getResetOrder(prisma)) {
    await deleteRows()
  }
}

/**
 * Reset the test database to a clean state.
 *
 * Uses Prisma deleteMany in dependency order (children before parents).
 * This avoids the AccessExclusiveLock that TRUNCATE requires, which causes
 * intermittent deadlocks and FK constraint violations when PrismaPg's
 * connection pool has outstanding connections.
 */
export async function resetDatabase(): Promise<void> {
  await resetDatabaseWithPrisma(getTestPrisma())
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

export async function getTableCountsWithPrisma(
  prisma: PrismaClient,
): Promise<Record<string, number>> {
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
 * Get row counts for all application tables.
 * Useful for verifying reset worked or debugging leftover state.
 */
export async function getTableCounts(): Promise<Record<string, number>> {
  return getTableCountsWithPrisma(getTestPrisma())
}

/**
 * Assert the database is completely empty (all tables have 0 rows).
 * Throws with a detailed report if any table has leftover data.
 * Call after resetDatabase() to verify cleanup in critical tests.
 */
export async function assertDatabaseClean(): Promise<void> {
  await assertDatabaseCleanWithPrisma(getTestPrisma())
}

export async function assertDatabaseCleanWithPrisma(prisma: PrismaClient): Promise<void> {
  const counts = await getTableCountsWithPrisma(prisma)
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

export async function resetAndAssertDatabaseClean(prisma: PrismaClient): Promise<void> {
  await resetDatabaseWithPrisma(prisma)
  await assertDatabaseCleanWithPrisma(prisma)
}

/**
 * Push the Prisma schema to the test database with retry logic.
 * Retries up to 3 times with exponential backoff for transient failures.
 */
async function pushSchemaInternal(maxRetries: number): Promise<void> {
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
      `  2. Start it with: bun run test:db:up\n` +
      `Original error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

export async function pushSchema(
  maxRetries = 3,
  options?: { force?: boolean },
): Promise<void> {
  const force = options?.force ?? false

  if (force || schemaPushPromise === null) {
    schemaPushPromise = pushSchemaInternal(maxRetries).catch((error) => {
      schemaPushPromise = null
      throw error
    })
  }

  await schemaPushPromise
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
export function diagnoseDatabaseFailure(): string {
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
        "         Run: bun run test:db:up",
      )
      return lines.join("\n")
    }
  } catch {
    lines.push(
      "  [FAIL] Container hr-dashboard-test-db not found.",
      "         Run: bun run test:db:up",
    )
    return lines.join("\n")
  }

  try {
    const health = execSync(
      "docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' hr-dashboard-test-db 2>/dev/null",
      { stdio: "pipe", encoding: "utf-8" },
    ).trim()
    if (health === "healthy") {
      lines.push("  [OK]   Container health check reports healthy")
    } else if (health === "no-healthcheck") {
      lines.push("  [WARN] Container has no health check configured")
    } else {
      lines.push(`  [WARN] Container health check reports: ${health}`)
    }
  } catch {
    lines.push("  [WARN] Could not inspect container health")
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

function tryStartTestDatabase(): boolean {
  try {
    execSync("bun run test:db:up", { stdio: "pipe" })
    return true
  } catch {
    return false
  }
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

export async function ensureDatabaseReady(options?: {
  timeoutMs?: number
  intervalMs?: number
  autoStart?: boolean
  autoStartTimeoutMs?: number
}): Promise<void> {
  const {
    timeoutMs = 30000,
    intervalMs = 500,
    autoStart = false,
    autoStartTimeoutMs = 50000,
  } = options ?? {}

  try {
    await waitForDatabase(timeoutMs, intervalMs)
    return
  } catch (initialError) {
    if (!autoStart || !tryStartTestDatabase()) {
      throw initialError
    }
  }

  await waitForDatabase(autoStartTimeoutMs, intervalMs)
}

// Export the URL for external use
export { TEST_DATABASE_URL }
