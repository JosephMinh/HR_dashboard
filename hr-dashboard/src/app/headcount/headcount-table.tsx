'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useHeadcountQuery } from '@/hooks/queries'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyStateSurface, ErrorStateSurface } from '@/components/ui/state-surface'
import { TableSkeleton } from '@/components/ui/loading-skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { HeadcountFilters } from '@/lib/query-keys'

const PAGE_SIZE = 25

export function HeadcountTable() {
  const [filters, setFilters] = useState<HeadcountFilters>({
    page: 1,
    pageSize: PAGE_SIZE,
    sort: 'department',
    order: 'asc',
  })

  const { data, isLoading, isError, error } = useHeadcountQuery(filters)

  if (isLoading) {
    return <TableSkeleton rows={10} columns={7} />
  }

  if (isError) {
    return <ErrorStateSurface error={error as Error & { status?: number }} message="Failed to load headcount projections" />
  }

  const projections = data?.data ?? []
  const pagination = data?.pagination ?? { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 }

  if (projections.length === 0 && !filters.department && !filters.level && !filters.matchedStatus) {
    return <EmptyStateSurface resource="headcount projections" />
  }

  // Summary stats
  const matched = projections.filter(p => p.matchedJob !== null).length
  const unmatched = projections.length - matched

  return (
    <div className="space-y-4">
      {/* Filters and summary */}
      <div className="flex flex-wrap items-center gap-4">
        <Select
          value={filters.matchedStatus ?? 'all'}
          onValueChange={(v) => setFilters(f => ({
            ...f,
            matchedStatus: v === 'all' ? undefined : v as 'matched' | 'unmatched',
            page: 1,
          }))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Match status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projections</SelectItem>
            <SelectItem value="matched">Matched to Job</SelectItem>
            <SelectItem value="unmatched">Unmatched</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-4 text-sm text-muted-foreground">
          <span>Total: <strong className="text-foreground">{pagination.total}</strong></span>
          <span>Matched: <strong className="text-foreground">{matched}</strong></span>
          <span>Unmatched: <strong className="text-foreground">{unmatched}</strong></span>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Department</TableHead>
            <TableHead>Employee / Title</TableHead>
            <TableHead>Level</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>Temp Job ID</TableHead>
            <TableHead>Matched Job</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projections.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.department}</TableCell>
              <TableCell>
                <div>
                  {p.employeeName && <span className="font-medium">{p.employeeName}</span>}
                  {p.employeeName && p.jobTitle && <span className="text-muted-foreground"> — </span>}
                  {p.jobTitle && <span className="text-muted-foreground">{p.jobTitle}</span>}
                  {!p.employeeName && !p.jobTitle && <span className="text-muted-foreground">—</span>}
                </div>
              </TableCell>
              <TableCell>{p.level ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">
                {p.startDate ? new Date(p.startDate).toLocaleDateString() : '—'}
              </TableCell>
              <TableCell className="tabular-nums">
                {p.tempJobId ?? '—'}
                {p.rawTempJobId && p.rawTempJobId !== String(p.tempJobId) && (
                  <span className="ml-1 text-xs text-muted-foreground" title={p.rawTempJobId}>*</span>
                )}
              </TableCell>
              <TableCell>
                {p.matchedJob ? (
                  <Link href={`/jobs/${p.matchedJob.id}`} className="text-primary hover:underline">
                    {p.matchedJob.title}
                  </Link>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Unmatched
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} projections)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) - 1 }))}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) + 1 }))}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
