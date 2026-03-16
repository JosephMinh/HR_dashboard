import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { getClientIp, logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { buildInviteEmail } from '@/lib/email-templates'
import { buildSetPasswordUrl, issueSetPasswordToken } from '@/lib/password-setup-tokens'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/permissions'
import { isValidUUID } from '@/lib/validations'
import { enforceRouteRateLimit } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/users/:id/resend-invite — resend the onboarding invite email.
 * Issues a fresh set-password token (invalidating prior unused tokens)
 * and sends the invite email. Only allowed for users who have not yet
 * completed onboarding (mustChangePassword=true).
 * Requires MANAGE_USERS permission.
 * Rate limited: 5 resends per 15 minutes per admin.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rate limit: 5 resends per 15 minutes per admin
  const rateLimitResult = await enforceRouteRateLimit(
    `resend-invite:${session.user.id}`,
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
    select: { id: true, name: true, email: true, active: true, mustChangePassword: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!user.active) {
    return NextResponse.json({ error: 'Cannot resend invite for an inactive user' }, { status: 400 })
  }

  if (!user.mustChangePassword) {
    return NextResponse.json({ error: 'User has already completed onboarding' }, { status: 409 })
  }

  // Issue a fresh token (invalidates any prior unused tokens)
  const passwordSetup = await issueSetPasswordToken({ userId: id })

  // Send the invite email
  const setupUrl = buildSetPasswordUrl(passwordSetup.token)
  const emailPayload = buildInviteEmail({
    recipientName: user.name,
    setupUrl,
    senderName: session.user.name ?? undefined,
  })

  const emailResult = await sendEmail({
    to: user.email,
    subject: emailPayload.subject,
    html: emailPayload.html,
    text: emailPayload.text,
  })

  if (!emailResult.success) {
    return NextResponse.json(
      { error: 'Invite email could not be sent. Please try again later.', emailError: emailResult.error },
      { status: 502 }
    )
  }

  await logAudit({
    userId: session.user.id,
    action: 'USER_INVITE_RESENT',
    entityType: 'User',
    entityId: id,
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true })
}
