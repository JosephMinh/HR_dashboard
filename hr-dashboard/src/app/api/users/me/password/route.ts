import { NextRequest, NextResponse } from "next/server"
import { compare, hash } from "bcryptjs"

import { auth } from "@/lib/auth"
import { getClientIp, logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { PasswordSchema, getUnmetRequirements } from "@/lib/validations"
import { enforceRouteRateLimit } from "@/lib/rate-limit"

/**
 * POST /api/users/me/password — change current user's password.
 * Body: { currentPassword: string, newPassword: string }
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  // Rate limit: 5 attempts per 15 minutes per user
  const rateLimitResult = await enforceRouteRateLimit(
    `password-change:${session.user.id}`,
    { limit: 5, windowMs: 15 * 60 * 1000 }
  )
  if (rateLimitResult) {
    return rateLimitResult
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

  const { currentPassword, newPassword } = body as {
    currentPassword?: unknown
    newPassword?: unknown
  }

  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return NextResponse.json(
      { error: "currentPassword and newPassword are required strings" },
      { status: 400 }
    )
  }

  // Validate new password against policy
  const policyResult = PasswordSchema.safeParse(newPassword)
  if (!policyResult.success) {
    const unmet = getUnmetRequirements(newPassword)
    return NextResponse.json(
      { error: "Password does not meet policy requirements", unmetRequirements: unmet },
      { status: 400 }
    )
  }

  // Fetch current user with password hash
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Verify current password
  const isCurrentValid = await compare(currentPassword, user.passwordHash)
  if (!isCurrentValid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
  }

  // Reject if new password is the same as current
  const isSamePassword = await compare(newPassword, user.passwordHash)
  if (isSamePassword) {
    return NextResponse.json(
      { error: "New password must be different from current password" },
      { status: 400 }
    )
  }

  // Hash new password and update
  const newHash = await hash(newPassword, 10)
  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
    },
    select: { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true, createdAt: true, updatedAt: true },
  })

  await logAudit({
    userId: session.user.id,
    action: "USER_PASSWORD_CHANGED",
    entityType: "User",
    entityId: session.user.id,
    ipAddress: getClientIp(request),
  })

  return NextResponse.json(updated)
}
