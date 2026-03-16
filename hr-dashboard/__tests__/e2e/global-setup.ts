/**
 * E2E Global Setup
 *
 * Runs once before all E2E tests to:
 * 1. Start/verify test database
 * 2. Push Prisma schema
 * 3. Seed test data
 * 4. Pre-authenticate test users
 */

import { execSync } from "node:child_process"
import { clearAuthStorage } from "./utils/auth"
import {
  getE2EPrisma,
  seedCompleteTestScenario,
  resetE2EDatabase,
} from "./utils/database"

const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://postgres:postgres@localhost:5433/hr_dashboard_test"

async function waitForDatabase(maxRetries = 30, delayMs = 1000): Promise<void> {
  const prisma = getE2EPrisma()

  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`
      console.log("[E2E-SETUP] Database is ready")
      return
    } catch {
      if (i < maxRetries - 1) {
        console.log(`[E2E-SETUP] Waiting for database... (${i + 1}/${maxRetries})`)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  throw new Error("Database not ready after maximum retries")
}

function tryStartTestDatabase(): boolean {
  try {
    console.log("[E2E-SETUP] Database unavailable, attempting docker test DB startup...")
    execSync("npm run test:db:up", { stdio: "pipe" })
    console.log("[E2E-SETUP] Docker test DB startup command completed")
    return true
  } catch (error) {
    console.warn("[E2E-SETUP] Could not auto-start test DB via docker:", error)
    return false
  }
}

async function ensureDatabaseReady(): Promise<void> {
  try {
    await waitForDatabase(10, 1000)
    return
  } catch {
    const started = tryStartTestDatabase()
    if (!started) {
      throw new Error(
        "Database is not reachable and automatic startup failed. Run `npm run test:db:up` and retry.",
      )
    }
  }

  await waitForDatabase(50, 1000)
}

async function pushSchema(): Promise<void> {
  console.log("[E2E-SETUP] Pushing Prisma schema to test database...")
  try {
    execSync("npx prisma db push --accept-data-loss", {
      env: {
        ...process.env,
        DATABASE_URL: TEST_DATABASE_URL,
      },
      stdio: "pipe",
    })
    console.log("[E2E-SETUP] Schema pushed successfully")
  } catch (error) {
    console.error("[E2E-SETUP] Failed to push schema:", error)
    throw error
  }
}

export default async function globalSetup(): Promise<void> {
  console.log("\n" + "=".repeat(60))
  console.log(" E2E Test Suite - Global Setup")
  console.log("=".repeat(60))
  console.log(`Started at: ${new Date().toISOString()}`)
  console.log("")

  try {
    // Clear cached auth state up front so contexts cannot be reused across DB resets.
    clearAuthStorage()

    // 1. Wait for database (with one automatic startup attempt)
    await ensureDatabaseReady()

    // 2. Push schema
    await pushSchema()

    // 3. Reset and seed database
    console.log("[E2E-SETUP] Resetting test database...")
    await resetE2EDatabase()

    console.log("[E2E-SETUP] Seeding test data...")
    const counts = await seedCompleteTestScenario()
    console.log("[E2E-SETUP] Seeded data:", counts)

    // 4. Pre-authenticate users (skip if server not ready yet)
    // The webServer config will start the dev server, but it might not be ready during globalSetup
    // We'll handle auth in individual tests or fixtures instead
    console.log("[E2E-SETUP] Skipping pre-authentication (will authenticate in tests)")

    console.log("")
    console.log("[E2E-SETUP] Setup complete!")
    console.log("=".repeat(60) + "\n")
  } catch (error) {
    console.error("[E2E-SETUP] Setup failed:", error)
    throw error
  }
}
