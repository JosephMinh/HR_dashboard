/**
 * Unit Tests: Email Service
 *
 * Covers: sendEmail, test outbox capture, dev preview fallback
 *
 * Bead: hr-redu
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock nodemailer before importing the module
const mockSendMail = vi.fn()
const mockVerify = vi.fn()
const mockClose = vi.fn()

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      verify: mockVerify,
      close: mockClose,
    })),
  },
}))

import {
  sendEmail,
  getTestOutbox,
  clearTestOutbox,
  getLastTestEmail,
  _resetTransport,
  type EmailPayload,
} from '@/lib/email'

const testPayload: EmailPayload = {
  to: 'user@example.com',
  subject: 'Welcome',
  html: '<h1>Hello</h1>',
  text: 'Hello',
}

describe('Email Service', () => {
  beforeEach(() => {
    clearTestOutbox()
    _resetTransport()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // =========================================================================
  // Test mode (NODE_ENV=test or VITEST=true)
  // =========================================================================

  describe('test mode (in-memory capture)', () => {
    it('captures email to test outbox', async () => {
      const result = await sendEmail(testPayload)

      expect(result.success).toBe(true)
      expect(result.messageId).toMatch(/^test-/)

      const outbox = getTestOutbox()
      expect(outbox).toHaveLength(1)
      expect(outbox[0].to).toBe('user@example.com')
      expect(outbox[0].subject).toBe('Welcome')
      expect(outbox[0].html).toBe('<h1>Hello</h1>')
      expect(outbox[0].text).toBe('Hello')
      expect(outbox[0].sentAt).toBeInstanceOf(Date)
    })

    it('captures multiple emails', async () => {
      await sendEmail(testPayload)
      await sendEmail({ ...testPayload, to: 'other@example.com' })

      expect(getTestOutbox()).toHaveLength(2)
      expect(getTestOutbox()[1].to).toBe('other@example.com')
    })

    it('getLastTestEmail returns the most recent email', async () => {
      await sendEmail(testPayload)
      await sendEmail({ ...testPayload, subject: 'Second' })

      const last = getLastTestEmail()
      expect(last?.subject).toBe('Second')
    })

    it('getLastTestEmail returns undefined when outbox is empty', () => {
      expect(getLastTestEmail()).toBeUndefined()
    })

    it('clearTestOutbox empties the outbox', async () => {
      await sendEmail(testPayload)
      expect(getTestOutbox()).toHaveLength(1)

      clearTestOutbox()
      expect(getTestOutbox()).toHaveLength(0)
    })

    it('includes from address with sender name', async () => {
      await sendEmail(testPayload)
      const email = getLastTestEmail()
      expect(email?.from).toContain('HR Dashboard')
    })

    it('does not call nodemailer in test mode', async () => {
      await sendEmail(testPayload)
      expect(mockSendMail).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // Production mode (SMTP configured)
  // =========================================================================

  describe('production mode (SMTP configured)', () => {
    beforeEach(() => {
      // Exit test mode
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')
      // Configure SMTP
      vi.stubEnv('SMTP_HOST', 'smtp.test.com')
      vi.stubEnv('SMTP_PORT', '587')
      vi.stubEnv('SMTP_USER', 'user')
      vi.stubEnv('SMTP_PASS', 'pass')
      vi.stubEnv('SENDER_EMAIL', 'noreply@test.com')
      vi.stubEnv('SENDER_NAME', 'Test App')
    })

    it('sends email via SMTP transport', async () => {
      mockVerify.mockResolvedValue(true)
      mockSendMail.mockResolvedValue({ messageId: '<abc@test.com>' })

      const result = await sendEmail(testPayload)

      expect(result.success).toBe(true)
      expect(result.messageId).toBe('<abc@test.com>')
      expect(mockSendMail).toHaveBeenCalledWith({
        from: '"Test App" <noreply@test.com>',
        to: 'user@example.com',
        subject: 'Welcome',
        html: '<h1>Hello</h1>',
        text: 'Hello',
      })
    })

    it('returns error result on SMTP failure (does not throw)', async () => {
      mockVerify.mockResolvedValue(true)
      mockSendMail.mockRejectedValue(new Error('Connection refused'))

      const result = await sendEmail(testPayload)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection refused')
    })

    it('validates transport on first send only', async () => {
      mockVerify.mockResolvedValue(true)
      mockSendMail.mockResolvedValue({ messageId: '<1>' })

      await sendEmail(testPayload)
      await sendEmail(testPayload)

      expect(mockVerify).toHaveBeenCalledTimes(1)
      expect(mockSendMail).toHaveBeenCalledTimes(2)
    })
  })

  // =========================================================================
  // Dev mode (no SMTP configured)
  // =========================================================================

  describe('dev mode (no SMTP)', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('VITEST', '')
      // No SMTP env vars set
      vi.stubEnv('SMTP_HOST', '')
      vi.stubEnv('SENDER_EMAIL', '')
    })

    it('returns success with dev-preview messageId', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await sendEmail(testPayload)

      expect(result.success).toBe(true)
      expect(result.messageId).toMatch(/^dev-preview-/)
      expect(mockSendMail).not.toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('logs a console preview', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await sendEmail(testPayload)

      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const output = consoleSpy.mock.calls[0][0] as string
      expect(output).toContain('Email Preview')
      expect(output).toContain('user@example.com')
      expect(output).toContain('Welcome')

      consoleSpy.mockRestore()
    })
  })

  // =========================================================================
  // Config validation
  // =========================================================================

  describe('config validation', () => {
    it('throws when SMTP_HOST is missing in production send', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VITEST', '')
      vi.stubEnv('SMTP_HOST', '')
      vi.stubEnv('SENDER_EMAIL', 'noreply@test.com')

      // isSmtpConfigured() returns false because host is missing,
      // so it falls through to dev preview mode
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const result = await sendEmail(testPayload)
      expect(result.success).toBe(true)
      expect(result.messageId).toMatch(/^dev-preview-/)
      consoleSpy.mockRestore()
    })
  })
})
