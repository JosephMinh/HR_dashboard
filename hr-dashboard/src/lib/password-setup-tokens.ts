import crypto from 'node:crypto'

import { Prisma } from '@/generated/prisma/client'

import { prisma } from '@/lib/prisma'

const SET_PASSWORD_TOKEN_BYTES = 32
const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const MIN_TOKEN_LENGTH = 32
const MAX_TOKEN_LENGTH = 256
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

export type SetPasswordTokenInvalidReason = 'invalid' | 'expired' | 'used'

export type ValidateSetPasswordTokenResult =
  | {
      valid: true
      userId: string
      emailMasked: string
      expiresAt: Date
    }
  | {
      valid: false
      reason: SetPasswordTokenInvalidReason
    }

export type ConsumeSetPasswordTokenResult =
  | {
      success: true
      userId: string
    }
  | {
      success: false
      reason: SetPasswordTokenInvalidReason
    }

export interface IssueSetPasswordTokenResult {
  token: string
  expiresAt: Date
}

function getTokenSigningSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim()
  if (!secret) {
    throw new Error('AUTH_SECRET is required to issue and validate password setup tokens')
  }

  return secret
}

export function isPlausibleSetPasswordToken(token: string): boolean {
  const trimmed = token.trim()

  if (
    trimmed.length < MIN_TOKEN_LENGTH ||
    trimmed.length > MAX_TOKEN_LENGTH
  ) {
    return false
  }

  return TOKEN_PATTERN.test(trimmed)
}

export function hashSetPasswordToken(token: string): string {
  return crypto
    .createHmac('sha256', getTokenSigningSecret())
    .update(token)
    .digest('hex')
}

function createRawSetPasswordToken(): string {
  return crypto.randomBytes(SET_PASSWORD_TOKEN_BYTES).toString('base64url')
}

function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  const [localPart = '', domainPart = ''] = normalized.split('@')

  if (!localPart || !domainPart) {
    return 'hidden'
  }

  const visibleLocal = localPart.slice(0, 2)
  const maskedLocal =
    localPart.length <= 2 ? `${visibleLocal}***` : `${visibleLocal}${'*'.repeat(Math.max(localPart.length - 2, 3))}`

  const [domainName = '', ...domainSuffixParts] = domainPart.split('.')
  if (!domainName) {
    return `${maskedLocal}@***`
  }

  const visibleDomain = domainName.slice(0, 1)
  const maskedDomain =
    domainName.length <= 1
      ? `${visibleDomain}***`
      : `${visibleDomain}${'*'.repeat(Math.max(domainName.length - 1, 3))}`
  const suffix = domainSuffixParts.length > 0 ? `.${domainSuffixParts.join('.')}` : ''

  return `${maskedLocal}@${maskedDomain}${suffix}`
}

function resolveTokenState(input: {
  tokenRecord: {
    userId: string
    user: { id: string; email: string; active: boolean }
    expiresAt: Date
    usedAt: Date | null
  } | null
  now: Date
}): ValidateSetPasswordTokenResult {
  const { tokenRecord, now } = input

  if (!tokenRecord || !tokenRecord.user.active) {
    return { valid: false, reason: 'invalid' }
  }

  if (tokenRecord.usedAt) {
    return { valid: false, reason: 'used' }
  }

  if (tokenRecord.expiresAt <= now) {
    return { valid: false, reason: 'expired' }
  }

  return {
    valid: true,
    userId: tokenRecord.userId,
    emailMasked: maskEmail(tokenRecord.user.email),
    expiresAt: tokenRecord.expiresAt,
  }
}

async function issueSetPasswordTokenWithTx(
  tx: Prisma.TransactionClient,
  userId: string,
  expiresInMs: number,
): Promise<IssueSetPasswordTokenResult> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + expiresInMs)
  const token = createRawSetPasswordToken()
  const tokenHash = hashSetPasswordToken(token)

  // Only one active token per user at a time.
  await tx.setPasswordToken.updateMany({
    where: {
      userId,
      usedAt: null,
    },
    data: {
      usedAt: now,
    },
  })

  await tx.setPasswordToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  })

  return { token, expiresAt }
}

