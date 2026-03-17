import { Prisma } from '@/generated/prisma/client'

import { prisma } from './prisma'

// Audit action types
export type AuditAction =
  | 'JOB_CREATED'
  | 'JOB_UPDATED'
  | 'JOB_CLOSED'
  | 'JOB_DELETED'
  | 'CANDIDATE_CREATED'
  | 'CANDIDATE_UPDATED'
  | 'CANDIDATE_DELETED'
  | 'APPLICATION_CREATED'
  | 'APPLICATION_UPDATED'
  | 'APPLICATION_DELETED'
  | 'RESUME_UPLOADED'
  | 'RESUME_REPLACED'
  | 'RESUME_VIEWED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'USER_PASSWORD_CHANGED'
  | 'USER_PASSWORD_RESET'
  | 'USER_INVITE_RESENT'
  | 'USER_DELETED'

// Entity types
export type EntityType = 'Job' | 'Candidate' | 'Application' | 'User' | 'Resume'

interface AuditLogParams {
  userId: string | null
  action: AuditAction
  entityType: EntityType
  entityId: string
  before?: object | null
  after?: object | null
  ipAddress?: string | null
}

/**
 * Log an audit trail entry for any write operation
 * @param params - The audit log parameters
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        beforeJson: params.before ?? undefined,
        afterJson: params.after ?? undefined,
        ipAddress: params.ipAddress ?? undefined,
      },
    })
  } catch (error) {
    if (
      params.userId !== null &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      try {
        await prisma.auditLog.create({
          data: {
            userId: null,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
            beforeJson: params.before ?? undefined,
            afterJson: params.after ?? undefined,
            ipAddress: params.ipAddress ?? undefined,
          },
        })
        return
      } catch (retryError) {
        console.error('[Audit] Failed to log audit entry after null-user retry:', retryError)
      }
    }

    // Log error but don't throw - audit logging should not break the main operation
    console.error('[Audit] Failed to log audit entry:', error)
  }
}

/**
 * Extract client IP address from a Request object
 * Handles various proxy headers (X-Forwarded-For, X-Real-IP, etc.)
 * @param request - The incoming request
 * @returns The client IP or null
 */
export function getClientIp(request: Request): string | null {
  const headers = request.headers

  // Prefer trusted proxy headers (set by infrastructure, not spoofable)
  const cfConnectingIp = headers.get('cf-connecting-ip')
  if (cfConnectingIp) return sanitizeIp(cfConnectingIp)

  const vercelForwardedFor = headers.get('x-vercel-forwarded-for')
  if (vercelForwardedFor) {
    const firstIp = vercelForwardedFor.split(',')[0]?.trim()
    if (firstIp) return sanitizeIp(firstIp)
  }

  const realIp = headers.get('x-real-ip')
  if (realIp) return sanitizeIp(realIp)

  // Fallback: x-forwarded-for (spoofable if not behind a proxy that rewrites it)
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim()
    if (firstIp) return sanitizeIp(firstIp)
  }

  return null
}

/** Truncate and strip non-printable chars to prevent stored XSS and DB bloat */
function sanitizeIp(raw: string): string {
  // IP addresses are at most 45 chars (IPv6 mapped IPv4: "::ffff:192.168.1.1")
  return raw.slice(0, 45).replace(/[^\x20-\x7E]/g, '')
}

/**
 * Create audit log with automatic before/after diffing
 * Use this for updates where you have both states
 */
export async function logAuditUpdate<T extends object>(params: {
  userId: string | null
  action: AuditAction
  entityType: EntityType
  entityId: string
  before: T
  after: T
  ipAddress?: string | null
}): Promise<void> {
  return logAudit({
    ...params,
    before: params.before,
    after: params.after,
  })
}

/**
 * Create audit log for entity creation
 */
export async function logAuditCreate<T extends object>(params: {
  userId: string | null
  action: AuditAction
  entityType: EntityType
  entityId: string
  created: T
  ipAddress?: string | null
}): Promise<void> {
  return logAudit({
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    before: null,
    after: params.created,
    ipAddress: params.ipAddress,
  })
}

/**
 * Create audit log for entity deletion
 */
export async function logAuditDelete<T extends object>(params: {
  userId: string | null
  action: AuditAction
  entityType: EntityType
  entityId: string
  deleted: T
  ipAddress?: string | null
}): Promise<void> {
  return logAudit({
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    before: params.deleted,
    after: null,
    ipAddress: params.ipAddress,
  })
}
