/**
 * Real Rate-Limit Test Harness
 *
 * Provides test helpers for integration tests that exercise real rate-limit
 * paths without vi.mock on the rate-limit module.
 *
 * The rate-limit module already has built-in test support:
 * - In-memory store fallback when Redis is not configured (always in tests)
 * - `resetRateLimitStore()` for clearing state
 * - `now` parameter on consume/enforce functions for time control
 *
 * This harness wraps those primitives into a convenient test API with
 * helpers for warming/exhausting limits, time manipulation, and
 * response assertions.
 *
 * ## Usage
 *
 * ```ts
 * import { setupRateLimitHarness } from "@/test/rate-limit-harness"
 *
 * describe("password reset", () => {
 *   setupIntegrationTests()
 *   const testAuth = setupTestAuth()
 *   const rateLimit = setupRateLimitHarness()
 *
 *   it("blocks after too many attempts", async () => {
 *     await testAuth.loginAsNewUser({ role: "ADMIN" })
 *     rateLimit.exhaustRouteLimit("password-reset:user-1", { limit: 5, windowMs: 900_000 })
 *     // ... next API call should get 429 ...
 *   })
 *
 *   it("allows requests after window expires", async () => {
 *     rateLimit.exhaustRouteLimit("password-reset:user-1", { limit: 5, windowMs: 900_000 })
 *     rateLimit.advanceTime(900_001) // Move past the window
 *     // ... next API call should succeed ...
 *   })
 * })
 * ```
 */

import { beforeEach } from "vitest"
import {
  resetRateLimitStore,
  consumeRateLimitMemory,
  enforceRouteRateLimit,
  enforceApiRateLimit,
  type RateLimitScope,
} from "@/lib/rate-limit"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RateLimitRule = { limit: number; windowMs: number }

export interface RateLimitHarness {
  /** Current virtual time (ms). Use advanceTime() to move forward. */
  readonly now: number

  // ----- Time control -----

  /** Advance virtual time by the given number of milliseconds. */
  advanceTime(ms: number): void

  /** Set virtual time to an absolute value. */
  setTime(ms: number): void

  // ----- Store manipulation -----

  /** Reset the in-memory rate-limit store. Called automatically in beforeEach. */
  reset(): void

  /**
   * Consume N credits for a scoped key (e.g., "auth", "write").
   * Uses the built-in scope rules (auth: 10/min, write: 60/min, etc.).
   */
  consumeScope(scope: RateLimitScope, clientAddress: string, count?: number): void

  /**
   * Exhaust the limit for a scoped key so the next request is blocked.
   */
  exhaustScope(scope: RateLimitScope, clientAddress: string): void

  /**
   * Consume N credits for a per-route key with a custom rule.
   * The key is automatically prefixed with "route:" to match enforceRouteRateLimit.
   */
  consumeRoute(key: string, rule: RateLimitRule, count?: number): void

  /**
   * Exhaust the limit for a per-route key so the next request is blocked.
   */
  exhaustRouteLimit(key: string, rule: RateLimitRule): void

  // ----- Direct enforcement (with time control) -----

  /**
   * Call enforceRouteRateLimit with the harness's virtual clock.
   * Returns the 429 response or null.
   */
  enforceRoute(key: string, rule: RateLimitRule): Promise<Response | null>

  /**
   * Call enforceApiRateLimit with the harness's virtual clock.
   * Returns the 429 response or undefined.
   */
  enforceApi(request: {
    headers: Headers
    method: string
    nextUrl: { pathname: string }
  }): Promise<Response | undefined>

  // ----- Assertions -----

  /** Assert that a response is a 429 rate-limit response. */
  assert429(response: Response): void

  /** Assert that a response has the expected rate-limit headers. */
  assertRateLimitHeaders(
    response: Response,
    expected?: { limit?: number; remaining?: number },
  ): void
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Setup rate-limit test harness.
 *
 * Call at module level in your test file alongside setupIntegrationTests().
 * Resets the rate-limit store and virtual clock before each test.
 */
export function setupRateLimitHarness(): RateLimitHarness {
  let virtualNow = Date.now()

  beforeEach(() => {
    resetRateLimitStore()
    virtualNow = Date.now()
  })

  const harness: RateLimitHarness = {
    get now() {
      return virtualNow
    },

    // ----- Time control -----

    advanceTime(ms: number) {
      virtualNow += ms
    },

    setTime(ms: number) {
      virtualNow = ms
    },

    // ----- Store manipulation -----

    reset() {
      resetRateLimitStore()
    },

    consumeScope(scope: RateLimitScope, clientAddress: string, count = 1) {
      for (let i = 0; i < count; i++) {
        consumeRateLimitMemory(scope, clientAddress, virtualNow)
      }
    },

    exhaustScope(scope: RateLimitScope, clientAddress: string) {
      // Scope limits: auth=10, write=60, read=300, upload=20
      const limits: Record<RateLimitScope, number> = {
        auth: 10,
        write: 60,
        read: 300,
        upload: 20,
      }
      harness.consumeScope(scope, clientAddress, limits[scope])
    },

    consumeRoute(key: string, rule: RateLimitRule, count = 1) {
      // enforceRouteRateLimit prefixes keys with "route:"
      const storeKey = `route:${key}`
      for (let i = 0; i < count; i++) {
        // Use consumeRateLimitMemory with a custom scope-like approach
        // We need to write directly to the store since consumeRateLimitMemory
        // uses predefined scopes. Instead, call enforceRouteRateLimit which
        // handles the store key correctly.
        // Actually, enforceRouteRateLimit writes to the store with "route:" prefix
        // and uses the same in-memory store. We can just call it directly.
        void enforceRouteRateLimit(key, rule, virtualNow)
      }
    },

    exhaustRouteLimit(key: string, rule: RateLimitRule) {
      harness.consumeRoute(key, rule, rule.limit)
    },

    // ----- Direct enforcement -----

    async enforceRoute(key: string, rule: RateLimitRule) {
      return enforceRouteRateLimit(key, rule, virtualNow)
    },

    async enforceApi(request) {
      return enforceApiRateLimit(request, virtualNow)
    },

    // ----- Assertions -----

    assert429(response: Response) {
      if (response.status !== 429) {
        throw new Error(
          `Expected 429 Too Many Requests but got ${response.status}`,
        )
      }
      const retryAfter = response.headers.get("Retry-After")
      if (!retryAfter) {
        throw new Error("429 response missing Retry-After header")
      }
    },

    assertRateLimitHeaders(
      response: Response,
      expected?: { limit?: number; remaining?: number },
    ) {
      const limit = response.headers.get("X-RateLimit-Limit")
      const remaining = response.headers.get("X-RateLimit-Remaining")
      const reset = response.headers.get("X-RateLimit-Reset")

      if (!limit || !remaining || !reset) {
        throw new Error(
          `Missing rate-limit headers. Got: X-RateLimit-Limit=${limit}, ` +
            `X-RateLimit-Remaining=${remaining}, X-RateLimit-Reset=${reset}`,
        )
      }

      if (expected?.limit !== undefined && Number(limit) !== expected.limit) {
        throw new Error(
          `Expected X-RateLimit-Limit=${expected.limit} but got ${limit}`,
        )
      }

      if (expected?.remaining !== undefined && Number(remaining) !== expected.remaining) {
        throw new Error(
          `Expected X-RateLimit-Remaining=${expected.remaining} but got ${remaining}`,
        )
      }
    },
  }

  return harness
}

export type { RateLimitScope }
