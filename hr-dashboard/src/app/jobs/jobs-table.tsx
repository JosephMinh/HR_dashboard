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
import { CheckboxFilterPopover } from '@/components/ui/checkbox-filter-popover'
import {
  JOB_FILTER_MISSING_VALUE,
  JOB_VISIBLE_FILTER_DEFINITIONS,
  JOB_VISIBLE_FILTER_FIELDS,
  sortJobFilterSelectionValues,
  type JobFilterOption,
  type JobVisibleFilterField,
} from '@/lib/job-filter-constants'
import { cn } from '@/lib/utils'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useJobsQuery, useJobFilterOptionsQuery } from '@/hooks/queries'

const ITEMS_PER_PAGE = 20

interface JobsTableProps {
  userCanMutate?: boolean
}

export function JobsTable({ userCanMutate = false }: JobsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const filterValues = Object.fromEntries(
    JOB_VISIBLE_FILTER_FIELDS.map((field) => [field, searchParams.getAll(field)]),
  ) as Record<JobVisibleFilterField, string[]>

  const search = searchParams.get('search') || ''
  const sort = searchParams.get('sort') || 'updatedAt'
  const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc'
  const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  // Fetch filter dropdown options from server
  const { data: filterOptionsData, isLoading: isFilterOptionsLoading } = useJobFilterOptionsQuery()

  // Use TanStack Query for data fetching
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useJobsQuery({
    status: filterValues.status,
    pipelineHealth: filterValues.pipelineHealth,
    priority: filterValues.priority,
    department: filterValues.department,
    employeeType: filterValues.employeeType,
    location: filterValues.location,
    recruiterOwner: filterValues.recruiterOwner,
    functionalPriority: filterValues.functionalPriority,
    corporatePriority: filterValues.corporatePriority,
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

  const updateFilter = useCallback((
    field: string,
    values: string[],
    options: JobFilterOption[],
    missingValue: string,
  ) => {
    const params = new URLSearchParams(searchParams.toString())
    const sortedValues = sortJobFilterSelectionValues(values, options, missingValue)
    params.delete(field)
    for (const v of sortedValues) {
      params.append(field, v)
    }
    params.delete('page')
    router.replace(`/jobs?${params.toString()}`)
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

  const hasFilters =
    JOB_VISIBLE_FILTER_FIELDS.some((field) => filterValues[field].length > 0) ||
    Boolean(search.trim())

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
          {JOB_VISIBLE_FILTER_DEFINITIONS.map((definition) => {
            const options: JobFilterOption[] = 'options' in definition
              ? definition.options
              : (filterOptionsData?.options?.[definition.field] ?? [])
            const missingValue = filterOptionsData?.missingValue ?? JOB_FILTER_MISSING_VALUE

            return (
              <CheckboxFilterPopover
                key={definition.field}
                options={options}
                selected={filterValues[definition.field]}
                onChange={(values) => updateFilter(definition.field, values, options, missingValue)}
                triggerLabel={definition.allLabel}
                ariaLabel={definition.ariaLabel}
                widthClassName={definition.widthClassName}
                isLoading={definition.optionSource === 'server' && isFilterOptionsLoading}
                missingValue={missingValue}
                enableSearch={definition.enableLocalSearch}
              />
            )
          })}
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
