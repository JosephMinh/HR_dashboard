'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowUpDown, Briefcase, ChevronDown, Plus } from 'lucide-react'

import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { FilterBar } from '@/components/ui/filter-bar'
import { TableSkeleton } from '@/components/ui/loading-skeleton'
import { SearchInput } from '@/components/ui/search-input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { JobStatusBadge, PipelineHealthBadge } from '@/components/ui/status-badge'
import { JOB_STATUS } from '@/lib/status-config'

interface JobSummary {
  id: string
  title: string
  department: string
  status: string
  pipelineHealth: string | null
  isCritical: boolean
  activeCandidateCount?: number
  openedAt: string | null
  targetFillDate: string | null
}

interface JobsResponse {
  jobs: JobSummary[]
  total: number
}

type SortField = 'title' | 'department' | 'status' | 'openedAt' | 'targetFillDate' | 'updatedAt'
type SortOrder = 'asc' | 'desc'

function formatDate(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

function toParam(values: string[]) {
  return values.length ? values.join(',') : ''
}

interface AllJobsTableProps {
  userCanMutate: boolean
}

export function AllJobsTable({ userCanMutate }: AllJobsTableProps) {
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
  const [sort, setSort] = useState<SortField>('updatedAt')
  const [order, setOrder] = useState<SortOrder>('desc')

  const departmentOptions = useMemo(() => {
    const unique = new Set(jobs.map((job) => job.department).filter(Boolean))
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [jobs])

  const toggleValue = (
    value: string,
    selected: string[],
    setter: (next: string[]) => void,
  ) => {
    if (selected.includes(value)) {
      setter(selected.filter((item) => item !== value))
    } else {
      setter([...selected, value])
    }
  }

  const clearFilters = () => {
    setSearch('')
    setSelectedStatuses([])
    setSelectedDepartments([])
    setSort('updatedAt')
    setOrder('desc')
  }

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (selectedStatuses.length) params.set('status', toParam(selectedStatuses))
    if (selectedDepartments.length) {
      params.set('department', toParam(selectedDepartments))
    }
    params.set('sort', sort)
    params.set('order', order)
    params.set('includeCount', 'true')

    try {
      const response = await fetch(`/api/jobs?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch jobs')
      }
      const data: JobsResponse = await response.json()
      setJobs(data.jobs)
      setTotal(data.total)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'An unexpected error occurred',
      )
    } finally {
      setLoading(false)
    }
  }, [search, selectedStatuses, selectedDepartments, sort, order])

  useEffect(() => {
    void fetchJobs()
  }, [fetchJobs])

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      setOrder(order === 'asc' ? 'desc' : 'asc')
      return
    }

    setSort(field)
    setOrder(field === 'updatedAt' ? 'desc' : 'asc')
  }

  const hasFilters =
    search.trim().length > 0 ||
    selectedStatuses.length > 0 ||
    selectedDepartments.length > 0

  if (error) {
    return <ErrorState message={error} onRetry={fetchJobs} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">All Jobs</h2>
        {userCanMutate ? (
          <Link href="/jobs/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="h-4 w-4 mr-2" />
            New Job
          </Link>
        ) : null}
      </div>

      <FilterBar showClearAll={hasFilters} onClearAll={clearFilters}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search jobs..."
          fullWidth={false}
          className="w-60"
        />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs">
            Status
            {selectedStatuses.length ? ` (${selectedStatuses.length})` : ''}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {Object.entries(JOB_STATUS).map(([key, config]) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={selectedStatuses.includes(key)}
                onCheckedChange={() =>
                  toggleValue(key, selectedStatuses, setSelectedStatuses)
                }
              >
                {config.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs">
            Department
            {selectedDepartments.length ? ` (${selectedDepartments.length})` : ''}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Filter by department</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {departmentOptions.length === 0 ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">
                No departments found
              </div>
            ) : (
              departmentOptions.map((department) => (
                <DropdownMenuCheckboxItem
                  key={department}
                  checked={selectedDepartments.includes(department)}
                  onCheckedChange={() =>
                    toggleValue(
                      department,
                      selectedDepartments,
                      setSelectedDepartments,
                    )
                  }
                >
                  {department}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </FilterBar>

      {loading ? (
        <TableSkeleton rows={6} columns={8} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No jobs found"
          description={
            hasFilters
              ? 'Try adjusting your filters'
              : 'Create your first job to get started'
          }
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[240px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('title')}
                    className="-ml-3"
                  >
                    Title
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('department')}
                    className="-ml-3"
                  >
                    Department
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('status')}
                    className="-ml-3"
                  >
                    Status
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">Critical</TableHead>
                <TableHead className="hidden lg:table-cell">Pipeline</TableHead>
                <TableHead className="text-center">Candidates</TableHead>
                <TableHead className="hidden md:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('openedAt')}
                    className="-ml-3"
                  >
                    Opened
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="hidden xl:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('targetFillDate')}
                    className="-ml-3"
                  >
                    Target Fill
                    <ArrowUpDown className="ml-1 h-3 w-3" />
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
                      {job.isCritical ? (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      ) : null}
                      {job.title}
                    </Link>
                    <div className="text-xs text-muted-foreground md:hidden">
                      {job.department}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">
                    {job.department}
                  </TableCell>
                  <TableCell>
                    <JobStatusBadge value={job.status} size="sm" />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {job.isCritical ? (
                      <span className="inline-flex items-center gap-1 text-sm text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                        Critical
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {job.pipelineHealth ? (
                      <PipelineHealthBadge value={job.pipelineHealth} size="sm" />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {job.activeCandidateCount ?? '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">
                    {formatDate(job.openedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden xl:table-cell">
                    {formatDate(job.targetFillDate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && jobs.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Showing {jobs.length} of {total} jobs
        </p>
      ) : null}
    </div>
  )
}
