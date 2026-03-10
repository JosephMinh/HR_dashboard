import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getClientIp, logAuditUpdate, logAuditDelete } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { AuthorizationError, requireMutate } from '@/lib/permissions'
import { isValidUUID } from '@/lib/validations'
import { ApplicationStage } from '@/generated/prisma/client'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface UpdateApplicationInput {
  stage?: ApplicationStage
  recruiterOwner?: string | null
  interviewNotes?: string | null
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
    return NextResponse.json({ error: 'Invalid application ID format' }, { status: 400 })
  }

  // Check application exists
  const existing = await prisma.application.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  let body: UpdateApplicationInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate stage enum if provided
  if (body.stage !== undefined && !Object.values(ApplicationStage).includes(body.stage)) {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
  }

  // Validate field lengths
  if (body.recruiterOwner && body.recruiterOwner.length > 100) {
    return NextResponse.json(
      { error: 'Recruiter owner must be at most 100 characters' },
      { status: 400 }
    )
  }
  if (body.interviewNotes && body.interviewNotes.length > 50000) {
    return NextResponse.json(
      { error: 'Interview notes must be at most 50000 characters' },
      { status: 400 }
    )
  }

  // Build update data
  const data: Record<string, unknown> = {}

  if (body.stage !== undefined) {
    data.stage = body.stage
    // Update stageUpdatedAt when stage changes
    if (body.stage !== existing.stage) {
      data.stageUpdatedAt = new Date()
    }
  }
  if (body.recruiterOwner !== undefined) {
    data.recruiterOwner = body.recruiterOwner?.trim() || null
  }
  if (body.interviewNotes !== undefined) {
    data.interviewNotes = body.interviewNotes?.trim() || null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields provided for update' },
      { status: 400 },
    )
  }

  const application = await prisma.application.update({
    where: { id },
    data,
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

  // Audit log
  await logAuditUpdate({
    userId: session.user.id ?? null,
    action: 'APPLICATION_UPDATED',
    entityType: 'Application',
    entityId: application.id,
    before: {
      stage: existing.stage,
      recruiterOwner: existing.recruiterOwner,
      interviewNotes: existing.interviewNotes,
    },
    after: {
      stage: application.stage,
      recruiterOwner: application.recruiterOwner,
      interviewNotes: application.interviewNotes,
    },
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
    return NextResponse.json({ error: 'Invalid application ID format' }, { status: 400 })
  }

  // Check application exists
  const existing = await prisma.application.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  await prisma.application.delete({ where: { id } })

  // Audit log
  await logAuditDelete({
    userId: session.user.id ?? null,
    action: 'APPLICATION_DELETED',
    entityType: 'Application',
    entityId: id,
    deleted: {
      jobId: existing.jobId,
      candidateId: existing.candidateId,
      stage: existing.stage,
      recruiterOwner: existing.recruiterOwner,
    },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true })
}
