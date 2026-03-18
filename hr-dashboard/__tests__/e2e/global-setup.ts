/**
 * E2E Global Setup
 *
 * Runs once before all E2E tests to:
 * 1. Start/verify test database
 * 2. Push Prisma schema
 * 3. Seed test data
 * 4. Pre-authenticate test users
 */

import { clearAuthStorage } from "./utils/auth"
import { ensureDatabaseReady, pushSchema } from "../../src/test/test-db"
import {
  seedCompleteTestScenario,
  resetE2EDatabase,
} from "./utils/database"

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
    await ensureDatabaseReady({
      autoStart: true,
      timeoutMs: 10_000,
      intervalMs: 1_000,
      autoStartTimeoutMs: 50_000,
    })
    console.log("[E2E-SETUP] Database is ready")

    // 2. Push schema
    console.log("[E2E-SETUP] Pushing Prisma schema to test database...")
    await pushSchema()
    console.log("[E2E-SETUP] Schema pushed successfully")

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
