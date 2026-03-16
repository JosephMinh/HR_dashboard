import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'

import { auth } from '@/lib/auth'
import { getClientIp, logAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/permissions'
import { isValidUUID, generateTempPassword } from '@/lib/validations'
import { enforceRouteRateLimit } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/users/:id/reset-password — admin reset of user password.
 * Generates a new temp password and sets mustChangePassword=true.
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
    select: { id: true, active: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!user.active) {
    return NextResponse.json({ error: 'Cannot reset password for an inactive user' }, { status: 400 })
  }

  // Generate temp password and hash
  const tempPassword = generateTempPassword()
  const passwordHash = await hash(tempPassword, 10)

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash,
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

  return NextResponse.json({ tempPassword })
}
