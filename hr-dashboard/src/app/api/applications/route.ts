import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getClientIp, logAuditCreate } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { AuthorizationError, requireMutate } from '@/lib/permissions'
import { ApplicationStage } from '@/generated/prisma/client'
import { Prisma } from '@/generated/prisma/client'

interface CreateApplicationInput {
  jobId: string
  candidateId: string
  stage?: ApplicationStage
  recruiterOwner?: string
  interviewNotes?: string
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

  let body: CreateApplicationInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate required fields
  if (!body.jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 })
  }
  if (!body.candidateId) {
    return NextResponse.json({ error: 'Candidate ID is required' }, { status: 400 })
  }

  // Validate stage enum if provided
  if (body.stage && !Object.values(ApplicationStage).includes(body.stage)) {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
  }

  // Check job exists
  const job = await prisma.job.findUnique({ where: { id: body.jobId } })
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Check candidate exists
  const candidate = await prisma.candidate.findUnique({ where: { id: body.candidateId } })
  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }

  // Check for duplicate application
  const existing = await prisma.application.findUnique({
    where: {
      jobId_candidateId: {
        jobId: body.jobId,
        candidateId: body.candidateId,
      },
    },
  })
  if (existing) {
    return NextResponse.json({ error: 'Candidate is already applied to this job' }, { status: 409 })
  }

  // Create application
  const applicationData = {
    jobId: body.jobId,
    candidateId: body.candidateId,
    stage: body.stage ?? ApplicationStage.NEW,
    recruiterOwner: body.recruiterOwner?.trim() || null,
    interviewNotes: body.interviewNotes?.trim() || null,
  }

  let application
  try {
    application = await prisma.application.create({
      data: applicationData,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            department: true,
          },
        },
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    })
  } catch (error) {
    // Guard against race conditions where the duplicate check passes but a
    // competing request inserts the same (jobId, candidateId) first.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Candidate is already applied to this job' },
        { status: 409 },
      )
    }
    throw error
  }

  // Audit log
  await logAuditCreate({
    userId: session.user.id ?? null,
    action: 'APPLICATION_CREATED',
    entityType: 'Application',
    entityId: application.id,
    created: applicationData,
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({
    id: application.id,
    jobId: application.jobId,
    candidateId: application.candidateId,
    stage: application.stage,
    recruiterOwner: application.recruiterOwner,
    interviewNotes: application.interviewNotes,
    stageUpdatedAt: application.stageUpdatedAt.toISOString(),
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    job: application.job,
    candidate: application.candidate,
  }, { status: 201 })
}
