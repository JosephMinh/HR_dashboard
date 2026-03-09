import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AuthorizationError, requireMutate } from '@/lib/permissions'
import { JobStatus, JobPriority, PipelineHealth, ApplicationStage } from '@/generated/prisma/client'

const INACTIVE_STAGES: ApplicationStage[] = [
  ApplicationStage.REJECTED,
  ApplicationStage.WITHDRAWN,
]

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

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
    if (!body.title.trim()) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 })
    }
    data.title = body.title.trim()
  }
  if (body.department !== undefined) {
    if (!body.department.trim()) {
      return NextResponse.json({ error: 'Department cannot be empty' }, { status: 400 })
    }
    data.department = body.department.trim()
  }
  if (body.description !== undefined) {
    if (!body.description.trim()) {
      return NextResponse.json({ error: 'Description cannot be empty' }, { status: 400 })
    }
    data.description = body.description.trim()
  }
  if (body.location !== undefined) {
    data.location = body.location?.trim() || null
  }
  if (body.hiringManager !== undefined) {
    data.hiringManager = body.hiringManager?.trim() || null
  }
  if (body.recruiterOwner !== undefined) {
    data.recruiterOwner = body.recruiterOwner?.trim() || null
  }
  if (body.status !== undefined) {
    data.status = body.status
    // Auto-set closedAt when closing
    if (body.status === JobStatus.CLOSED && !existing.closedAt) {
      data.closedAt = new Date()
    }
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
      if (isNaN(date.getTime())) {
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
      if (isNaN(date.getTime())) {
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
      if (isNaN(date.getTime())) {
        return NextResponse.json({ error: 'Invalid closedAt date' }, { status: 400 })
      }
      data.closedAt = date
    }
  }

  const job = await prisma.job.update({
    where: { id },
    data,
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
