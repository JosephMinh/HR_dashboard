import { NextRequest, NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { getClientIp, logAuditUpdate } from "@/lib/audit"
import { prisma } from "@/lib/prisma"

/**
 * PATCH /api/users/me — update current user's name.
 * Email is read-only and cannot be changed.
 */
export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  // Block gated users from updating profile
  if (session.user.mustChangePassword) {
    return NextResponse.json(
      { error: "You must change your password before updating your profile" },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { name } = body as { name?: unknown }

  if (name === undefined) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  if (typeof name !== "string") {
    return NextResponse.json({ error: "Name must be a string" }, { status: 400 })
  }

  const trimmedName = name.trim()
  if (trimmedName.length < 1 || trimmedName.length > 100) {
    return NextResponse.json(
      { error: "Name must be between 1 and 100 characters" },
      { status: 400 }
    )
  }

  const before = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true, createdAt: true, updatedAt: true },
  })

  if (!before) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: { name: trimmedName },
    select: { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true, createdAt: true, updatedAt: true },
  })

  await logAuditUpdate({
    userId: session.user.id,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: session.user.id,
    before,
    after: updated,
    ipAddress: getClientIp(request),
  })

  return NextResponse.json(updated)
}
