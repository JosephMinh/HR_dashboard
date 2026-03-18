'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import { FilterBar } from '@/components/ui/filter-bar'
import { JobStatusBadge, PipelineHealthBadge, JobPriorityBadge } from '@/components/ui/status-badge'
import { TableSkeleton } from '@/components/ui/loading-skeleton'
import { EmptyStateSurface, ErrorStateSurface } from '@/components/ui/state-surface'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { JOB_STATUS, JOB_PRIORITY, PIPELINE_HEALTH } from '@/lib/status-config'
import { cn } from '@/lib/utils'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useJobsQuery } from '@/hooks/queries'

const ITEMS_PER_PAGE = 20

interface JobsTableProps {
  userCanMutate?: boolean
}

export function JobsTable({ userCanMutate = false }: JobsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Filter state from URL params
  const status = searchParams.get('status') || ''
  const pipelineHealth = searchParams.get('pipelineHealth') || ''
  const priority = searchParams.get('priority') || ''
  const search = searchParams.get('search') || ''
  const sort = searchParams.get('sort') || 'updatedAt'
  const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc'
  const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  // Use TanStack Query for data fetching
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useJobsQuery({
    status: status || undefined,
    pipelineHealth: pipelineHealth || undefined,
    priority: priority || undefined,
    search: search || undefined,
    sort,
    order,
    page,
    limit: ITEMS_PER_PAGE,
    includeCount: true,
  })

  // Show subtle loading state during background refetches
  const isRefetching = isFetching && isPlaceholderData

  const jobs = data?.jobs ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    // Reset to page 1 when filters change
    if (!('page' in updates)) {
      params.delete('page')
    }
    const nextUrl = `/jobs?${params.toString()}`
    if ('page' in updates) {
      router.push(nextUrl)
      return
    }
    router.replace(nextUrl)
  }, [router, searchParams])

  const toggleSort = (field: string) => {
    if (sort === field) {
      updateParams({ order: order === 'asc' ? 'desc' : 'asc' })
    } else {
      updateParams({ sort: field, order: 'desc' })
    }
  }

  const getSortIcon = (field: string) => {
    if (sort !== field) return <ArrowUpDown className="ml-1 h-3 w-3" aria-hidden="true" />
    return order === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3" aria-hidden="true" />
      : <ArrowDown className="ml-1 h-3 w-3" aria-hidden="true" />
  }

  const getAriaSort = (field: string): 'ascending' | 'descending' | 'none' => {
    if (sort !== field) return 'none'
    return order === 'asc' ? 'ascending' : 'descending'
  }

  const clearFilters = () => {
    router.push('/jobs')
  }

  const hasFilters = status || pipelineHealth || priority || search.trim()

  // Calculate display range for pagination info
  const startIndex = (page - 1) * ITEMS_PER_PAGE

  if (error) {
    return <ErrorStateSurface error={error} onRetry={() => void refetch()} />
  }

  return (
    <div className="space-y-4">
      <FilterBar showClearAll={!!hasFilters} onClearAll={clearFilters} className="flex-wrap gap-3">
        <SearchInput
          value={search}
          onChange={(value) => updateParams({ search: value })}
          placeholder="Search jobs..."
          fullWidth={false}
          className="w-72"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={status}
            onValueChange={(value) => updateParams({ status: value })}
          >
            <SelectTrigger className="w-40" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              {Object.entries(JOB_STATUS).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={priority || 'ALL'}
            onValueChange={(value) => updateParams({ priority: value === 'ALL' ? '' : value })}
          >
            <SelectTrigger className="w-32" aria-label="Filter by priority">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Jobs</SelectItem>
              {Object.entries(JOB_PRIORITY).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={pipelineHealth}
            onValueChange={(value) => updateParams({ pipelineHealth: value })}
          >
            <SelectTrigger className="w-36" aria-label="Filter by pipeline health">
              <SelectValue placeholder="Pipeline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Pipelines</SelectItem>
              {Object.entries(PIPELINE_HEALTH).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      {isLoading ? (
        <TableSkeleton rows={8} columns={7} />
      ) : jobs.length === 0 ? (
        <EmptyStateSurface
          resource="jobs"
          hasFilters={!!hasFilters}
          hasSearch={!!search}
          searchQuery={search}
          onClearFilters={clearFilters}
          onCreate={userCanMutate ? () => router.push('/jobs/new') : undefined}
          createLabel="Create Job"
        />
      ) : (
        <>
          <div className={cn(
            "overflow-auto rounded-lg border shadow-premium-sm transition-opacity duration-150",
            isRefetching && "opacity-60"
          )}>
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead className="text-center">Candidates</TableHead>
                  <TableHead aria-sort={getAriaSort('targetFillDate')}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSort('targetFillDate')}
                      className="-ml-3"
                      aria-label={
                        sort === 'targetFillDate'
                          ? `Sorted by target date, ${order}. Activate to change sort order.`
                          : 'Sort by target date'
                      }
                    >
                      Target Date
                      {getSortIcon('targetFillDate')}
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Link
                        href={`/jobs/${job.id}`}
                        className="font-medium hover:underline flex items-center gap-2"
                      >
                        {job.isCritical && (
                          <span className="inline-block h-2 w-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
                        )}
                        {job.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {job.department}
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge value={job.status} size="sm" />
                    </TableCell>
                    <TableCell>
                      <JobPriorityBadge value={job.priority} size="sm" />
                    </TableCell>
                    <TableCell>
                      {job.pipelineHealth ? (
                        <PipelineHealthBadge value={job.pipelineHealth} size="sm" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {job.activeCandidateCount ?? '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {job.targetFillDate
                        ? new Date(job.targetFillDate).toLocaleDateString()
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, total)} of {total} jobs
            </p>
            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateParams({ page: String(page - 1) })}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Previous
                </Button>
                <span className="min-w-20 text-center text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateParams({ page: String(page + 1) })}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
