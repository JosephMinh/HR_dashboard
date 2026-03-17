import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

type SortField = 'sourceLevel' | 'targetLevel' | 'levelDifference' | 'sourceRow'
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
  const rowTypeParam = searchParams.get('rowType')
  const statusParam = searchParams.get('status')
  const sourceDepartmentParam = searchParams.get('sourceDepartment')
  const targetDepartmentParam = searchParams.get('targetDepartment')

  // Parse sort parameters
  const sortParam = searchParams.get('sort') as SortField | null
  const allowedSortFields: SortField[] = ['sourceLevel', 'targetLevel', 'levelDifference', 'sourceRow']
  const sortField: SortField = sortParam && allowedSortFields.includes(sortParam) ? sortParam : 'sourceRow'
  const orderParam = searchParams.get('order') as SortOrder | null
  const sortOrder: SortOrder = orderParam === 'asc' || orderParam === 'desc' ? orderParam : 'asc'

  // Build where clause
  const where: Prisma.TradeoffWhereInput = {}

  if (rowTypeParam) {
    const values = rowTypeParam.split(',').map(v => v.trim()).filter(Boolean)
    if (values.length === 1) {
      where.rowType = values[0]
    } else if (values.length > 1) {
      where.rowType = { in: values }
    }
  }

  if (statusParam) {
    const values = statusParam.split(',').map(v => v.trim()).filter(Boolean)
    if (values.length === 1) {
      where.status = values[0]
    } else if (values.length > 1) {
      where.status = { in: values }
    }
  }

  if (sourceDepartmentParam) {
    const values = sourceDepartmentParam.split(',').map(v => v.trim()).filter(Boolean)
    if (values.length === 1) {
      where.sourceDepartment = values[0]
    } else if (values.length > 1) {
      where.sourceDepartment = { in: values }
    }
  }

  if (targetDepartmentParam) {
    const values = targetDepartmentParam.split(',').map(v => v.trim()).filter(Boolean)
    if (values.length === 1) {
      where.targetDepartment = values[0]
    } else if (values.length > 1) {
      where.targetDepartment = { in: values }
    }
  }

  // Build orderBy
  const orderBy: Prisma.TradeoffOrderByWithRelationInput = { [sortField]: sortOrder }

  // Execute query
  const [tradeoffs, total] = await Promise.all([
    prisma.tradeoff.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        sourceJob: {
          select: { id: true, title: true, department: true, status: true },
        },
        targetJob: {
          select: { id: true, title: true, department: true, status: true },
        },
      },
    }),
    prisma.tradeoff.count({ where }),
  ])

  return NextResponse.json({
    data: tradeoffs.map(t => ({
      id: t.id,
      importKey: t.importKey,
      sourceRow: t.sourceRow,
      rowType: t.rowType,
      sourceTempJobId: t.sourceTempJobId,
      sourceJobId: t.sourceJobId,
      sourceDepartment: t.sourceDepartment,
      sourceLevel: t.sourceLevel,
      sourceTitle: t.sourceTitle,
      targetTempJobId: t.targetTempJobId,
      targetJobId: t.targetJobId,
      targetDepartment: t.targetDepartment,
      targetLevel: t.targetLevel,
      targetTitle: t.targetTitle,
      levelDifference: t.levelDifference,
      status: t.status,
      notes: t.notes,
      createdAt: t.createdAt.toISOString(),
      sourceJob: t.sourceJob
        ? { id: t.sourceJob.id, title: t.sourceJob.title, department: t.sourceJob.department, status: t.sourceJob.status }
        : null,
      targetJob: t.targetJob
        ? { id: t.targetJob.id, title: t.targetJob.title, department: t.targetJob.department, status: t.targetJob.status }
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
