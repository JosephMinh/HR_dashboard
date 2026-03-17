/**
 * Email Harness Integration Tests
 *
 * Verifies that the email harness works with real email capture (no vi.mock),
 * exercises assertion helpers, link extraction, and failure injection.
 */

import { describe, it, expect } from "vitest"
import {
  setupIntegrationTests,
  setupEmailHarness,
  getTestPrisma,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"
import { sendEmail } from "@/lib/email"

// Mock rate limiting to avoid Redis dependency
import { vi } from "vitest"
vi.mock("@/lib/rate-limit", () => ({
  enforceApiRateLimit: vi.fn().mockResolvedValue(null),
  enforceRouteRateLimit: vi.fn().mockResolvedValue(null),
}))

describe("Email Harness", () => {
  setupIntegrationTests()
  const testAuth = setupTestAuth()
  const emailHarness = setupEmailHarness()

  // =========================================================================
  // Outbox capture
  // =========================================================================

  describe("outbox capture", () => {
    it("captures emails sent via sendEmail()", async () => {
      await sendEmail({
        to: "alice@example.com",
        subject: "Hello",
        html: "<p>World</p>",
      })

      expect(emailHarness.count).toBe(1)
      expect(emailHarness.lastEmail()?.to).toBe("alice@example.com")
      expect(emailHarness.lastEmail()?.subject).toBe("Hello")
    })

    it("captures multiple emails in order", async () => {
      await sendEmail({ to: "a@test.com", subject: "First", html: "<p>1</p>" })
      await sendEmail({ to: "b@test.com", subject: "Second", html: "<p>2</p>" })
      await sendEmail({ to: "c@test.com", subject: "Third", html: "<p>3</p>" })

      expect(emailHarness.count).toBe(3)
      expect(emailHarness.emailAt(0)?.subject).toBe("First")
      expect(emailHarness.emailAt(1)?.subject).toBe("Second")
      expect(emailHarness.emailAt(2)?.subject).toBe("Third")
    })

    it("clears outbox between tests (this test starts empty)", () => {
      expect(emailHarness.count).toBe(0)
    })

    it("clear() resets mid-test", async () => {
      await sendEmail({ to: "x@test.com", subject: "Before", html: "" })
      expect(emailHarness.count).toBe(1)

      emailHarness.clear()
      expect(emailHarness.count).toBe(0)
    })

    it("findEmail() filters by recipient and subject", async () => {
      await sendEmail({ to: "alice@test.com", subject: "Invite", html: "" })
      await sendEmail({ to: "bob@test.com", subject: "Reset", html: "" })

      expect(emailHarness.findEmail({ to: "bob" })?.subject).toBe("Reset")
      expect(emailHarness.findEmail({ subject: /invite/i })?.to).toBe("alice@test.com")
      expect(emailHarness.findEmail({ to: "charlie" })).toBeUndefined()
    })
  })

  // =========================================================================
  // Assertions
  // =========================================================================

  describe("assertions", () => {
    it("assertCount passes on match", async () => {
      await sendEmail({ to: "a@test.com", subject: "One", html: "" })
      emailHarness.assertCount(1) // should not throw
    })

    it("assertCount throws with details on mismatch", async () => {
      await sendEmail({ to: "a@test.com", subject: "One", html: "" })
      expect(() => emailHarness.assertCount(2)).toThrow(/Expected 2.*but 1/)
    })

    it("assertNone passes when empty", () => {
      emailHarness.assertNone() // should not throw
    })

    it("assertNone throws when emails exist", async () => {
      await sendEmail({ to: "a@test.com", subject: "Oops", html: "" })
      expect(() => emailHarness.assertNone()).toThrow(/Expected 0.*but 1/)
    })

    it("assertEmailSentTo finds matching recipient", async () => {
      await sendEmail({ to: "target@co.com", subject: "Hi", html: "" })
      const email = emailHarness.assertEmailSentTo("target@co.com")
      expect(email.subject).toBe("Hi")
    })

    it("assertEmailSentTo supports regex", async () => {
      await sendEmail({ to: "user-123@co.com", subject: "Hi", html: "" })
      emailHarness.assertEmailSentTo(/user-\d+@co/)
    })

    it("assertEmailSentTo throws when not found", () => {
      expect(() => emailHarness.assertEmailSentTo("nobody@test.com")).toThrow(
        /Expected email to nobody@test.com/,
      )
    })

    it("assertEmailWithSubject finds matching subject", async () => {
      await sendEmail({ to: "a@test.com", subject: "Welcome to HR Dashboard", html: "" })
      const email = emailHarness.assertEmailWithSubject("Welcome")
      expect(email.to).toBe("a@test.com")
    })
  })

  // =========================================================================
  // Link extraction
  // =========================================================================

  describe("link extraction", () => {
    it("extractLinks pulls hrefs from HTML", async () => {
      await sendEmail({
        to: "a@test.com",
        subject: "Links",
        html: '<a href="https://app.test/setup?token=abc123">Click</a><a href="https://app.test/help">Help</a>',
      })

      const links = emailHarness.extractLinks(emailHarness.lastEmail()!)
      expect(links).toEqual([
        "https://app.test/setup?token=abc123",
        "https://app.test/help",
      ])
    })

    it("extractFirstLink returns first URL", async () => {
      await sendEmail({
        to: "a@test.com",
        subject: "Link",
        html: '<a href="https://app.test/first">Go</a>',
      })

      expect(emailHarness.extractFirstLink(emailHarness.lastEmail()!)).toBe(
        "https://app.test/first",
      )
    })

    it("extractFirstLink returns null when no links", async () => {
      await sendEmail({ to: "a@test.com", subject: "No links", html: "<p>Plain</p>" })
      expect(emailHarness.extractFirstLink(emailHarness.lastEmail()!)).toBeNull()
    })

    it("extractTextLinks pulls URLs from text body", async () => {
      await sendEmail({
        to: "a@test.com",
        subject: "Text links",
        html: "",
        text: "Visit https://app.test/setup?token=xyz or https://app.test/help for more.",
      })

      const links = emailHarness.extractTextLinks(emailHarness.lastEmail()!)
      expect(links).toEqual([
        "https://app.test/setup?token=xyz",
        "https://app.test/help",
      ])
    })
  })

  // =========================================================================
  // Failure injection
  // =========================================================================

  describe("failure injection", () => {
    it("injectFailure('reject') makes all emails fail", async () => {
      emailHarness.injectFailure("reject")

      const result = await sendEmail({
        to: "a@test.com",
        subject: "Will fail",
        html: "",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("ECONNREFUSED")
      // Failed emails should NOT be captured in outbox
      expect(emailHarness.count).toBe(0)
    })

    it("injectFailure('timeout') simulates timeout", async () => {
      emailHarness.injectFailure("timeout")

      const result = await sendEmail({
        to: "a@test.com",
        subject: "Timeout",
        html: "",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("timeout")
    })

    it("injectFailure with match only fails targeted emails", async () => {
      emailHarness.injectFailure("reject", { to: "bad@test.com" })

      const goodResult = await sendEmail({
        to: "good@test.com",
        subject: "Good",
        html: "",
      })
      const badResult = await sendEmail({
        to: "bad@test.com",
        subject: "Bad",
        html: "",
      })

      expect(goodResult.success).toBe(true)
      expect(badResult.success).toBe(false)
      expect(emailHarness.count).toBe(1) // only good email captured
      expect(emailHarness.lastEmail()?.to).toBe("good@test.com")
    })

    it("injectFailure with subject match", async () => {
      emailHarness.injectFailure("partial", { subject: /reset/i })

      const inviteResult = await sendEmail({
        to: "a@test.com",
        subject: "You're invited!",
        html: "",
      })
      const resetResult = await sendEmail({
        to: "a@test.com",
        subject: "Password Reset",
        html: "",
      })

      expect(inviteResult.success).toBe(true)
      expect(resetResult.success).toBe(false)
    })

    it("clearFailure restores normal capture", async () => {
      emailHarness.injectFailure("reject")
      emailHarness.clearFailure()

      const result = await sendEmail({
        to: "a@test.com",
        subject: "Works again",
        html: "",
      })

      expect(result.success).toBe(true)
      expect(emailHarness.count).toBe(1)
    })

    it("failure injection resets between tests (this test has no failure)", async () => {
      const result = await sendEmail({
        to: "a@test.com",
        subject: "No failure",
        html: "",
      })
      expect(result.success).toBe(true)
    })
  })

  // =========================================================================
  // Real API integration (invite email flow without mocking)
  // =========================================================================

  describe("real invite email flow", () => {
    it("POST /api/users sends invite email captured by harness", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })

      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New Hire",
            email: "newhire@company.com",
            role: "RECRUITER",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.invite.status).toBe("sent")

      // Verify email was captured (no mocking!)
      emailHarness.assertCount(1)
      const email = emailHarness.assertEmailSentTo("newhire@company.com")
      emailHarness.assertEmailWithSubject(/invited|welcome/i)

      // Extract and verify the setup link
      const link = emailHarness.extractFirstLink(email)
      expect(link).toBeTruthy()
      expect(link).toContain("/set-password")
      expect(link).toContain("token=")
    })

    it("POST /api/users returns fallback URL on email failure", async () => {
      await testAuth.loginAsNewUser({ role: "ADMIN" })
      emailHarness.injectFailure("reject")

      const { POST } = await import("@/app/api/users/route")
      const response = await POST(
        new Request("http://localhost/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Failed Invite",
            email: "noemail@company.com",
            role: "VIEWER",
          }),
        }) as never,
      )

      // User should still be created, but invite status is "failed"
      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.invite.status).toBe("failed")
      expect(data.invite.setupUrl).toBeTruthy()
      expect(data.invite.error).toBeTruthy()

      // No email should have been captured
      emailHarness.assertNone()

      // But user should exist in DB
      const prisma = getTestPrisma()
      const dbUser = await prisma.user.findUnique({
        where: { email: "noemail@company.com" },
      })
      expect(dbUser).not.toBeNull()
      expect(dbUser?.name).toBe("Failed Invite")
    })
  })
})
