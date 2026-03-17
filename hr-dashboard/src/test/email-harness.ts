/**
 * Real Email Test Harness
 *
 * Provides assertion helpers and failure injection for integration tests
 * that exercise real email sending paths without vi.mock on the email module.
 *
 * The email module's built-in test mode captures emails to an in-memory outbox.
 * This harness wraps that outbox with convenient assertion and inspection APIs,
 * and adds failure injection for testing error/rollback paths.
 *
 * ## Usage
 *
 * ```ts
 * import { setupEmailHarness } from "@/test/setup-integration"
 *
 * describe("user invite", () => {
 *   setupIntegrationTests()
 *   const testAuth = setupTestAuth()
 *   const emailHarness = setupEmailHarness()
 *
 *   it("sends invite email on user creation", async () => {
 *     await testAuth.loginAsNewUser({ role: "ADMIN" })
 *     // ... POST /api/users ...
 *     emailHarness.assertEmailSentTo("new-user@example.com")
 *     const link = emailHarness.extractFirstLink(emailHarness.lastEmail()!)
 *     expect(link).toContain("/set-password?token=")
 *   })
 *
 *   it("rolls back on email failure", async () => {
 *     emailHarness.injectFailure("reject")
 *     // ... POST /api/users ... expects fallback behavior
 *   })
 * })
 * ```
 */

import { beforeEach } from "vitest"
import {
  getTestOutbox,
  clearTestOutbox,
  getLastTestEmail,
  _setTestInterceptor,
  type CapturedEmail,
  type EmailPayload,
  type EmailResult,
} from "@/lib/email"

// ---------------------------------------------------------------------------
// Failure injection modes
// ---------------------------------------------------------------------------

export type FailureMode = "reject" | "timeout" | "partial"

const FAILURE_RESPONSES: Record<FailureMode, EmailResult> = {
  reject: { success: false, error: "SMTP connection refused: ECONNREFUSED 127.0.0.1:25" },
  timeout: { success: false, error: "Connection timeout: socket hang up after 30000ms" },
  partial: { success: false, error: "Partial delivery failure: 452 Too many recipients" },
}

// ---------------------------------------------------------------------------
// Harness API
// ---------------------------------------------------------------------------

export interface EmailFailureOptions {
  /** Which failure to simulate */
  mode: FailureMode
  /** Only fail emails matching this filter. Unmatched emails proceed normally. */
  match?: {
    to?: string | RegExp
    subject?: string | RegExp
  }
}

function matches(value: string, pattern: string | RegExp): boolean {
  if (typeof pattern === "string") return value.includes(pattern)
  return pattern.test(value)
}

/**
 * Setup email test harness.
 *
 * Call at module level in your test file alongside setupIntegrationTests().
 * Clears the outbox and resets failure injection before each test.
 */
