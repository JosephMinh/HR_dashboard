import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getClientIp, logAuditUpdate, logAuditDelete } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { AuthorizationError, requireMutate } from '@/lib/permissions'
import { isValidUUID } from '@/lib/validations'
import { JobStatus, JobPriority, PipelineHealth, ApplicationStage } from '@/generated/prisma/client'

const INACTIVE_STAGES: ApplicationStage[] = [
  ApplicationStage.REJECTED,
  ApplicationStage.WITHDRAWN,
]

interface RouteParams {
  params: Promise<{ id: string }>
}

function hasOwn<T extends object>(obj: T, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function isTargetBeforeOpened(openedAt: Date | null | undefined, targetFillDate: Date | null | undefined): boolean {
  if (!openedAt || !targetFillDate) {
    return false
  }
  return targetFillDate.getTime() < openedAt.getTime()
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Validate ID format early to avoid unnecessary DB queries
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid job ID format' }, { status: 400 })
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      applications: {
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              currentCompany: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
  })

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Count active candidates
  const activeCandidateCount = job.applications.filter(
    app => !INACTIVE_STAGES.includes(app.stage)
  ).length

  return NextResponse.json({
    id: job.id,
    title: job.title,
    department: job.department,
    description: job.description,
    location: job.location,
    hiringManager: job.hiringManager,
    recruiterOwner: job.recruiterOwner,
    status: job.status,
    priority: job.priority,
    pipelineHealth: job.pipelineHealth,
    isCritical: job.isCritical,
    openedAt: job.openedAt?.toISOString() ?? null,
    targetFillDate: job.targetFillDate?.toISOString() ?? null,
    closedAt: job.closedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    activeCandidateCount,
    applications: job.applications.map(app => ({
      id: app.id,
      stage: app.stage,
      recruiterOwner: app.recruiterOwner,
      stageUpdatedAt: app.stageUpdatedAt.toISOString(),
      createdAt: app.createdAt.toISOString(),
      candidate: {
        id: app.candidate.id,
        firstName: app.candidate.firstName,
        lastName: app.candidate.lastName,
        email: app.candidate.email,
        currentCompany: app.candidate.currentCompany,
      },
    })),
  })
}

interface UpdateJobInput {
  title?: string
  department?: string
  description?: string
  location?: string | null
  hiringManager?: string | null
  recruiterOwner?: string | null
  status?: JobStatus
  priority?: JobPriority
  pipelineHealth?: PipelineHealth | null
  isCritical?: boolean
  openedAt?: string | null
  targetFillDate?: string | null
  closedAt?: string | null
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    requireMutate(session.user.role)
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const { id } = await params

