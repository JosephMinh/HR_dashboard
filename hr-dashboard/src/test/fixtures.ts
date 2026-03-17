/**
 * Deterministic Test Fixtures
 *
 * Provides unique, collision-safe data generators for parallel test suites.
 *
 * CONVENTIONS:
 *
 * 1. UNIQUE DATA: Every test-created entity must use a unique identifier
 *    derived from the test name/suite to avoid collisions in parallel runs.
 *    Use `uniqueId(prefix)` or `uniqueEmail(prefix)` instead of bare timestamps.
 *
 * 2. RESET BOUNDARIES:
 *    - Unit tests: No DB, no reset needed
 *    - Integration tests: resetDatabase() before each test (default in setupIntegrationTests)
 *    - E2E tests: resetE2EDatabase() + seedTestUsers() in global setup
 *
 * 3. FACTORY USAGE:
 *    - Use createTestFactories() from setup-integration.ts for integration tests
 *    - Use seed* functions from __tests__/e2e/utils/database.ts for E2E tests
 *    - Always pass unique identifiers via the prefix parameter
 *
 * 4. SERIALIZATION POLICY:
 *    - Integration suites: run in parallel by default (each gets a fresh DB)
 *    - E2E suites: run serially (shared browser, shared server)
 *    - Suites needing shared mutable state: mark with { sequential: true } in describe
 */

import { randomBytes } from "node:crypto"

let counter = 0

/**
 * Generate a short unique ID safe for use as email prefixes, entity names, etc.
 * Combines a monotonic counter with random bytes for collision resistance.
 */
export function uniqueId(prefix = "test"): string {
  counter++
  const rand = randomBytes(4).toString("hex")
  return `${prefix}-${counter}-${rand}`
}

/**
 * Generate a unique email address for test entities.
 * Guaranteed unique across parallel test workers.
 */
export function uniqueEmail(prefix = "user"): string {
  return `${uniqueId(prefix)}@test.example.com`
}

/**
 * Generate a unique import key for WFP test data.
 */
export function uniqueImportKey(sheet = "Test", row?: number): string {
  const r = row ?? counter + 1
  return `${sheet}:${r}:${randomBytes(4).toString("hex")}`
}

/**
 * Reset the counter (call between test files if needed for determinism).
 * Not required when using resetDatabase() which clears all data anyway.
 */
export function resetFixtureCounter(): void {
  counter = 0
}

/**
 * Common test data constants.
 * Use these for assertions where exact values matter.
 */
export const TEST_DEPARTMENTS = [
  "Engineering",
  "Product",
  "Design",
  "Marketing",
  "Sales",
] as const

export const TEST_LEVELS = ["IC1", "IC2", "IC3", "IC4", "M1", "M2"] as const

export const TEST_HORIZONS = ["2026", "Beyond 2026"] as const
