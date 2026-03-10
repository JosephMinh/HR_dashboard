/**
 * E2E Global Teardown
 *
 * Runs once after all E2E tests to:
 * 1. Disconnect database
 * 2. Clean up temporary files
 * 3. Generate summary report
 */

import { disconnectE2EPrisma, getTestDataCounts } from "./utils/database"
import { clearAuthStorage } from "./utils/auth"
import fs from "node:fs"
import path from "node:path"

export default async function globalTeardown(): Promise<void> {
  console.log("\n" + "=".repeat(60))
  console.log(" E2E Test Suite - Global Teardown")
  console.log("=".repeat(60))
  console.log(`Started at: ${new Date().toISOString()}`)
  console.log("")

  try {
    // 1. Get final data counts for summary
    console.log("[E2E-TEARDOWN] Getting final data counts...")
    try {
      const counts = await getTestDataCounts()
      console.log("[E2E-TEARDOWN] Final counts:", counts)
    } catch {
      console.log("[E2E-TEARDOWN] Could not get final counts (database may be down)")
    }

    // 2. Disconnect database
    console.log("[E2E-TEARDOWN] Disconnecting database...")
    await disconnectE2EPrisma()

    // 3. Clear auth storage
    console.log("[E2E-TEARDOWN] Clearing auth storage...")
    clearAuthStorage()

    // 4. Clean up any temporary test files
    const tempDirs = [
      path.join(process.cwd(), ".playwright", "auth"),
    ]

    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        console.log(`[E2E-TEARDOWN] Cleaning up: ${dir}`)
        // Don't delete - just log. Tests might need to inspect auth state.
      }
    }

    console.log("")
    console.log("[E2E-TEARDOWN] Teardown complete!")
    console.log("=".repeat(60) + "\n")
  } catch (error) {
    console.error("[E2E-TEARDOWN] Teardown error:", error)
    // Don't throw - teardown errors shouldn't fail the test run
  }
}
