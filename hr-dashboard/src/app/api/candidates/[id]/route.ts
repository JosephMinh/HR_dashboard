import { NextRequest, NextResponse } from 'next/server'
import { CandidateSource } from '@/generated/prisma/client'

import { auth } from '@/lib/auth'
import { getClientIp, logAuditUpdate } from '@/lib/audit'
import { AuthorizationError, requireMutate } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  void request
  const { id } = await params

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      applications: {
        include: {
          job: {
            select: {
              id: true,
              title: true,
              department: true,
              status: true,
              priority: true,
              pipelineHealth: true,
              isCritical: true,
              targetFillDate: true,
            },
          },
        },
        orderBy: { stageUpdatedAt: 'desc' },
      },
    },
  })

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }

  return NextResponse.json({
    candidate: {
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      linkedinUrl: candidate.linkedinUrl,
      currentCompany: candidate.currentCompany,
      location: candidate.location,
      source: candidate.source,
      resumeKey: candidate.resumeKey,
      resumeName: candidate.resumeName,
      notes: candidate.notes,
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
      applications: candidate.applications.map((application) => ({
        id: application.id,
        stage: application.stage,
        recruiterOwner: application.recruiterOwner,
        interviewNotes: application.interviewNotes,
        stageUpdatedAt: application.stageUpdatedAt.toISOString(),
        createdAt: application.createdAt.toISOString(),
        updatedAt: application.updatedAt.toISOString(),
        job: {
          id: application.job.id,
          title: application.job.title,
          department: application.job.department,
          status: application.job.status,
          priority: application.job.priority,
          pipelineHealth: application.job.pipelineHealth,
          isCritical: application.job.isCritical,
          targetFillDate: application.job.targetFillDate?.toISOString() ?? null,
        },
      })),
    },
  })
}

interface UpdateCandidateInput {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  linkedinUrl?: string | null
  currentCompany?: string | null
  location?: string | null
  source?: CandidateSource | null
  resumeKey?: string | null
  resumeName?: string | null
  notes?: string | null
}

// Prisma-compatible update data (firstName/lastName cannot be null in DB)
interface PrismaUpdateData {
  firstName?: string
  lastName?: string
  email?: string | null
  phone?: string | null
  linkedinUrl?: string | null
  currentCompany?: string | null
  location?: string | null
  source?: CandidateSource | null
  resumeKey?: string | null
  resumeName?: string | null
  notes?: string | null
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function toCandidateBaseResponse(candidate: {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  currentCompany: string | null
  location: string | null
  source: string | null
  resumeKey: string | null
  resumeName: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    phone: candidate.phone,
    linkedinUrl: candidate.linkedinUrl,
    currentCompany: candidate.currentCompany,
    location: candidate.location,
    source: candidate.source,
    resumeKey: candidate.resumeKey,
    resumeName: candidate.resumeName,
    notes: candidate.notes,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
  }
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

  let body: UpdateCandidateInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const existing = await prisma.candidate.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }

  const data: PrismaUpdateData = {}

  if (body.firstName !== undefined) {
    if (!body.firstName?.trim()) {
      return NextResponse.json(
        { error: 'First name cannot be empty' },
        { status: 400 },
      )
    }
    data.firstName = body.firstName.trim()
  }

  if (body.lastName !== undefined) {
    if (!body.lastName?.trim()) {
      return NextResponse.json(
        { error: 'Last name cannot be empty' },
        { status: 400 },
      )
    }
    data.lastName = body.lastName.trim()
  }

  if (body.email !== undefined) {
    if (body.email && !isValidEmail(body.email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }
    data.email = body.email?.trim() || null
  }

  if (body.linkedinUrl !== undefined) {
    if (body.linkedinUrl) {
      try {
        new URL(body.linkedinUrl)
      } catch {
        return NextResponse.json(
          { error: 'Invalid LinkedIn URL' },
          { status: 400 },
        )
      }
    }
    data.linkedinUrl = body.linkedinUrl?.trim() || null
  }

  if (body.source !== undefined) {
    if (body.source !== null && !Object.values(CandidateSource).includes(body.source)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    }
    data.source = body.source ?? null
  }

  if (body.phone !== undefined) data.phone = body.phone?.trim() || null
  if (body.currentCompany !== undefined) data.currentCompany = body.currentCompany?.trim() || null
  if (body.location !== undefined) data.location = body.location?.trim() || null
  if (body.resumeKey !== undefined) data.resumeKey = body.resumeKey?.trim() || null
  if (body.resumeName !== undefined) data.resumeName = body.resumeName?.trim() || null
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields provided for update' },
      { status: 400 },
    )
  }

  const candidate = await prisma.candidate.update({
    where: { id },
    data,
  })

  await logAuditUpdate({
    userId: session.user.id ?? null,
    action: 'CANDIDATE_UPDATED',
    entityType: 'Candidate',
    entityId: candidate.id,
    before: toCandidateBaseResponse(existing),
    after: toCandidateBaseResponse(candidate),
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({
    candidate: toCandidateBaseResponse(candidate),
  })
}
