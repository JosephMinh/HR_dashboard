import { NextRequest, NextResponse } from "next/server"

import { ApplicationStage, CandidateSource } from "@/generated/prisma/client"
import type { Prisma } from "@/generated/prisma/client"
import { auth } from "@/lib/auth"
import { getClientIp, logAuditCreate } from "@/lib/audit"
import { AuthorizationError, requireMutate } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"

type SortField = "name" | "email" | "updatedAt"
type SortOrder = "asc" | "desc"

function buildSearchWhere(search: string): Prisma.CandidateWhereInput {
  const normalizedSearch = search.trim()
  const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean)

  if (searchTerms.length >= 2) {
    const [firstNameTerm, ...rest] = searchTerms
    const lastNameTerm = rest.join(" ")

    return {
      OR: [
        {
          AND: [
            { firstName: { contains: firstNameTerm, mode: "insensitive" } },
            { lastName: { contains: lastNameTerm, mode: "insensitive" } },
          ],
        },
        { email: { contains: normalizedSearch, mode: "insensitive" } },
      ],
    }
  }

  return {
    OR: [
      { firstName: { contains: normalizedSearch, mode: "insensitive" } },
      { lastName: { contains: normalizedSearch, mode: "insensitive" } },
      { email: { contains: normalizedSearch, mode: "insensitive" } },
    ],
  }
}

function getOrderBy(
  sortField: SortField,
  sortOrder: SortOrder,
): Prisma.CandidateOrderByWithRelationInput[] {
  if (sortField === "email") {
    return [{ email: sortOrder }, { lastName: "asc" }, { firstName: "asc" }]
  }

  if (sortField === "updatedAt") {
    return [{ updatedAt: sortOrder }, { lastName: "asc" }, { firstName: "asc" }]
  }

  return [{ lastName: sortOrder }, { firstName: sortOrder }]
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  const search = searchParams.get("search")?.trim() || ""
  const sortParam = (searchParams.get("sort") || "name") as SortField
  const sortField: SortField = ["name", "email", "updatedAt"].includes(sortParam)
    ? sortParam
    : "name"
  const orderParam = searchParams.get("order")
  const sortOrder: SortOrder = orderParam === "desc" ? "desc" : "asc"
  const includeJobCount = searchParams.get("includeJobCount") === "true"

  const where: Prisma.CandidateWhereInput = search
    ? buildSearchWhere(search)
    : {}

  const orderBy = getOrderBy(sortField, sortOrder)

  const candidates = await prisma.candidate.findMany({
    where,
    orderBy,
    include: includeJobCount
      ? {
          _count: {
            select: {
              applications: true,
            },
          },
        }
      : undefined,
  })

  const total = await prisma.candidate.count({ where })

  return NextResponse.json({
    candidates: candidates.map((candidate) => ({
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
      ...(includeJobCount && "_count" in candidate
        ? { jobCount: (candidate as typeof candidate & { _count: { applications: number } })._count.applications }
        : {}),
    })),
    total,
  })
}

interface CreateCandidateInput {
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  linkedinUrl?: string | null
  currentCompany?: string | null
  location?: string | null
  source?: CandidateSource | null
  resumeKey?: string | null
  resumeName?: string | null
  notes?: string | null
  jobId?: string
}

function toCandidateResponse(candidate: {
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

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    requireMutate(session.user.role)
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  let body: CreateCandidateInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.firstName?.trim()) {
    return NextResponse.json({ error: "First name is required" }, { status: 400 })
  }
  if (!body.lastName?.trim()) {
    return NextResponse.json({ error: "Last name is required" }, { status: 400 })
  }
  if (body.source && !Object.values(CandidateSource).includes(body.source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 })
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
  }
  if (body.linkedinUrl) {
    try {
      new URL(body.linkedinUrl)
    } catch {
      return NextResponse.json({ error: "Invalid LinkedIn URL" }, { status: 400 })
    }
  }

  const { jobId, resumeKey = null, resumeName = null } = body
  const candidateData = {
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    linkedinUrl: body.linkedinUrl?.trim() || null,
    currentCompany: body.currentCompany?.trim() || null,
    location: body.location?.trim() || null,
    source: body.source ?? null,
    notes: body.notes?.trim() || null,
    resumeKey,
    resumeName,
  }

  if (jobId) {
    const linkedJob = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true },
    })

    if (!linkedJob) {
      return NextResponse.json({ error: "Job not found" }, { status: 400 })
    }
  }

  const candidate = await prisma.candidate.create({
    data: candidateData,
  })

  if (jobId) {
    await prisma.application.create({
      data: {
        jobId,
        candidateId: candidate.id,
        stage: ApplicationStage.NEW,
        recruiterOwner: session.user.name ?? null,
      },
    })
  }

  const ipAddress = getClientIp(request)
  await logAuditCreate({
    userId: session.user.id ?? null,
    action: "CANDIDATE_CREATED",
    entityType: "Candidate",
    entityId: candidate.id,
    created: {
      ...candidateData,
      jobId: jobId ?? null,
    },
    ipAddress,
  })

  return NextResponse.json(
    {
      candidate: toCandidateResponse(candidate),
      ...(jobId ? { linkedJobId: jobId } : {}),
    },
    { status: 201 },
  )
}
