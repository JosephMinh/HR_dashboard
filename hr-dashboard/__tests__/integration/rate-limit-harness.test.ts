/**
 * Rate-Limit Harness Integration Tests
 *
 * Verifies the rate-limit test harness works correctly:
 * 1. Store reset between tests
 * 2. Scope-based consumption and exhaustion
 * 3. Route-based consumption and exhaustion
 * 4. Time manipulation
 * 5. 429 response assertions
 * 6. Integration with real enforceRouteRateLimit
 */

import { describe, it, expect } from "vitest"
import { setupRateLimitHarness } from "@/test/rate-limit-harness"
import {
  consumeRateLimitMemory,
  enforceRouteRateLimit,
  enforceApiRateLimit,
  resetRateLimitStore,
} from "@/lib/rate-limit"

describe("setupRateLimitHarness()", () => {
  const rateLimit = setupRateLimitHarness()

  // -----------------------------------------------------------------------
  // Basic store management
  // -----------------------------------------------------------------------

  it("starts with a clean store (no prior state)", async () => {
    // First request should always be allowed
    const response = await rateLimit.enforceRoute("test-key", {
      limit: 5,
      windowMs: 60_000,
    })
    expect(response).toBeNull()
  })

  it("resets store between tests (state from previous test is gone)", async () => {
    // If the store leaked from the previous test, this would accumulate
    const response = await rateLimit.enforceRoute("test-key", {
      limit: 5,
      windowMs: 60_000,
    })
    expect(response).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Scope-based rate limiting
  // -----------------------------------------------------------------------

  it("consumeScope consumes credits for a scope", () => {
    rateLimit.consumeScope("auth", "10.0.0.1", 9)

    // 9 of 10 auth credits consumed — 10th should still be allowed
    const result = consumeRateLimitMemory("auth", "10.0.0.1", rateLimit.now)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0)

    // 11th should be blocked
    const blocked = consumeRateLimitMemory("auth", "10.0.0.1", rateLimit.now)
    expect(blocked.allowed).toBe(false)
  })

  it("exhaustScope fills the entire quota", () => {
    rateLimit.exhaustScope("auth", "10.0.0.2")

    const result = consumeRateLimitMemory("auth", "10.0.0.2", rateLimit.now)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it("exhaustScope works for write scope (60 limit)", () => {
    rateLimit.exhaustScope("write", "10.0.0.3")

    const result = consumeRateLimitMemory("write", "10.0.0.3", rateLimit.now)
    expect(result.allowed).toBe(false)
  })

  // -----------------------------------------------------------------------
  // Route-based rate limiting
  // -----------------------------------------------------------------------

  it("consumeRoute fills credits for a per-route key", async () => {
    const rule = { limit: 5, windowMs: 900_000 }
    rateLimit.consumeRoute("password-reset:user-1", rule, 4)

    // 5th should still be allowed
    const allowed = await rateLimit.enforceRoute("password-reset:user-1", rule)
    expect(allowed).toBeNull()

    // 6th should be blocked
    const blocked = await rateLimit.enforceRoute("password-reset:user-1", rule)
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
  })

  it("exhaustRouteLimit makes the next request fail", async () => {
    const rule = { limit: 5, windowMs: 900_000 }
    rateLimit.exhaustRouteLimit("password-reset:user-2", rule)

    const response = await rateLimit.enforceRoute("password-reset:user-2", rule)
    expect(response).not.toBeNull()
    expect(response!.status).toBe(429)
  })

  it("different route keys are independent", async () => {
    const rule = { limit: 3, windowMs: 60_000 }
    rateLimit.exhaustRouteLimit("key-a", rule)

    // key-b should still be allowed
    const response = await rateLimit.enforceRoute("key-b", rule)
    expect(response).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Time manipulation
  // -----------------------------------------------------------------------

  it("advanceTime moves virtual clock forward", () => {
    const before = rateLimit.now
    rateLimit.advanceTime(5000)
    expect(rateLimit.now).toBe(before + 5000)
  })

  it("setTime sets virtual clock to absolute value", () => {
    rateLimit.setTime(1_000_000)
    expect(rateLimit.now).toBe(1_000_000)
  })

  it("advancing past window resets rate limit", async () => {
    const rule = { limit: 3, windowMs: 60_000 }

    // Exhaust the limit
    rateLimit.exhaustRouteLimit("timed-key", rule)
    const blocked = await rateLimit.enforceRoute("timed-key", rule)
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)

    // Advance past the window
    rateLimit.advanceTime(60_001)

    // Should be allowed again
    const allowed = await rateLimit.enforceRoute("timed-key", rule)
    expect(allowed).toBeNull()
  })

  it("advancing within window does not reset rate limit", async () => {
    const rule = { limit: 3, windowMs: 60_000 }

    rateLimit.exhaustRouteLimit("partial-time-key", rule)

    // Advance only halfway through window
    rateLimit.advanceTime(30_000)

    const response = await rateLimit.enforceRoute("partial-time-key", rule)
    expect(response).not.toBeNull()
    expect(response!.status).toBe(429)
  })

  // -----------------------------------------------------------------------
  // enforceApi integration
  // -----------------------------------------------------------------------

  it("enforceApi uses virtual clock for scope-based limits", async () => {
    const request = {
      method: "POST",
      headers: new Headers({ "x-forwarded-for": "192.168.1.100" }),
      nextUrl: { pathname: "/api/auth/signin" },
    }

    // Exhaust auth scope
    rateLimit.exhaustScope("auth", "192.168.1.100")

    const response = await rateLimit.enforceApi(request)
    expect(response).toBeDefined()
    expect(response!.status).toBe(429)
  })

  it("enforceApi returns undefined when under limit", async () => {
    const request = {
      method: "GET",
      headers: new Headers({ "x-forwarded-for": "10.10.10.10" }),
      nextUrl: { pathname: "/api/jobs" },
    }

    const response = await rateLimit.enforceApi(request)
    expect(response).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // Assertion helpers
  // -----------------------------------------------------------------------

  it("assert429 passes on 429 response", async () => {
    const rule = { limit: 1, windowMs: 60_000 }
    rateLimit.exhaustRouteLimit("assert-key", rule)

    const response = await rateLimit.enforceRoute("assert-key", rule)
    expect(response).not.toBeNull()

    // Should not throw
    rateLimit.assert429(response!)
  })

  it("assert429 throws on non-429 response", () => {
    const response = new Response("OK", { status: 200 })
    expect(() => rateLimit.assert429(response)).toThrow(
      "Expected 429 Too Many Requests but got 200",
    )
  })

  it("assertRateLimitHeaders validates header presence", async () => {
    const rule = { limit: 5, windowMs: 60_000 }
    rateLimit.exhaustRouteLimit("header-key", rule)

    const response = await rateLimit.enforceRoute("header-key", rule)
    expect(response).not.toBeNull()

    // Should not throw — all headers present
    rateLimit.assertRateLimitHeaders(response!)
  })

  it("assertRateLimitHeaders validates expected values", async () => {
    const rule = { limit: 5, windowMs: 60_000 }
    rateLimit.exhaustRouteLimit("header-val-key", rule)

    const response = await rateLimit.enforceRoute("header-val-key", rule)
    expect(response).not.toBeNull()

    rateLimit.assertRateLimitHeaders(response!, { limit: 5, remaining: 0 })
  })

  it("assertRateLimitHeaders throws on mismatched values", async () => {
    const rule = { limit: 5, windowMs: 60_000 }
    rateLimit.exhaustRouteLimit("header-mismatch-key", rule)

    const response = await rateLimit.enforceRoute("header-mismatch-key", rule)
    expect(response).not.toBeNull()

    expect(() =>
      rateLimit.assertRateLimitHeaders(response!, { limit: 99 }),
    ).toThrow("Expected X-RateLimit-Limit=99 but got 5")
  })

  it("assertRateLimitHeaders throws on missing headers", () => {
    const response = new Response("OK", { status: 200 })
    expect(() => rateLimit.assertRateLimitHeaders(response)).toThrow(
      "Missing rate-limit headers",
    )
  })

  // -----------------------------------------------------------------------
  // 429 response body
  // -----------------------------------------------------------------------

  it("429 response includes retryAfterSeconds in body", async () => {
    const rule = { limit: 1, windowMs: 60_000 }
    rateLimit.exhaustRouteLimit("body-key", rule)

    const response = await rateLimit.enforceRoute("body-key", rule)
    expect(response).not.toBeNull()

    const body = await response!.json()
    expect(body.error).toBe("Too many requests")
    expect(body.retryAfterSeconds).toBeGreaterThan(0)
  })

  // -----------------------------------------------------------------------
  // reset() manual call
  // -----------------------------------------------------------------------

  it("reset() clears all accumulated state mid-test", async () => {
    const rule = { limit: 3, windowMs: 60_000 }
    rateLimit.exhaustRouteLimit("reset-test-key", rule)

    // Blocked
    const blocked = await rateLimit.enforceRoute("reset-test-key", rule)
    expect(blocked).not.toBeNull()

    // Manual reset
    rateLimit.reset()

    // Allowed again
    const allowed = await rateLimit.enforceRoute("reset-test-key", rule)
    expect(allowed).toBeNull()
  })
})
