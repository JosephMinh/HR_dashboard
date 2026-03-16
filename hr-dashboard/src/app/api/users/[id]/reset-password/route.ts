import crypto from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'

import { auth } from '@/lib/auth'
import { getClientIp, logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { buildResetEmail } from '@/lib/email-templates'
import { buildSetPasswordUrl, issueSetPasswordToken } from '@/lib/password-setup-tokens'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/permissions'
import { isValidUUID } from '@/lib/validations'
import { enforceRouteRateLimit } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/users/:id/reset-password — admin-initiated password reset.
 * Issues a set-password token, sends a reset email, and only invalidates
 * the existing password after the email is successfully delivered.
 * Requires MANAGE_USERS permission.
 * Rate limited: 5 resets per 15 minutes per admin.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rate limit: 5 resets per 15 minutes per admin
  const rateLimitResult = await enforceRouteRateLimit(
    `password-reset:${session.user.id}`,
    { limit: 5, windowMs: 15 * 60 * 1000 }
  )
  if (rateLimitResult) {
    return rateLimitResult
  }

  const { id } = await params

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, active: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!user.active) {
    return NextResponse.json({ error: 'Cannot reset password for an inactive user' }, { status: 400 })
  }

  // Issue a set-password token (does not modify the password yet)
  const passwordSetup = await issueSetPasswordToken({ userId: id })

  // Build and send the reset email
  const setupUrl = buildSetPasswordUrl(passwordSetup.token)
  const emailPayload = buildResetEmail({
    recipientName: user.name,
    resetUrl: setupUrl,
  })

  const emailResult = await sendEmail({
    to: user.email,
    subject: emailPayload.subject,
    html: emailPayload.html,
    text: emailPayload.text,
  })

  if (!emailResult.success) {
    // Email failed — leave existing credentials untouched
    return NextResponse.json(
      { error: 'Password reset email could not be sent. The existing password remains unchanged.', emailError: emailResult.error },
      { status: 502 }
    )
  }

  // Email sent successfully — now invalidate the old password
  const placeholderHash = await hash(crypto.randomBytes(32).toString('hex'), 10)
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: placeholderHash,
      mustChangePassword: true,
    },
  })

  await logAudit({
    userId: session.user.id,
    action: 'USER_PASSWORD_RESET',
    entityType: 'User',
    entityId: id,
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true })
}
