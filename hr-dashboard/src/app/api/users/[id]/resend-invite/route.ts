import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { getClientIp, logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { buildInviteEmail } from '@/lib/email-templates'
import { buildSetPasswordUrl, hashSetPasswordToken, issueSetPasswordToken } from '@/lib/password-setup-tokens'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/permissions'
import { isValidUUID } from '@/lib/validations'
import { enforceRouteRateLimit } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string }>
}

async function rollbackIssuedToken(params: {
  userId: string
  issuedToken: string
  previousTokenIds: string[]
  restorePreviousTokens?: boolean
}) {
  const rollbackAt = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.setPasswordToken.updateMany({
      where: {
        userId: params.userId,
        tokenHash: hashSetPasswordToken(params.issuedToken),
        usedAt: null,
      },
      data: {
        usedAt: rollbackAt,
      },
    })

    if (!params.restorePreviousTokens || params.previousTokenIds.length === 0) {
      return
    }

    await tx.setPasswordToken.updateMany({
      where: {
        id: { in: params.previousTokenIds },
        userId: params.userId,
        expiresAt: { gt: rollbackAt },
      },
      data: {
        usedAt: null,
      },
    })
  })
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

  // Capture currently active tokens in the same transaction that issues the
  // replacement so we can restore them if email delivery fails.
  const { passwordSetup, previousTokenIds } = await prisma.$transaction(async (tx) => {
    const previousTokens = await tx.setPasswordToken.findMany({
      where: {
        userId: id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
      },
    })

    const issuedToken = await issueSetPasswordToken({ userId: id, tx })

    return {
      passwordSetup: issuedToken,
      previousTokenIds: previousTokens.map((token) => token.id),
    }
  })

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
    const currentUser = await prisma.user.findUnique({
      where: { id },
      select: { active: true, mustChangePassword: true },
    })

    await rollbackIssuedToken({
      userId: id,
      issuedToken: passwordSetup.token,
      previousTokenIds,
      restorePreviousTokens: !!currentUser && currentUser.active && currentUser.mustChangePassword,
    })
    console.error(`[resend-invite] Email delivery failed for user ${id}:`, emailResult.error)
    return NextResponse.json(
      { error: 'Invite email could not be sent. Please try again later.' },
      { status: 502 }
    )
  }

  const currentUser = await prisma.user.findUnique({
    where: { id },
    select: { active: true, mustChangePassword: true },
  })

  if (!currentUser) {
    await rollbackIssuedToken({
      userId: id,
      issuedToken: passwordSetup.token,
      previousTokenIds: [],
    })
    return NextResponse.json(
      { error: 'User no longer exists' },
      { status: 409 }
    )
  }

  if (!currentUser.active) {
    await rollbackIssuedToken({
      userId: id,
      issuedToken: passwordSetup.token,
      previousTokenIds: [],
    })
    return NextResponse.json(
      { error: 'User was deactivated during invite resend' },
      { status: 409 }
    )
  }

  if (!currentUser.mustChangePassword) {
    await rollbackIssuedToken({
      userId: id,
      issuedToken: passwordSetup.token,
      previousTokenIds: [],
    })
    return NextResponse.json(
      { error: 'User completed onboarding during invite resend' },
      { status: 409 }
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
