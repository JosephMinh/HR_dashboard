import { NextRequest, NextResponse } from "next/server"

import { ApplicationStage, CandidateSource, Prisma } from "@/generated/prisma/client"
import { auth } from "@/lib/auth"
import { getClientIp, logAuditCreate } from "@/lib/audit"
import { AuthorizationError, requireMutate } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { isValidResumeKey } from "@/lib/storage"
import { isValidEmail } from "@/lib/validations"

type SortField = "name" | "email" | "updatedAt"
type SortOrder = "asc" | "desc"

function getPrismaErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null
  }
  const maybeCode = (error as { code?: unknown }).code
  return typeof maybeCode === "string" ? maybeCode : null
}

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

  // Parse pagination parameters
  const pageParam = searchParams.get("page")
  const pageSizeParam = searchParams.get("pageSize")

  // Validate and parse page (1-indexed, defaults to 1)
  let page = 1
  if (pageParam !== null) {
    const parsed = parseInt(pageParam, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      return NextResponse.json(
        { error: "Invalid page parameter: must be a positive integer" },
        { status: 400 }
      )
    }
    page = parsed
  }

  // Validate and parse pageSize (defaults to 20, max 100)
  let pageSize = 20
  if (pageSizeParam !== null) {
    const parsed = parseInt(pageSizeParam, 10)
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
      return NextResponse.json(
        { error: "Invalid pageSize parameter: must be between 1 and 100" },
        { status: 400 }
      )
    }
    pageSize = parsed
  }

  // Limit search length to prevent performance issues with very long queries
  const search = searchParams.get("search")?.trim().slice(0, 200) || ""
  const sortParam = searchParams.get("sort")
  const allowedSortFields: SortField[] = ["name", "email", "updatedAt"]
  if (sortParam !== null && !allowedSortFields.includes(sortParam as SortField)) {
    return NextResponse.json(
      { error: `Invalid sort parameter: must be one of ${allowedSortFields.join(", ")}` },
      { status: 400 }
    )
  }
  const sortField: SortField =
    sortParam !== null && allowedSortFields.includes(sortParam as SortField)
      ? (sortParam as SortField)
      : "name"
  const orderParam = searchParams.get("order")
  if (orderParam !== null && orderParam !== "asc" && orderParam !== "desc") {
    return NextResponse.json(
      { error: 'Invalid order parameter: must be "asc" or "desc"' },
      { status: 400 }
    )
  }
  const sortOrder: SortOrder = orderParam === "desc" ? "desc" : "asc"
  const includeJobCount = searchParams.get("includeJobCount") === "true"

  const where: Prisma.CandidateWhereInput = search
    ? buildSearchWhere(search)
    : {}

  const orderBy = getOrderBy(sortField, sortOrder)

  // Count total first (for pagination metadata)
  const total = await prisma.candidate.count({ where })
  const totalPages = Math.ceil(total / pageSize)

  // Calculate skip for pagination
  const skip = (page - 1) * pageSize

  const candidates = await prisma.candidate.findMany({
    where,
    orderBy,
    skip,
    take: pageSize,
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
    page,
    pageSize,
    totalPages,
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

  // Validate required fields with length constraints
  const firstName = body.firstName?.trim()
  if (!firstName) {
    return NextResponse.json({ error: "First name is required" }, { status: 400 })
  }
  if (firstName.length > 100) {
    return NextResponse.json({ error: "First name must be at most 100 characters" }, { status: 400 })
  }

  const lastName = body.lastName?.trim()
  if (!lastName) {
    return NextResponse.json({ error: "Last name is required" }, { status: 400 })
  }
  if (lastName.length > 100) {
    return NextResponse.json({ error: "Last name must be at most 100 characters" }, { status: 400 })
  }

  if (body.source && !Object.values(CandidateSource).includes(body.source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 })
  }
  if (body.email && !isValidEmail(body.email.trim())) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
  }
  if (body.linkedinUrl) {
    try {
      const url = new URL(body.linkedinUrl)
      // Validate that it's a LinkedIn URL - accept main domain and country-specific subdomains
      // Examples: linkedin.com, www.linkedin.com, in.linkedin.com, uk.linkedin.com
      const hostname = url.hostname.toLowerCase()
      const isLinkedIn = hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')
      if (!isLinkedIn) {
        return NextResponse.json({ error: "URL must be a LinkedIn profile" }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: "Invalid LinkedIn URL" }, { status: 400 })
    }
  }
  if (body.notes && body.notes.length > 10000) {
    return NextResponse.json({ error: "Notes must be at most 10000 characters" }, { status: 400 })
  }

  const { jobId } = body
  const resumeKey = body.resumeKey?.trim() || null
  const resumeName = body.resumeName?.trim() || null

  if (resumeKey && !isValidResumeKey(resumeKey)) {
    return NextResponse.json(
      { error: "Invalid resume key format" },
      { status: 400 },
    )
  }

  if ((resumeKey && !resumeName) || (!resumeKey && resumeName)) {
    return NextResponse.json(
      { error: "resumeKey and resumeName must be provided together" },
      { status: 400 },
    )
  }

  const candidateData = {
    firstName,
    lastName,
    email: body.email?.trim().toLowerCase() || null,
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

  let candidate
  try {
    candidate = await prisma.$transaction(async (tx) => {
      const createdCandidate = await tx.candidate.create({
        data: candidateData,
      })

      if (jobId) {
        await tx.application.create({
          data: {
            jobId,
            candidateId: createdCandidate.id,
            stage: ApplicationStage.NEW,
            recruiterOwner: session.user.name ?? null,
          },
        })
      }

      return createdCandidate
    })
  } catch (error) {
    const code = getPrismaErrorCode(error)
    if (code === "P2003") {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 400 },
      )
    }
    throw error
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
