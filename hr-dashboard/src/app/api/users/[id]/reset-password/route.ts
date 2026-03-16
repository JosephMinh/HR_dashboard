import crypto from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'

import { auth } from '@/lib/auth'
import { getClientIp, logAudit } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { buildResetEmail } from '@/lib/email-templates'
import { buildSetPasswordUrl, hashSetPasswordToken, issueSetPasswordToken } from '@/lib/password-setup-tokens'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/permissions'
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
    const currentUser = await prisma.user.findUnique({
      where: { id },
      select: { active: true },
    })

    await rollbackIssuedToken({
      userId: id,
      issuedToken: passwordSetup.token,
      previousTokenIds,
      restorePreviousTokens: !!currentUser && currentUser.active,
    })
    // Email failed — leave existing credentials untouched
    console.error(`[reset-password] Email delivery failed for user ${id}:`, emailResult.error)
    return NextResponse.json(
      { error: 'Password reset email could not be sent. The existing password remains unchanged.' },
      { status: 502 }
    )
  }

  // Email sent successfully — now invalidate the old password.
  // Re-check active status to guard against concurrent deactivation.
  const placeholderHash = await hash(crypto.randomBytes(32).toString('hex'), 10)
  const updateResult = await prisma.user.updateMany({
    where: { id, active: true },
    data: {
      passwordHash: placeholderHash,
      mustChangePassword: true,
    },
  })

  if (updateResult.count === 0) {
    await rollbackIssuedToken({
      userId: id,
      issuedToken: passwordSetup.token,
      previousTokenIds: [],
    })
    return NextResponse.json(
      { error: 'User was deactivated during the reset process' },
      { status: 409 }
    )
  }

  await logAudit({
    userId: session.user.id,
    action: 'USER_PASSWORD_RESET',
    entityType: 'User',
    entityId: id,
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true })
}
