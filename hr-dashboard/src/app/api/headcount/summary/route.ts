import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/headcount/summary
 *
 * Aggregates monthlyFte values by department for headcount chart rendering.
 * Returns department-level monthly totals to avoid sending hundreds of raw
 * records to the client.
 *
 * monthlyFte is a JSON object with ISO month keys: { "2024-01": 1.0, "2024-02": 0.5, ... }
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const departmentParam = searchParams.get('department')

  // Build optional department filter
  const where: Record<string, unknown> = {}
  if (departmentParam) {
    const values = departmentParam.split(',').map(v => v.trim()).filter(Boolean)
    if (values.length === 1) {
      where.department = values[0]
    } else if (values.length > 1) {
      where.department = { in: values }
    }
  }

  // Fetch all projections (lightweight — only need department + monthlyFte)
  const projections = await prisma.headcountProjection.findMany({
    where,
    select: {
      department: true,
      monthlyFte: true,
    },
  })

  // Aggregate by department
  const monthSet = new Set<string>()
  const deptTotals = new Map<string, Record<string, number>>()

  for (const p of projections) {
    const fte = p.monthlyFte as Record<string, number> | null
    if (!fte || typeof fte !== 'object') continue

    let totals = deptTotals.get(p.department)
    if (!totals) {
      totals = {}
      deptTotals.set(p.department, totals)
    }

    for (const [month, value] of Object.entries(fte)) {
      const numValue = typeof value === 'number' ? value : parseFloat(String(value))
      if (Number.isNaN(numValue)) continue

      monthSet.add(month)
      totals[month] = (totals[month] ?? 0) + numValue
    }
  }

  // Sort months chronologically
  const months = [...monthSet].sort()
  const departments = [...deptTotals.keys()].sort()

  return NextResponse.json({
    departments,
    months,
    data: departments.map(dept => ({
      department: dept,
      monthlyTotals: deptTotals.get(dept) ?? {},
    })),
  })
}
