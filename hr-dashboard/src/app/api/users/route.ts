import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'

import { auth } from '@/lib/auth'
import { getClientIp, logAuditCreate } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/permissions'
import { isValidEmail, generateTempPassword } from '@/lib/validations'
import { UserRole } from '@/generated/prisma/client'
import type { Prisma } from '@/generated/prisma/client'

const VALID_ROLES = Object.values(UserRole) as string[]

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

  return NextResponse.json({
    users,
    total,
    page,
    pageSize,
    totalPages,
  })
}

/**
 * POST /api/users — create a new user with a temp password.
 * Requires MANAGE_USERS permission.
 * Body: { name, email, role }
 * Returns created user + tempPassword (returned exactly once).
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

  // Generate temp password and hash it
  const tempPassword = generateTempPassword()
  const passwordHash = await hash(tempPassword, 10)

  const user = await prisma.user.create({
    data: {
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
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

  await logAuditCreate({
    userId: session.user.id,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: user.id,
    created: { name: trimmedName, email: normalizedEmail, role },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ ...user, tempPassword }, { status: 201 })
}
