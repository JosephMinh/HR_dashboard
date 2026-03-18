import crypto from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'

import { auth } from '@/lib/auth'
import { getClientIp, logAuditCreate } from '@/lib/audit'
import { sendEmail } from '@/lib/email'
import { buildInviteEmail } from '@/lib/email-templates'
import { buildSetPasswordUrl, issueSetPasswordToken } from '@/lib/password-setup-tokens'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/permissions'
import { isValidEmail } from '@/lib/validations'
import { UserRole } from '@/generated/prisma/client'
import type { Prisma } from '@/generated/prisma/client'

const VALID_ROLES = Object.values(UserRole) as string[]
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

export const dynamic = 'force-dynamic'

/**
 * GET /api/users — list users with pagination + search.
 * Requires MANAGE_USERS permission.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)

  // Parse pagination
  const pageParam = searchParams.get('page')
  let page = 1
  if (pageParam !== null) {
    const parsed = parseInt(pageParam, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      return NextResponse.json({ error: 'Invalid page parameter: must be a positive integer' }, { status: 400 })
    }
    page = parsed
  }

  const pageSizeParam = searchParams.get('pageSize')
  let pageSize = 20
  if (pageSizeParam !== null) {
    const parsed = parseInt(pageSizeParam, 10)
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
      return NextResponse.json({ error: 'Invalid pageSize parameter: must be between 1 and 100' }, { status: 400 })
    }
    pageSize = parsed
  }

  // Search: matches name OR email, case-insensitive
  const search = searchParams.get('search')?.slice(0, 200) ?? null

  // Filter: ?active=true|false|all (default true)
  const activeParam = searchParams.get('active') ?? 'true'

  // Build where clause
  const where: Prisma.UserWhereInput = {}

  if (activeParam === 'true') {
    where.active = true
  } else if (activeParam === 'false') {
    where.active = false
  }
  // 'all' = no active filter

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  const total = await prisma.user.count({ where })
  const totalPages = Math.ceil(total / pageSize)
  const skip = (page - 1) * pageSize

  const users = await prisma.user.findMany({
    where,
    orderBy: [
      { active: 'desc' },
      { updatedAt: 'desc' },
      { id: 'asc' },
    ],
    skip,
    take: pageSize,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json(
    {
      users,
      total,
      page,
      pageSize,
      totalPages,
    },
    { headers: NO_STORE_HEADERS }
  )
}

/**
 * POST /api/users — create a new user and send an onboarding invite email.
 * Requires MANAGE_USERS permission.
 * Body: { name, email, role }
 * Returns created user + invite delivery outcome.
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, email, role } = body as { name?: unknown; email?: unknown; role?: unknown }

  // Validate name
  if (typeof name !== 'string') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  const trimmedName = name.trim()
  if (trimmedName.length < 1 || trimmedName.length > 100) {
    return NextResponse.json({ error: 'Name must be between 1 and 100 characters' }, { status: 400 })
  }

  // Validate email
  if (typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }
  const normalizedEmail = email.toLowerCase().trim()
  if (!isValidEmail(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  // Validate role
  if (typeof role !== 'string' || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
      { status: 400 }
    )
  }

  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
  }

  // Generate an unusable placeholder hash — the user sets their real
  // password via the onboarding token link sent in the invite email.
  const placeholderHash = await hash(crypto.randomBytes(32).toString('hex'), 10)

  let user: { id: string; name: string; email: string; role: UserRole; active: boolean; mustChangePassword: boolean; createdAt: Date; updatedAt: Date }
  let passwordSetup: { token: string }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: trimmedName,
          email: normalizedEmail,
          passwordHash: placeholderHash,
          role: role as UserRole,
          active: true,
          mustChangePassword: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          mustChangePassword: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      const issuedToken = await issueSetPasswordToken({
        userId: createdUser.id,
        tx,
      })

      return {
        user: createdUser,
        passwordSetup: issuedToken,
      }
    })
    user = result.user
    passwordSetup = result.passwordSetup
  } catch (error) {
    if (
      typeof error === 'object' && error !== null &&
      'code' in error && (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
    }
    throw error
  }

  await logAuditCreate({
    userId: session.user.id,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: user.id,
    created: { name: trimmedName, email: normalizedEmail, role },
    ipAddress: getClientIp(request),
  })

  // Send the onboarding invite email
  const setupUrl = buildSetPasswordUrl(passwordSetup.token)
  const invitePayload = buildInviteEmail({
    recipientName: trimmedName,
    setupUrl,
    senderName: session.user.name ?? undefined,
  })

  const emailResult = await sendEmail({
    to: normalizedEmail,
    subject: invitePayload.subject,
    html: invitePayload.html,
    text: invitePayload.text,
  })

  if (!emailResult.success) {
    console.error(`[create-user] Invite email delivery failed for ${normalizedEmail}:`, emailResult.error)
  }

  return NextResponse.json({
    ...user,
    invite: {
      status: emailResult.success ? 'sent' as const : 'failed' as const,
      ...(!emailResult.success ? { setupUrl } : {}),
      ...(!emailResult.success ? { error: 'Invite email could not be delivered' } : {}),
    },
  }, { status: 201 })
}
