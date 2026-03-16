/**
 * Unit Tests: Email Templates
 *
 * Covers: buildInviteEmail, buildResetEmail — pure function output validation
 *
 * Bead: hr-2wur
 */

import { describe, expect, it } from 'vitest'

import {
  buildInviteEmail,
  buildResetEmail,
  type InviteEmailParams,
  type ResetEmailParams,
} from '@/lib/email-templates'

// ---------------------------------------------------------------------------
// buildInviteEmail
// ---------------------------------------------------------------------------

describe('buildInviteEmail', () => {
  const baseParams: InviteEmailParams = {
    recipientName: 'Jane Doe',
    setupUrl: 'https://app.example.com/set-password?token=abc123',
  }

  it('returns subject, html, and text', () => {
    const result = buildInviteEmail(baseParams)
    expect(result.subject).toBeTruthy()
    expect(result.html).toBeTruthy()
    expect(result.text).toBeTruthy()
  })

  it('subject mentions app name', () => {
    const result = buildInviteEmail(baseParams)
    expect(result.subject).toContain('HR Dashboard')
  })

  it('subject uses custom app name', () => {
    const result = buildInviteEmail({ ...baseParams, appName: 'Acme HR' })
    expect(result.subject).toContain('Acme HR')
    expect(result.subject).not.toContain('HR Dashboard')
  })

  it('html contains setup URL', () => {
    const result = buildInviteEmail(baseParams)
    expect(result.html).toContain(baseParams.setupUrl)
  })

  it('text contains setup URL', () => {
    const result = buildInviteEmail(baseParams)
    expect(result.text).toContain(baseParams.setupUrl)
  })

  it('html contains recipient name', () => {
    const result = buildInviteEmail(baseParams)
    expect(result.html).toContain('Jane Doe')
  })

  it('text contains recipient name', () => {
    const result = buildInviteEmail(baseParams)
    expect(result.text).toContain('Jane Doe')
  })

  it('includes sender name when provided', () => {
    const result = buildInviteEmail({ ...baseParams, senderName: 'Admin User' })
    expect(result.html).toContain('Admin User has invited you')
    expect(result.text).toContain('Admin User has invited you')
  })

  it('uses generic invitation when no sender name', () => {
    const result = buildInviteEmail(baseParams)
    expect(result.html).toContain('You have been invited')
    expect(result.text).toContain('You have been invited')
  })

  it('mentions 24 hour expiry', () => {
    const result = buildInviteEmail(baseParams)
    expect(result.html).toContain('24 hours')
    expect(result.text).toContain('24 hours')
  })

  it('html escapes special characters in recipient name', () => {
    const result = buildInviteEmail({
      ...baseParams,
      recipientName: 'Jane <script>alert("xss")</script>',
    })
    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })

  it('html is a complete document with doctype', () => {
    const result = buildInviteEmail(baseParams)
    expect(result.html).toMatch(/^<!DOCTYPE html>/)
    expect(result.html).toContain('</html>')
  })

  it('html contains CTA button', () => {
    const result = buildInviteEmail(baseParams)
    expect(result.html).toContain('Set Up Your Password')
    expect(result.html).toContain('class="cta"')
  })
})

// ---------------------------------------------------------------------------
// buildResetEmail
// ---------------------------------------------------------------------------

describe('buildResetEmail', () => {
  const baseParams: ResetEmailParams = {
    recipientName: 'John Smith',
    resetUrl: 'https://app.example.com/set-password?token=xyz789',
  }

  it('returns subject, html, and text', () => {
    const result = buildResetEmail(baseParams)
    expect(result.subject).toBeTruthy()
    expect(result.html).toBeTruthy()
    expect(result.text).toBeTruthy()
  })

  it('subject mentions password reset', () => {
    const result = buildResetEmail(baseParams)
    expect(result.subject).toContain('Reset')
    expect(result.subject).toContain('password')
  })

  it('subject uses custom app name', () => {
    const result = buildResetEmail({ ...baseParams, appName: 'Acme HR' })
    expect(result.subject).toContain('Acme HR')
  })

  it('html contains reset URL', () => {
    const result = buildResetEmail(baseParams)
    expect(result.html).toContain(baseParams.resetUrl)
  })

  it('text contains reset URL', () => {
    const result = buildResetEmail(baseParams)
    expect(result.text).toContain(baseParams.resetUrl)
  })

  it('html contains recipient name', () => {
    const result = buildResetEmail(baseParams)
    expect(result.html).toContain('John Smith')
  })

  it('mentions 24 hour expiry', () => {
    const result = buildResetEmail(baseParams)
    expect(result.html).toContain('24 hours')
    expect(result.text).toContain('24 hours')
  })

  it('mentions safe to ignore if not requested', () => {
    const result = buildResetEmail(baseParams)
    expect(result.html).toContain('did not request')
    expect(result.text).toContain('did not request')
  })

  it('html escapes special characters in recipient name', () => {
    const result = buildResetEmail({
      ...baseParams,
      recipientName: 'John <img onerror="alert(1)">',
    })
    expect(result.html).not.toContain('<img')
    expect(result.html).toContain('&lt;img')
  })

  it('html contains CTA button', () => {
    const result = buildResetEmail(baseParams)
    expect(result.html).toContain('Reset Your Password')
    expect(result.html).toContain('class="cta"')
  })

  it('html is a complete document', () => {
    const result = buildResetEmail(baseParams)
    expect(result.html).toMatch(/^<!DOCTYPE html>/)
    expect(result.html).toContain('</html>')
  })
})