export function setupEmailHarness() {
  beforeEach(() => {
    clearTestOutbox()
    _setTestInterceptor(null)
  })

  return {
    // ----- Outbox inspection -----

    /** All captured emails in send order. */
    get outbox(): readonly CapturedEmail[] {
      return getTestOutbox()
    },

    /** Number of emails sent in current test. */
    get count(): number {
      return getTestOutbox().length
    },

    /** Most recently sent email, or undefined. */
    lastEmail(): CapturedEmail | undefined {
      return getLastTestEmail()
    },

    /** Get email at index (0-based, send order). */
    emailAt(index: number): CapturedEmail | undefined {
      return getTestOutbox()[index]
    },

    /** Find first email matching filters. */
    findEmail(opts: {
      to?: string | RegExp
      subject?: string | RegExp
    }): CapturedEmail | undefined {
      return getTestOutbox().find((email) => {
        if (opts.to && !matches(email.to, opts.to)) return false
        if (opts.subject && !matches(email.subject, opts.subject)) return false
        return true
      })
    },

    /** Clear the outbox mid-test (e.g., between two API calls). */
    clear(): void {
      clearTestOutbox()
    },

    // ----- Assertions -----

    /** Assert exactly N emails were sent. */
    assertCount(expected: number): void {
      const actual = getTestOutbox().length
      if (actual !== expected) {
        const subjects = getTestOutbox().map((e) => `  - "${e.subject}" → ${e.to}`).join("\n")
        throw new Error(
          `Expected ${expected} email(s) but ${actual} were sent.\n` +
            (actual > 0 ? `Sent:\n${subjects}` : "No emails captured."),
        )
      }
    },

    /** Assert no emails were sent. */
    assertNone(): void {
      this.assertCount(0)
    },

    /** Assert at least one email was sent to the given address. */
    assertEmailSentTo(to: string | RegExp): CapturedEmail {
      const email = getTestOutbox().find((e) => matches(e.to, to))
      if (!email) {
        const recipients = getTestOutbox().map((e) => e.to).join(", ") || "(none)"
        throw new Error(
          `Expected email to ${to} but none found. Recipients: ${recipients}`,
        )
      }
      return email
    },

    /** Assert at least one email with matching subject was sent. */
    assertEmailWithSubject(subject: string | RegExp): CapturedEmail {
      const email = getTestOutbox().find((e) => matches(e.subject, subject))
      if (!email) {
        const subjects = getTestOutbox().map((e) => e.subject).join(", ") || "(none)"
        throw new Error(
          `Expected email with subject matching ${subject} but none found. Subjects: ${subjects}`,
        )
      }
      return email
    },

    // ----- Content extraction -----

    /** Extract all URLs from an email's HTML body. */
    extractLinks(email: CapturedEmail): string[] {
      const urlPattern = /href=["']([^"']+)["']/g
      const links: string[] = []
      let match: RegExpExecArray | null
      while ((match = urlPattern.exec(email.html)) !== null) {
        if (match[1]) links.push(match[1])
      }
      return links
    },

    /** Extract first URL from an email's HTML body, or null. */
    extractFirstLink(email: CapturedEmail): string | null {
      const links = this.extractLinks(email)
      return links[0] ?? null
    },

    /** Extract all URLs from an email's plain text body. */
    extractTextLinks(email: CapturedEmail): string[] {
      if (!email.text) return []
      const urlPattern = /https?:\/\/[^\s<>"]+/g
      return email.text.match(urlPattern) ?? []
    },

    /** Get the HTML body of the last email. Throws if no email sent. */
    lastHtml(): string {
      const email = getLastTestEmail()
      if (!email) throw new Error("No email sent — cannot read HTML body.")
      return email.html
    },

    /** Get the text body of the last email. Throws if no email sent. */
    lastText(): string | undefined {
      const email = getLastTestEmail()
      if (!email) throw new Error("No email sent — cannot read text body.")
      return email.text
    },

    // ----- Failure injection -----

    /**
     * Inject a failure into the email send path.
     *
     * Emails matching the optional filter will fail with a simulated SMTP error.
     * Non-matching emails proceed normally to the test outbox.
     *
     * ```ts
     * emailHarness.injectFailure("reject")               // All emails fail
     * emailHarness.injectFailure("timeout", { to: "bob" }) // Only bob's emails timeout
     * ```
     */
    injectFailure(mode: FailureMode, match?: EmailFailureOptions["match"]): void {
      _setTestInterceptor((payload: EmailPayload): EmailResult | null => {
        if (match) {
          if (match.to && !matches(payload.to, match.to)) return null
          if (match.subject && !matches(payload.subject, match.subject)) return null
        }
        return FAILURE_RESPONSES[mode]
      })
    },

    /**
     * Inject a custom interceptor for fine-grained control.
     * Return an EmailResult to simulate a specific outcome, or null to proceed normally.
     */
    injectCustom(fn: (payload: EmailPayload) => EmailResult | null): void {
      _setTestInterceptor(fn)
    },

    /** Clear any failure injection. Emails will be captured normally. */
    clearFailure(): void {
      _setTestInterceptor(null)
    },
  }
}

export type EmailHarness = ReturnType<typeof setupEmailHarness>
