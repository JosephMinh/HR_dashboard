/**
 * Email templates for the HR Dashboard.
 *
 * Pure functions that produce { subject, html, text } payloads for
 * invite and password-reset emails. No side effects — easy to test.
 *
 * Bead: hr-2wur
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailTemplatePayload {
  subject: string
  html: string
  text: string
}

export interface InviteEmailParams {
  recipientName: string
  setupUrl: string
  senderName?: string
  appName?: string
}

export interface ResetEmailParams {
  recipientName: string
  resetUrl: string
  appName?: string
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DEFAULT_APP_NAME = 'HR Dashboard'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function wrapHtml(body: string, preheader: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(preheader)}</title>
<style>
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; color: #18181b; }
  .container { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; border: 1px solid #e4e4e7; overflow: hidden; }
  .header { background: #18181b; padding: 24px 32px; }
  .header h1 { margin: 0; color: #ffffff; font-size: 18px; font-weight: 600; }
  .body { padding: 32px; }
  .body p { margin: 0 0 16px; line-height: 1.6; font-size: 15px; }
  .cta { display: inline-block; padding: 12px 24px; background: #18181b; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px; }
  .cta:hover { background: #27272a; }
  .footer { padding: 16px 32px; background: #fafafa; border-top: 1px solid #e4e4e7; font-size: 13px; color: #71717a; line-height: 1.5; }
  .link-fallback { word-break: break-all; font-size: 13px; color: #71717a; }
</style>
</head>
<body>
<div class="container">
${body}
</div>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Invite email (new user onboarding)
// ---------------------------------------------------------------------------

export function buildInviteEmail(params: InviteEmailParams): EmailTemplatePayload {
  const appName = params.appName || DEFAULT_APP_NAME
  const senderLabel = params.senderName
    ? `${params.senderName} has invited you`
    : 'You have been invited'

  const subject = `You're invited to ${appName}`

  const html = wrapHtml(
    `<div class="header"><h1>${escapeHtml(appName)}</h1></div>
<div class="body">
  <p>Hi ${escapeHtml(params.recipientName)},</p>
  <p>${escapeHtml(senderLabel)} to join <strong>${escapeHtml(appName)}</strong>. Set up your password to get started.</p>
  <p style="text-align: center; margin: 24px 0;">
    <a class="cta" href="${escapeHtml(params.setupUrl)}">Set Up Your Password</a>
  </p>
  <p class="link-fallback">If the button doesn't work, copy and paste this link into your browser:<br>${escapeHtml(params.setupUrl)}</p>
  <p>This link expires in 24 hours. If it expires, ask your administrator to resend the invitation.</p>
</div>
<div class="footer">
  This email was sent by ${escapeHtml(appName)}. If you did not expect this invitation, you can safely ignore this email.
</div>`,
    subject,
  )

  const text = [
    `Hi ${params.recipientName},`,
    '',
    `${senderLabel} to join ${appName}. Set up your password to get started.`,
    '',
    `Set up your password: ${params.setupUrl}`,
    '',
    'This link expires in 24 hours. If it expires, ask your administrator to resend the invitation.',
    '',
    `---`,
    `This email was sent by ${appName}. If you did not expect this invitation, you can safely ignore this email.`,
  ].join('\n')

  return { subject, html, text }
}

// ---------------------------------------------------------------------------
// Password reset email
// ---------------------------------------------------------------------------

export function buildResetEmail(params: ResetEmailParams): EmailTemplatePayload {
  const appName = params.appName || DEFAULT_APP_NAME

  const subject = `Reset your ${appName} password`

  const html = wrapHtml(
    `<div class="header"><h1>${escapeHtml(appName)}</h1></div>
<div class="body">
  <p>Hi ${escapeHtml(params.recipientName)},</p>
  <p>A password reset was requested for your <strong>${escapeHtml(appName)}</strong> account. Click below to choose a new password.</p>
  <p style="text-align: center; margin: 24px 0;">
    <a class="cta" href="${escapeHtml(params.resetUrl)}">Reset Your Password</a>
  </p>
  <p class="link-fallback">If the button doesn't work, copy and paste this link into your browser:<br>${escapeHtml(params.resetUrl)}</p>
  <p>This link expires in 24 hours. If you did not request a password reset, you can safely ignore this email.</p>
</div>
<div class="footer">
  This email was sent by ${escapeHtml(appName)}. If you did not request this reset, no action is needed.
</div>`,
    subject,
  )

  const text = [
    `Hi ${params.recipientName},`,
    '',
    `A password reset was requested for your ${appName} account. Click the link below to choose a new password.`,
    '',
    `Reset your password: ${params.resetUrl}`,
    '',
    'This link expires in 24 hours. If you did not request a password reset, you can safely ignore this email.',
    '',
    `---`,
    `This email was sent by ${appName}. If you did not request this reset, no action is needed.`,
  ].join('\n')

  return { subject, html, text }
}
