import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getClientIp, logAuditCreate } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { AuthorizationError, requireMutate } from '@/lib/permissions'
import { JobStatus, JobPriority, PipelineHealth, ApplicationStage } from '@/generated/prisma/client'
import type { Prisma } from '@/generated/prisma/client'

const INACTIVE_STAGES: ApplicationStage[] = [
  ApplicationStage.REJECTED,
  ApplicationStage.WITHDRAWN,
]

type SortField = 'title' | 'status' | 'targetFillDate' | 'updatedAt' | 'department' | 'openedAt'
type SortOrder = 'asc' | 'desc'

function isTargetBeforeOpened(openedAt: Date | null | undefined, targetFillDate: Date | null | undefined): boolean {
  if (!openedAt || !targetFillDate) {
    return false
  }
  return targetFillDate.getTime() < openedAt.getTime()
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  // Parse pagination parameters
  const pageParam = searchParams.get('page')
  const pageSizeParam = searchParams.get('pageSize')

  // Validate and parse page (1-indexed, defaults to 1)
  let page = 1
  if (pageParam !== null) {
    const parsed = parseInt(pageParam, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      return NextResponse.json({ error: 'Invalid page parameter: must be a positive integer' }, { status: 400 })
    }
    page = parsed
  }

  // Validate and parse pageSize (defaults to 20, max 100)
  let pageSize = 20
  if (pageSizeParam !== null) {
    const parsed = parseInt(pageSizeParam, 10)
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
      return NextResponse.json({ error: 'Invalid pageSize parameter: must be between 1 and 100' }, { status: 400 })
    }
    pageSize = parsed
  }

  // Parse query parameters
  const statusParam = searchParams.get('status')
  const departmentParam = searchParams.get('department')
  const pipelineHealthParam = searchParams.get('pipelineHealth')
  const criticalParam = searchParams.get('critical')
  const search = searchParams.get('search')
  const sortParam = searchParams.get('sort') as SortField | null
  const allowedSortFields: SortField[] = [
    'title',
    'status',
    'targetFillDate',
    'updatedAt',
    'department',
    'openedAt',
  ]

  // Validate sort field
  if (sortParam !== null && !allowedSortFields.includes(sortParam)) {
    return NextResponse.json({
      error: `Invalid sort parameter: must be one of ${allowedSortFields.join(', ')}`
    }, { status: 400 })
  }

  const sortField: SortField = sortParam && allowedSortFields.includes(sortParam)
    ? sortParam
    : 'updatedAt'
  const orderParam = searchParams.get('order')

  // Validate order parameter
  if (orderParam !== null && orderParam !== 'asc' && orderParam !== 'desc') {
    return NextResponse.json({ error: 'Invalid order parameter: must be "asc" or "desc"' }, { status: 400 })
  }

  const sortOrder: SortOrder = orderParam === 'asc' || orderParam === 'desc'
    ? orderParam
    : 'desc'
  const includeCount = searchParams.get('includeCount') === 'true'

  // Build where clause
  const where: Prisma.JobWhereInput = {}

  if (statusParam) {
    const statuses = statusParam.split(',').filter(s =>
      Object.values(JobStatus).includes(s as JobStatus)
    ) as JobStatus[]
    if (statuses.length === 1) {
      where.status = statuses[0]
    } else if (statuses.length > 1) {
      where.status = { in: statuses }
    }
  }

  if (departmentParam) {
    const departments = departmentParam.split(',').map((value) => value.trim()).filter(Boolean)
    if (departments.length === 1) {
      where.department = departments[0]
    } else if (departments.length > 1) {
      where.department = { in: departments }
    }
  }

  if (pipelineHealthParam) {
    const healthValues = pipelineHealthParam.split(',').filter(h =>
      Object.values(PipelineHealth).includes(h as PipelineHealth)
    ) as PipelineHealth[]
    if (healthValues.length === 1) {
      where.pipelineHealth = healthValues[0]
    } else if (healthValues.length > 1) {
      where.pipelineHealth = { in: healthValues }
    }
  }

  if (criticalParam === 'true') {
    where.isCritical = true
  }

  if (search) {
    where.title = { contains: search, mode: 'insensitive' }
  }

  // Build orderBy
  const orderBy: Prisma.JobOrderByWithRelationInput[] = []

  // Default: OPEN jobs first
  if (sortField !== 'status') {
    orderBy.push({
      status: 'asc', // OPEN (alphabetically first) comes before ON_HOLD, CLOSED
    })
  }

  // Add requested sort
  if (sortField === 'title') {
    orderBy.push({ title: sortOrder })
  } else if (sortField === 'status') {
    orderBy.push({ status: sortOrder })
  } else if (sortField === 'targetFillDate') {
    orderBy.push({ targetFillDate: sortOrder })
  } else if (sortField === 'openedAt') {
    orderBy.push({ openedAt: sortOrder })
  } else if (sortField === 'department') {
    orderBy.push({ department: sortOrder })
  } else {
    orderBy.push({ updatedAt: sortOrder })
  }

  // Add tie-breaker for deterministic ordering
  orderBy.push({ id: 'asc' })

  // Count total first (for pagination metadata)
  const total = await prisma.job.count({ where })
  const totalPages = Math.ceil(total / pageSize)

  // Calculate skip for pagination
  const skip = (page - 1) * pageSize

  // Execute query with pagination
  const jobs = await prisma.job.findMany({
    where,
    orderBy,
    skip,
    take: pageSize,
    include: includeCount ? {
      applications: {
        where: {
          stage: { notIn: INACTIVE_STAGES },
        },
        select: { id: true },
      },
    } : undefined,
  })

  // Transform response with pagination metadata
  const response = {
    jobs: jobs.map(job => ({
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
      ...(includeCount && 'applications' in job ? {
        activeCandidateCount: (job as typeof job & { applications: { id: string }[] }).applications.length,
      } : {}),
    })),
    total,
    page,
    pageSize,
    totalPages,
  }

  return NextResponse.json(response)
}

