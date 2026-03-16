/**
 * Email service abstraction for the HR Dashboard.
 *
 * Provides a single `sendEmail` function that routes through:
 * - Production: SMTP via nodemailer (lazy-init, validated on first send)
 * - Development: Console preview when SMTP is not configured
 * - Test: In-memory capture via `getTestOutbox()` / `clearTestOutbox()`
 *
 * Bead: hr-redu
 */

import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface CapturedEmail extends EmailPayload {
  from: string
  sentAt: Date
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

function isTestEnv(): boolean {
  // Never allow test-mode behavior in production, even if VITEST is mis-set.
  if (process.env.NODE_ENV === 'production') {
    return false
  }
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
}

function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    senderEmail: process.env.SENDER_EMAIL,
    senderName: process.env.SENDER_NAME,
    appUrl: process.env.APP_URL,
  }
}

function isSmtpConfigured(): boolean {
  const cfg = getSmtpConfig()
  return !!(cfg.host && cfg.senderEmail)
}

// ---------------------------------------------------------------------------
// Test outbox (in-memory capture for integration/E2E)
// ---------------------------------------------------------------------------

const testOutbox: CapturedEmail[] = []

export function getTestOutbox(): readonly CapturedEmail[] {
  return testOutbox
}

export function clearTestOutbox(): void {
  testOutbox.length = 0
}

export function getLastTestEmail(): CapturedEmail | undefined {
  return testOutbox[testOutbox.length - 1]
}

// ---------------------------------------------------------------------------
// SMTP transport (lazy singleton)
// ---------------------------------------------------------------------------

let smtpTransport: Transporter | null = null
let smtpValidated = false

function getOrCreateTransport(): Transporter {
  if (smtpTransport) return smtpTransport

  const cfg = getSmtpConfig()

  const missing: string[] = []
  if (!cfg.host) missing.push('SMTP_HOST')
  if (!cfg.senderEmail) missing.push('SENDER_EMAIL')

  if (missing.length > 0) {
    throw new Error(
      `Email send failed: missing required env vars: ${missing.join(', ')}. ` +
      'Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SENDER_EMAIL, and SENDER_NAME for production email delivery.'
    )
  }

  smtpTransport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port || 587,
    secure: cfg.port === 465,
    auth: cfg.user
      ? { user: cfg.user, pass: cfg.pass }
      : undefined,
  })

  return smtpTransport
}

async function validateTransportOnce(transport: Transporter): Promise<void> {
  if (smtpValidated) return
  try {
    await transport.verify()
    smtpValidated = true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`SMTP connection verification failed: ${message}`)
  }
}

// ---------------------------------------------------------------------------
// Sender address
// ---------------------------------------------------------------------------

function getSenderAddress(): string {
  const cfg = getSmtpConfig()
  // Strip CR/LF, quotes, and backslashes to prevent RFC 5322 header injection.
  const name = (cfg.senderName || 'HR Dashboard').replace(/[\r\n"\\]/g, '')
  const email = cfg.senderEmail || 'noreply@example.com'
  return `"${name}" <${email}>`
}

// ---------------------------------------------------------------------------
// Dev console preview (redacted — never shows tokens/passwords)
// ---------------------------------------------------------------------------

function logDevPreview(payload: EmailPayload): void {
  const from = getSenderAddress()
  console.log(
    '\n' +
    '╭──────────────────────────────────────╮\n' +
    '│  📧 Email Preview (SMTP not configured) │\n' +
    '╰──────────────────────────────────────╯\n' +
    `  From:    ${from}\n` +
    `  To:      ${payload.to}\n` +
    `  Subject: ${payload.subject}\n` +
    `  Body:    [${payload.html.length} chars HTML` +
      (payload.text ? `, ${payload.text.length} chars text` : '') +
    ']\n'
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  // --- Test mode: capture to in-memory outbox ---
  if (isTestEnv()) {
    const captured: CapturedEmail = {
      ...payload,
      from: getSenderAddress(),
      sentAt: new Date(),
    }
    testOutbox.push(captured)
    return { success: true, messageId: `test-${Date.now()}-${testOutbox.length}` }
  }

  // --- Dev mode without SMTP: log preview and report failure ---
  if (!isSmtpConfigured()) {
    logDevPreview(payload)
    return {
      success: false,
      error:
        'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SENDER_EMAIL environment variables to enable email delivery.',
    }
  }

  // --- Production: send via SMTP ---
  try {
    const transport = getOrCreateTransport()
    await validateTransportOnce(transport)

    const info = await transport.sendMail({
      from: getSenderAddress(),
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    })

    return { success: true, messageId: info.messageId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Reset (for testing transport teardown)
// ---------------------------------------------------------------------------

export function _resetTransport(): void {
  if (smtpTransport) {
    smtpTransport.close()
    smtpTransport = null
  }
  smtpValidated = false
}