export async function issueSetPasswordToken(params: {
  userId: string
  expiresInMs?: number
  tx?: Prisma.TransactionClient
}): Promise<IssueSetPasswordTokenResult> {
  const expiresInMs =
    params.expiresInMs && params.expiresInMs > 0
      ? params.expiresInMs
      : DEFAULT_TOKEN_TTL_MS

  if (params.tx) {
    return issueSetPasswordTokenWithTx(params.tx, params.userId, expiresInMs)
  }

  return prisma.$transaction((tx) =>
    issueSetPasswordTokenWithTx(tx, params.userId, expiresInMs),
  )
}

export async function validateSetPasswordToken(
  rawToken: string,
): Promise<ValidateSetPasswordTokenResult> {
  if (!isPlausibleSetPasswordToken(rawToken)) {
    return { valid: false, reason: 'invalid' }
  }

  const tokenHash = hashSetPasswordToken(rawToken.trim())
  const tokenRecord = await prisma.setPasswordToken.findUnique({
    where: { tokenHash },
    select: {
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          active: true,
        },
      },
    },
  })

  return resolveTokenState({ tokenRecord, now: new Date() })
}

export async function consumeSetPasswordToken(params: {
  token: string
  newPasswordHash: string
}): Promise<ConsumeSetPasswordTokenResult> {
  if (!isPlausibleSetPasswordToken(params.token)) {
    return { success: false, reason: 'invalid' }
  }

  const tokenHash = hashSetPasswordToken(params.token.trim())
  const now = new Date()

  return prisma.$transaction(async (tx) => {
    const tokenRecord = await tx.setPasswordToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            active: true,
          },
        },
      },
    })

    const state = resolveTokenState({ tokenRecord, now })
    if (!state.valid) {
      return { success: false, reason: state.reason } satisfies ConsumeSetPasswordTokenResult
    }
    if (!tokenRecord) {
      return { success: false, reason: 'invalid' } satisfies ConsumeSetPasswordTokenResult
    }

    // Guard against double-submit races on the same token.
    const consumeResult = await tx.setPasswordToken.updateMany({
      where: {
        id: tokenRecord.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        usedAt: now,
      },
    })

    if (consumeResult.count !== 1) {
      const currentState = await tx.setPasswordToken.findUnique({
        where: { id: tokenRecord.id },
        select: {
          usedAt: true,
          expiresAt: true,
        },
      })

      if (!currentState) {
        return { success: false, reason: 'invalid' } satisfies ConsumeSetPasswordTokenResult
      }
      if (currentState.usedAt) {
        return { success: false, reason: 'used' } satisfies ConsumeSetPasswordTokenResult
      }
      if (currentState.expiresAt <= now) {
        return { success: false, reason: 'expired' } satisfies ConsumeSetPasswordTokenResult
      }

      // Defensive fallback for unexpected concurrent state transitions.
      return { success: false, reason: 'invalid' } satisfies ConsumeSetPasswordTokenResult
    }

    await tx.user.update({
      where: { id: tokenRecord.userId },
      data: {
        passwordHash: params.newPasswordHash,
        mustChangePassword: false,
      },
    })

    await tx.setPasswordToken.updateMany({
      where: {
        userId: tokenRecord.userId,
        id: { not: tokenRecord.id },
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    })

    return { success: true, userId: tokenRecord.userId } satisfies ConsumeSetPasswordTokenResult
  })
}

export function buildSetPasswordUrl(token: string): string {
  const path = `/set-password?token=${encodeURIComponent(token)}`
  const appUrl = process.env.APP_URL?.trim()

  if (!appUrl) {
    return path
  }

  try {
    return new URL(path, appUrl).toString()
  } catch {
    return path
  }
}
