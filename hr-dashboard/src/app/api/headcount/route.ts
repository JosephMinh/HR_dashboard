import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

type SortField = 'department' | 'level' | 'employeeName' | 'sourceRow'
type SortOrder = 'asc' | 'desc'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  // Parse pagination parameters
  const pageParam = searchParams.get('page')
  const pageSizeParam = searchParams.get('pageSize')

  let page = 1
  if (pageParam !== null) {
    const parsed = parseInt(pageParam, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      return NextResponse.json({ error: 'Invalid page parameter: must be a positive integer' }, { status: 400 })
    }
    page = parsed
  }

  let pageSize = 20
  if (pageSizeParam !== null) {
    const parsed = parseInt(pageSizeParam, 10)
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 100) {
      return NextResponse.json({ error: 'Invalid pageSize parameter: must be between 1 and 100' }, { status: 400 })
    }
    pageSize = parsed
  }

  // Parse filter parameters
  const departmentParam = searchParams.get('department')
  const levelParam = searchParams.get('level')
  const matchedStatusParam = searchParams.get('matchedStatus')

  // Parse sort parameters
  const sortParam = searchParams.get('sort') as SortField | null
  const allowedSortFields: SortField[] = ['department', 'level', 'employeeName', 'sourceRow']
  const sortField: SortField = sortParam && allowedSortFields.includes(sortParam) ? sortParam : 'sourceRow'
  const orderParam = searchParams.get('order') as SortOrder | null
  const sortOrder: SortOrder = orderParam === 'asc' || orderParam === 'desc' ? orderParam : 'asc'

  // Build where clause
  const where: Prisma.HeadcountProjectionWhereInput = {}

  if (departmentParam) {
    const values = departmentParam.split(',').map(v => v.trim()).filter(Boolean)
    if (values.length === 1) {
      where.department = values[0]
    } else if (values.length > 1) {
      where.department = { in: values }
    }
  }

  if (levelParam) {
    const values = levelParam.split(',').map(v => v.trim()).filter(Boolean)
    if (values.length === 1) {
      where.level = values[0]
    } else if (values.length > 1) {
      where.level = { in: values }
    }
  }

  if (matchedStatusParam === 'matched') {
    where.matchedJobId = { not: null }
  } else if (matchedStatusParam === 'unmatched') {
    where.matchedJobId = null
  }

  // Build orderBy
  const orderBy: Prisma.HeadcountProjectionOrderByWithRelationInput = { [sortField]: sortOrder }

  // Execute query
  const [projections, total] = await Promise.all([
    prisma.headcountProjection.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        matchedJob: {
          select: { id: true, title: true, department: true, status: true },
        },
      },
    }),
    prisma.headcountProjection.count({ where }),
  ])

  return NextResponse.json({
    data: projections.map(p => ({
      id: p.id,
      importKey: p.importKey,
      sourceRow: p.sourceRow,
      tempJobId: p.tempJobId,
      rawTempJobId: p.rawTempJobId,
      matchedJobId: p.matchedJobId,
      department: p.department,
      employeeName: p.employeeName,
      level: p.level,
      jobTitle: p.jobTitle,
      startDate: p.startDate?.toISOString() ?? null,
      monthlyFte: p.monthlyFte,
      createdAt: p.createdAt.toISOString(),
      matchedJob: p.matchedJob
        ? { id: p.matchedJob.id, title: p.matchedJob.title, department: p.matchedJob.department, status: p.matchedJob.status }
        : null,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}