  // Validate ID format early to avoid unnecessary DB queries
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid job ID format' }, { status: 400 })
  }

  // Check job exists
  const existing = await prisma.job.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  let body: UpdateJobInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate enums if provided
  if (body.status !== undefined && !Object.values(JobStatus).includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (body.priority !== undefined && !Object.values(JobPriority).includes(body.priority)) {
    return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
  }
  if (body.pipelineHealth !== undefined && body.pipelineHealth !== null && !Object.values(PipelineHealth).includes(body.pipelineHealth)) {
    return NextResponse.json({ error: 'Invalid pipeline health' }, { status: 400 })
  }

  // Build update data
  const data: Record<string, unknown> = {}

  if (body.title !== undefined) {
    const title = body.title.trim()
    if (!title) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    }
    if (title.length < 3) {
      return NextResponse.json({ error: 'Title must be at least 3 characters' }, { status: 400 })
    }
    if (title.length > 200) {
      return NextResponse.json({ error: 'Title must be at most 200 characters' }, { status: 400 })
    }
    data.title = title
  }
  if (body.department !== undefined) {
    const department = body.department.trim()
    if (!department) {
      return NextResponse.json({ error: 'Department cannot be empty' }, { status: 400 })
    }
    if (department.length > 100) {
      return NextResponse.json({ error: 'Department must be at most 100 characters' }, { status: 400 })
    }
    data.department = department
  }
  if (body.description !== undefined) {
    const description = body.description.trim()
    if (!description) {
      return NextResponse.json({ error: 'Description cannot be empty' }, { status: 400 })
    }
    if (description.length < 10) {
      return NextResponse.json({ error: 'Description must be at least 10 characters' }, { status: 400 })
    }
    if (description.length > 10000) {
      return NextResponse.json({ error: 'Description must be at most 10000 characters' }, { status: 400 })
    }
    data.description = description
  }
  if (body.location !== undefined) {
    if (body.location && body.location.length > 200) {
      return NextResponse.json({ error: 'Location must be at most 200 characters' }, { status: 400 })
    }
    data.location = body.location?.trim() || null
  }
  if (body.hiringManager !== undefined) {
    if (body.hiringManager && body.hiringManager.length > 100) {
      return NextResponse.json({ error: 'Hiring manager must be at most 100 characters' }, { status: 400 })
    }
    data.hiringManager = body.hiringManager?.trim() || null
  }
  if (body.recruiterOwner !== undefined) {
    if (body.recruiterOwner && body.recruiterOwner.length > 100) {
      return NextResponse.json({ error: 'Recruiter owner must be at most 100 characters' }, { status: 400 })
    }
    data.recruiterOwner = body.recruiterOwner?.trim() || null
  }
  if (body.status !== undefined) {
    data.status = body.status
  }
  if (body.priority !== undefined) {
    data.priority = body.priority
  }
  if (body.pipelineHealth !== undefined) {
    data.pipelineHealth = body.pipelineHealth
  }
  if (body.isCritical !== undefined) {
    data.isCritical = body.isCritical
  }

  // Parse dates
  if (body.openedAt !== undefined) {
    if (body.openedAt === null) {
      data.openedAt = null
    } else {
      const date = new Date(body.openedAt)
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: 'Invalid openedAt date' }, { status: 400 })
      }
      data.openedAt = date
    }
  }
  if (body.targetFillDate !== undefined) {
    if (body.targetFillDate === null) {
      data.targetFillDate = null
    } else {
      const date = new Date(body.targetFillDate)
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: 'Invalid targetFillDate date' }, { status: 400 })
      }
      data.targetFillDate = date
    }
  }
  if (body.closedAt !== undefined) {
    if (body.closedAt === null) {
      data.closedAt = null
    } else {
      const date = new Date(body.closedAt)
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: 'Invalid closedAt date' }, { status: 400 })
      }
      data.closedAt = date
    }
  }

  const nextOpenedAt = hasOwn(data, 'openedAt')
    ? data.openedAt as Date | null
    : existing.openedAt
  const nextTargetFillDate = hasOwn(data, 'targetFillDate')
    ? data.targetFillDate as Date | null
    : existing.targetFillDate
  if (isTargetBeforeOpened(nextOpenedAt, nextTargetFillDate)) {
    return NextResponse.json(
      { error: 'Target fill date must be on or after opened date' },
      { status: 400 },
    )
  }

  const nextStatus = (data.status as JobStatus | undefined) ?? existing.status
  const nextPipelineHealth = hasOwn(data, 'pipelineHealth')
    ? data.pipelineHealth as PipelineHealth | null
    : existing.pipelineHealth
  if (nextStatus === JobStatus.OPEN && nextPipelineHealth === null) {
    return NextResponse.json(
      { error: 'Pipeline health is required for open jobs' },
      { status: 400 },
    )
  }

  // Keep closedAt aligned with lifecycle transitions unless explicitly overridden.
  if (body.status !== undefined && body.closedAt === undefined) {
    if (body.status === JobStatus.CLOSED) {
      if (!existing.closedAt) {
        data.closedAt = new Date()
      }
    } else {
      data.closedAt = null
    }
  }

  const nextClosedAt = hasOwn(data, 'closedAt')
    ? data.closedAt as Date | null
    : existing.closedAt
  if (nextStatus === JobStatus.CLOSED && nextClosedAt === null) {
    return NextResponse.json(
      { error: 'closedAt cannot be null when status is CLOSED' },
      { status: 400 },
    )
  }
  if (nextStatus !== JobStatus.CLOSED && nextClosedAt !== null) {
    return NextResponse.json(
      { error: 'closedAt can only be set when status is CLOSED' },
      { status: 400 },
    )
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields provided for update' },
      { status: 400 },
    )
  }

  const job = await prisma.job.update({
    where: { id },
    data,
  })

  // Audit log
  await logAuditUpdate({
    userId: session.user.id ?? null,
    action: 'JOB_UPDATED',
    entityType: 'Job',
    entityId: job.id,
    before: {
      title: existing.title,
      department: existing.department,
      description: existing.description,
      location: existing.location,
      hiringManager: existing.hiringManager,
      recruiterOwner: existing.recruiterOwner,
      status: existing.status,
      priority: existing.priority,
      pipelineHealth: existing.pipelineHealth,
      isCritical: existing.isCritical,
      openedAt: existing.openedAt?.toISOString() ?? null,
      targetFillDate: existing.targetFillDate?.toISOString() ?? null,
      closedAt: existing.closedAt?.toISOString() ?? null,
    },
    after: {
      title: job.title,
      department: job.department,
      description: job.description,
      location: job.location,
      hiringManager: job.hiringManager,
      recruiterOwner: job.recruiterOwner,
      status: job.status,
      priority: job.priority,
      pipelineHealth: job.pipelineHealth,
      isCritical: job.isCritical,
      openedAt: job.openedAt?.toISOString() ?? null,
      targetFillDate: job.targetFillDate?.toISOString() ?? null,
      closedAt: job.closedAt?.toISOString() ?? null,
    },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({
    id: job.id,
    title: job.title,
    department: job.department,
    description: job.description,
    location: job.location,
    hiringManager: job.hiringManager,
    recruiterOwner: job.recruiterOwner,
    status: job.status,
    priority: job.priority,
    pipelineHealth: job.pipelineHealth,
    isCritical: job.isCritical,
    openedAt: job.openedAt?.toISOString() ?? null,
    targetFillDate: job.targetFillDate?.toISOString() ?? null,
    closedAt: job.closedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    requireMutate(session.user.role)
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const { id } = await params

  // Validate ID format early to avoid unnecessary DB queries
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid job ID format' }, { status: 400 })
  }

  // Check job exists and get application count for audit
  const existing = await prisma.job.findUnique({
    where: { id },
    include: {
      _count: { select: { applications: true } },
    },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Delete job (applications cascade delete per schema)
  await prisma.job.delete({ where: { id } })

  // Audit log
  await logAuditDelete({
    userId: session.user.id ?? null,
    action: 'JOB_DELETED',
    entityType: 'Job',
    entityId: id,
    deleted: {
      title: existing.title,
      department: existing.department,
      status: existing.status,
      applicationCount: existing._count.applications,
    },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true })
}
