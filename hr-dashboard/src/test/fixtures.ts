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
 *    - Integration suites: single worker, shared DB, reset before each test
 *    - E2E suites: fully parallel by default, shared seeded baseline, per-worker auth storage
 *    - Suites needing shared mutable state: mark with serial mode explicitly
 */

let counter = 0

function sanitizeFixtureSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "test"
}

function getFixtureRunScope(): string {
  return sanitizeFixtureSegment(
    process.env.FIXTURE_RUN_SCOPE ??
      process.env.VITEST_POOL_ID ??
      process.env.TEST_WORKER_INDEX ??
      `pid-${process.pid}`,
  )
}

function nextFixtureToken(): string {
  counter += 1
  return `${getFixtureRunScope()}-${counter.toString(36).padStart(4, "0")}`
}

/**
 * Generate a short unique ID safe for use as email prefixes, entity names, etc.
 * Uses a worker/process-scoped monotonic token for deterministic uniqueness.
 */
export function uniqueId(prefix = "test"): string {
  return `${sanitizeFixtureSegment(prefix)}-${nextFixtureToken()}`
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
  return `${sheet}:${r}:${nextFixtureToken()}`
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
