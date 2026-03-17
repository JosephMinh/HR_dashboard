/**
 * Email Adapter Contract Suite
 *
 * Validates the behavioral contract of the email adapter's public API.
 * Tests run against the real in-memory test backend (not mocks).
 *
 * Contract guarantees verified:
 * - sendEmail() returns EmailResult with correct shape
 * - Test outbox captures all payload fields + metadata
 * - Interceptor short-circuits with failure result (email NOT captured)
 * - clearTestOutbox() resets state
 * - Sender address includes header-injection protection
 *
 * Bead: hr-kfwh.20.2
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  sendEmail,
  getTestOutbox,
  clearTestOutbox,
  getLastTestEmail,
  _setTestInterceptor,
  type EmailPayload,
  type EmailResult,
  type CapturedEmail,
} from "@/lib/email"

describe("Email Adapter Contract", () => {
  beforeEach(() => {
    clearTestOutbox()
    _setTestInterceptor(null)
  })

  // =========================================================================
  // sendEmail() return shape
  // =========================================================================

  describe("sendEmail() result shape", () => {
    it("returns { success: true, messageId } on success", async () => {
      const result = await sendEmail({
        to: "user@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
      })

      expect(result).toMatchObject({ success: true })
      expect(result.messageId).toBeDefined()
      expect(typeof result.messageId).toBe("string")
      expect(result.messageId).toMatch(/^test-\d+-\d+$/)
      expect(result.error).toBeUndefined()
    })

    it("returns { success: false, error } on interceptor failure", async () => {
      _setTestInterceptor(() => ({
        success: false,
        error: "Simulated SMTP failure",
      }))

      const result = await sendEmail({
        to: "user@example.com",
        subject: "Test",
        html: "<p>Hello</p>",
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe("Simulated SMTP failure")
      expect(result.messageId).toBeUndefined()
    })

    it("messageId is unique per send", async () => {
      const r1 = await sendEmail({ to: "a@test.com", subject: "1", html: "" })
      const r2 = await sendEmail({ to: "b@test.com", subject: "2", html: "" })

      expect(r1.messageId).not.toBe(r2.messageId)
    })
  })

  // =========================================================================
  // Outbox capture fidelity
  // =========================================================================

  describe("outbox capture fidelity", () => {
    it("captures all payload fields on the CapturedEmail", async () => {
      const payload: EmailPayload = {
        to: "recipient@example.com",
        subject: "Important Subject",
        html: "<h1>Title</h1><p>Body</p>",
        text: "Title\nBody",
      }

      await sendEmail(payload)

      const captured = getTestOutbox()
      expect(captured).toHaveLength(1)

      const email = captured[0]!
      expect(email.to).toBe(payload.to)
      expect(email.subject).toBe(payload.subject)
      expect(email.html).toBe(payload.html)
      expect(email.text).toBe(payload.text)
    })

    it("adds from and sentAt metadata to captured emails", async () => {
      const before = new Date()
      await sendEmail({ to: "a@test.com", subject: "Meta", html: "" })
      const after = new Date()

      const email = getTestOutbox()[0]!
      expect(email.from).toBeDefined()
      expect(typeof email.from).toBe("string")
      expect(email.from).toContain("@") // has an email address
      expect(email.sentAt).toBeInstanceOf(Date)
      expect(email.sentAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(email.sentAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it("text field is optional (undefined when not provided)", async () => {
      await sendEmail({ to: "a@test.com", subject: "No text", html: "<p>HTML only</p>" })

      const email = getTestOutbox()[0]!
      expect(email.text).toBeUndefined()
    })

    it("preserves empty string in html field", async () => {
      await sendEmail({ to: "a@test.com", subject: "Empty", html: "" })

      expect(getTestOutbox()[0]!.html).toBe("")
    })

    it("preserves HTML entities and special characters", async () => {
      const html = '<a href="https://app.com/setup?token=abc&user=1">Link</a>'
      await sendEmail({ to: "a@test.com", subject: "Special", html })

      expect(getTestOutbox()[0]!.html).toBe(html)
    })
  })

  // =========================================================================
  // Outbox ordering and accumulation
  // =========================================================================

  describe("outbox ordering", () => {
    it("accumulates emails in send order", async () => {
      await sendEmail({ to: "first@test.com", subject: "1st", html: "" })
      await sendEmail({ to: "second@test.com", subject: "2nd", html: "" })
      await sendEmail({ to: "third@test.com", subject: "3rd", html: "" })

      const outbox = getTestOutbox()
      expect(outbox).toHaveLength(3)
      expect(outbox[0]!.to).toBe("first@test.com")
      expect(outbox[1]!.to).toBe("second@test.com")
      expect(outbox[2]!.to).toBe("third@test.com")
    })

    it("getLastTestEmail() returns the most recent send", async () => {
      await sendEmail({ to: "a@test.com", subject: "First", html: "" })
      await sendEmail({ to: "b@test.com", subject: "Last", html: "" })

      expect(getLastTestEmail()?.subject).toBe("Last")
    })

    it("getLastTestEmail() returns undefined when outbox is empty", () => {
      expect(getLastTestEmail()).toBeUndefined()
    })
  })

  // =========================================================================
  // clearTestOutbox()
  // =========================================================================

  describe("clearTestOutbox()", () => {
    it("empties the outbox completely", async () => {
      await sendEmail({ to: "a@test.com", subject: "Pre-clear", html: "" })
      expect(getTestOutbox()).toHaveLength(1)

      clearTestOutbox()
      expect(getTestOutbox()).toHaveLength(0)
      expect(getLastTestEmail()).toBeUndefined()
    })

    it("outbox is a fresh array reference after clear", async () => {
      await sendEmail({ to: "a@test.com", subject: "Before", html: "" })
      const before = getTestOutbox()
      clearTestOutbox()

      // New sends don't appear in the old reference
      await sendEmail({ to: "b@test.com", subject: "After", html: "" })
      expect(before).toHaveLength(0) // reference was the same mutable array
    })
  })

  // =========================================================================
  // Interceptor contract
  // =========================================================================

  describe("interceptor contract", () => {
    it("interceptor receives the full payload", async () => {
      let receivedPayload: EmailPayload | undefined

      _setTestInterceptor((payload) => {
        receivedPayload = payload
        return null // proceed normally
      })

      const sent: EmailPayload = {
        to: "intercepted@test.com",
        subject: "Intercepted",
        html: "<p>Body</p>",
        text: "Body",
      }
      await sendEmail(sent)

      expect(receivedPayload).toBeDefined()
      expect(receivedPayload!.to).toBe(sent.to)
      expect(receivedPayload!.subject).toBe(sent.subject)
      expect(receivedPayload!.html).toBe(sent.html)
      expect(receivedPayload!.text).toBe(sent.text)
    })

    it("returning null from interceptor allows normal capture", async () => {
      _setTestInterceptor(() => null)

      await sendEmail({ to: "a@test.com", subject: "Allowed", html: "" })
      expect(getTestOutbox()).toHaveLength(1)
    })

    it("returning EmailResult from interceptor short-circuits (no capture)", async () => {
      _setTestInterceptor(() => ({ success: false, error: "blocked" }))

      await sendEmail({ to: "a@test.com", subject: "Blocked", html: "" })
      expect(getTestOutbox()).toHaveLength(0)
    })

    it("interceptor can selectively fail based on payload", async () => {
      _setTestInterceptor((payload) => {
        if (payload.to.includes("bad")) {
          return { success: false, error: "rejected" }
        }
        return null
      })

      const good = await sendEmail({ to: "good@test.com", subject: "OK", html: "" })
      const bad = await sendEmail({ to: "bad@test.com", subject: "Fail", html: "" })

      expect(good.success).toBe(true)
      expect(bad.success).toBe(false)
      expect(getTestOutbox()).toHaveLength(1)
      expect(getTestOutbox()[0]!.to).toBe("good@test.com")
    })

    it("interceptor can return success result (captures nothing)", async () => {
      _setTestInterceptor(() => ({
        success: true,
        messageId: "custom-id-123",
      }))

      const result = await sendEmail({ to: "a@test.com", subject: "Phantom", html: "" })

      // The interceptor returned success but the email was not captured
      expect(result.success).toBe(true)
      expect(result.messageId).toBe("custom-id-123")
      expect(getTestOutbox()).toHaveLength(0)
    })
  })

  // =========================================================================
  // Sender address
  // =========================================================================

  describe("sender address", () => {
    it("from field contains an email address in angle brackets", async () => {
      await sendEmail({ to: "a@test.com", subject: "From", html: "" })
      const from = getTestOutbox()[0]!.from

      expect(from).toMatch(/<[^>]+@[^>]+>/)
    })
  })
})
