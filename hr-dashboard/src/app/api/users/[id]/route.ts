import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { getClientIp, logAuditUpdate } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/permissions'
import { isValidUUID } from '@/lib/validations'
import { UserRole } from '@/generated/prisma/client'

const VALID_ROLES = Object.values(UserRole) as string[]

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} as const

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/users/:id — update user name, role, or active status.
 * Requires MANAGE_USERS permission.
 * Safeguards: no self-role-change, no last-admin demotion/deactivation, no self-deactivation.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: USER_SELECT,
  })
  if (!existing) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
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

  const { name, role, active } = body as { name?: unknown; role?: unknown; active?: unknown }
  const data: Record<string, unknown> = {}

  // Validate name
  if (name !== undefined) {
    if (typeof name !== 'string') {
      return NextResponse.json({ error: 'Name must be a string' }, { status: 400 })
    }
    const trimmedName = name.trim()
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      return NextResponse.json({ error: 'Name must be between 1 and 100 characters' }, { status: 400 })
    }
    data.name = trimmedName
  }

  // Validate role
  if (role !== undefined) {
    if (typeof role !== 'string' || !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      )
    }

    // Prevent self-role-change
    if (id === session.user.id) {
      return NextResponse.json({ error: 'Cannot change own role' }, { status: 400 })
    }

    // Prevent last-admin demotion
    if (existing.role === 'ADMIN' && existing.active && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN', active: true },
      })
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Cannot demote the last admin' }, { status: 400 })
      }
    }

    data.role = role
  }

  // Validate active
  if (active !== undefined) {
    if (typeof active !== 'boolean') {
      return NextResponse.json({ error: 'Active must be a boolean' }, { status: 400 })
    }

    if (!active) {
      // Prevent self-deactivation
      if (id === session.user.id) {
        return NextResponse.json({ error: 'Cannot deactivate yourself' }, { status: 400 })
      }

      // Prevent last-admin deactivation
      if (existing.role === 'ADMIN' && existing.active) {
        const adminCount = await prisma.user.count({
          where: { role: 'ADMIN', active: true },
        })
        if (adminCount <= 1) {
          return NextResponse.json({ error: 'Cannot deactivate the last admin' }, { status: 400 })
        }
      }
    }

    data.active = active
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided for update' }, { status: 400 })
  }

  const needsAdminGuard =
    (role !== undefined &&
      existing.role === 'ADMIN' &&
      existing.active &&
      role !== 'ADMIN') ||
    (active === false && existing.role === 'ADMIN' && existing.active)

  let updated
  if (needsAdminGuard) {
    // Use a transaction to prevent TOCTOU race on last-admin checks.
    // Without this, concurrent requests could both pass the admin count
    // check and then both demote/deactivate different admins.
    const result = await prisma.$transaction(async (tx) => {
      const adminCount = await tx.user.count({
        where: { role: 'ADMIN', active: true, NOT: { id } },
      })
      if (adminCount === 0) {
        return { kind: 'last_admin' as const }
      }
      const u = await tx.user.update({
        where: { id },
        data,
        select: USER_SELECT,
      })
      return { kind: 'ok' as const, user: u }
    })
    if (result.kind === 'last_admin') {
      const msg = role !== undefined && role !== 'ADMIN'
        ? 'Cannot demote the last admin'
        : 'Cannot deactivate the last admin'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    updated = result.user
  } else {
    updated = await prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    })
  }

  // Determine audit action
  const isDeactivation = active === false && existing.active === true
  const auditAction = isDeactivation ? 'USER_DEACTIVATED' : 'USER_UPDATED'

  await logAuditUpdate({
    userId: session.user.id,
    action: auditAction,
    entityType: 'User',
    entityId: id,
    before: existing,
    after: updated,
    ipAddress: getClientIp(request),
  })

  return NextResponse.json(updated)
}

/**
 * DELETE /api/users/:id — permanently delete a user.
 * Requires MANAGE_USERS permission.
 * Safeguards: no self-delete, no deleting last active admin.
 * Delete + audit log run in a single transaction.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
  }

  if (id === session.user.id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 403 })
  }

  const ipAddress = getClientIp(request)

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id },
      select: USER_SELECT,
    })
    if (!existing) {
      return { kind: 'not_found' as const }
    }

    if (existing.role === 'ADMIN' && existing.active) {
      const activeAdminCount = await tx.user.count({
        where: {
          role: 'ADMIN',
          active: true,
          NOT: { id },
        },
      })

      if (activeAdminCount === 0) {
        return { kind: 'last_active_admin' as const }
      }
    }

    // Verify the acting user exists in DB before referencing in audit log
    const auditUserId = isValidUUID(session.user.id)
      ? (await tx.user.findUnique({
          where: { id: session.user.id },
          select: { id: true },
        }))?.id ?? null
      : null

    const deleted = await tx.user.delete({
      where: { id },
      select: USER_SELECT,
    })

    await tx.auditLog.create({
      data: {
        userId: auditUserId,
        action: 'USER_DELETED',
        entityType: 'User',
        entityId: id,
        beforeJson: {
          id: deleted.id,
          name: deleted.name,
          email: deleted.email,
          role: deleted.role,
          active: deleted.active,
          mustChangePassword: deleted.mustChangePassword,
        },
        ipAddress: ipAddress ?? undefined,
      },
    })

    return { kind: 'deleted' as const }
  })

  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (result.kind === 'last_active_admin') {
    return NextResponse.json({ error: 'Cannot delete the last active admin' }, { status: 409 })
  }

  return NextResponse.json({ success: true })
}