interface CreateJobInput {
  title: string
  department: string
  description: string
  location?: string
  hiringManager?: string
  recruiterOwner?: string
  status?: JobStatus
  priority?: JobPriority
  pipelineHealth?: PipelineHealth
  isCritical?: boolean
  openedAt?: string
  targetFillDate?: string
}

export async function POST(request: NextRequest) {
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

  let body: CreateJobInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate required fields
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  if (!body.department?.trim()) {
    return NextResponse.json({ error: 'Department is required' }, { status: 400 })
  }
  if (!body.description?.trim()) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  }

  // Validate enums if provided
  if (body.status && !Object.values(JobStatus).includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (body.priority && !Object.values(JobPriority).includes(body.priority)) {
    return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
  }
  if (body.pipelineHealth && !Object.values(PipelineHealth).includes(body.pipelineHealth)) {
    return NextResponse.json({ error: 'Invalid pipeline health' }, { status: 400 })
  }

  // Parse dates
  let openedAt: Date | undefined
  let targetFillDate: Date | undefined

  if (body.openedAt) {
    openedAt = new Date(body.openedAt)
    if (Number.isNaN(openedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid openedAt date' }, { status: 400 })
    }
  }
  if (body.targetFillDate) {
    targetFillDate = new Date(body.targetFillDate)
    if (Number.isNaN(targetFillDate.getTime())) {
      return NextResponse.json({ error: 'Invalid targetFillDate date' }, { status: 400 })
    }
  }

  if (isTargetBeforeOpened(openedAt, targetFillDate)) {
    return NextResponse.json(
      { error: 'Target fill date must be on or after opened date' },
      { status: 400 },
    )
  }

  const status = body.status ?? JobStatus.OPEN
  const pipelineHealth = body.pipelineHealth ?? null
  if (status === JobStatus.OPEN && pipelineHealth === null) {
    return NextResponse.json(
      { error: 'Pipeline health is required for open jobs' },
      { status: 400 },
    )
  }

  // Create job
  const jobData = {
    title: body.title.trim(),
    department: body.department.trim(),
    description: body.description.trim(),
    location: body.location?.trim() || null,
    hiringManager: body.hiringManager?.trim() || null,
    recruiterOwner: body.recruiterOwner?.trim() || null,
    status,
    priority: body.priority ?? JobPriority.MEDIUM,
    pipelineHealth,
    isCritical: body.isCritical ?? false,
    openedAt: openedAt ?? new Date(),
    targetFillDate: targetFillDate ?? null,
    closedAt: status === JobStatus.CLOSED ? new Date() : null,
  }

  const job = await prisma.job.create({
    data: jobData,
  })

  // Audit log
  await logAuditCreate({
    userId: session.user.id ?? null,
    action: 'JOB_CREATED',
    entityType: 'Job',
    entityId: job.id,
    created: jobData,
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
  }, { status: 201 })
}
