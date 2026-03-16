import { hash } from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'

import { logAudit } from '@/lib/audit'
import {
  consumeSetPasswordToken,
  validateSetPasswordToken,
} from '@/lib/password-setup-tokens'
import { enforceRouteRateLimit, getClientAddress } from '@/lib/rate-limit'
import { getUnmetRequirements, PasswordSchema } from '@/lib/validations'

function getRateLimitKey(request: NextRequest, scope: 'validate' | 'submit'): string {
  const clientAddress = getClientAddress({ headers: request.headers })
  return `password-setup:${scope}:${clientAddress}`
}

/**
 * GET /api/password-setup?token=...
 * Public endpoint to validate a set-password token without consuming it.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRouteRateLimit(
    getRateLimitKey(request, 'validate'),
    { limit: 30, windowMs: 15 * 60 * 1000 },
  )
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')?.trim()
  if (!token) {
    return NextResponse.json({
      valid: false,
      reason: 'invalid',
    })
  }

  const result = await validateSetPasswordToken(token)
  if (!result.valid) {
    return NextResponse.json({
      valid: false,
      reason: result.reason,
    })
  }

  return NextResponse.json({
    valid: true,
    emailMasked: result.emailMasked,
  })
}

/**
 * POST /api/password-setup
 * Public endpoint to consume a set-password token and set a new password.
 * Body: { token: string, newPassword: string }
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await enforceRouteRateLimit(
    getRateLimitKey(request, 'submit'),
    { limit: 10, windowMs: 15 * 60 * 1000 },
  )
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { token, newPassword } = body as {
    token?: unknown
    newPassword?: unknown
  }

  if (typeof token !== 'string' || typeof newPassword !== 'string') {
    return NextResponse.json(
      { error: 'token and newPassword are required strings' },
      { status: 400 },
    )
  }

  const passwordPolicyResult = PasswordSchema.safeParse(newPassword)
  if (!passwordPolicyResult.success) {
    return NextResponse.json(
      {
        error: 'Password does not meet policy requirements',
        unmetRequirements: getUnmetRequirements(newPassword),
      },
      { status: 400 },
    )
  }

  const newPasswordHash = await hash(newPassword, 10)
  const consumeResult = await consumeSetPasswordToken({
    token,
    newPasswordHash,
  })

  if (!consumeResult.success) {
    return NextResponse.json(
      {
        error: 'Invalid password setup token',
        valid: false,
        reason: consumeResult.reason,
      },
      { status: 400 },
    )
  }

  await logAudit({
    userId: consumeResult.userId,
    action: 'USER_PASSWORD_CHANGED',
    entityType: 'User',
    entityId: consumeResult.userId,
  })

  return NextResponse.json({ success: true })
}
