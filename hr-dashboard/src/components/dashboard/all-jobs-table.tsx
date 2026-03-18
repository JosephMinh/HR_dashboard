'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Briefcase, ChevronDown, Plus } from 'lucide-react'
import type { ColumnDef, PaginationState, SortingState } from '@tanstack/react-table'

import { buttonVariants } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { FilterBar } from '@/components/ui/filter-bar'
import { SearchInput } from '@/components/ui/search-input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { JobStatusBadge, PipelineHealthBadge } from '@/components/ui/status-badge'
import { JOB_STATUS } from '@/lib/status-config'
import { useJobsQuery, type Job } from '@/hooks/queries'

type SortField = 'title' | 'department' | 'status' | 'openedAt' | 'targetFillDate' | 'updatedAt'
const ITEMS_PER_PAGE = 20
const DEFAULT_SORTING: SortingState = [{ id: 'updatedAt', desc: true }]

function formatDate(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

// Column definitions for TanStack Table
const columns: ColumnDef<Job>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
    enableSorting: false,
    cell: ({ row }) => (
      <>
        <Link
          href={`/jobs/${row.original.id}`}
          className="font-medium hover:underline flex items-center gap-2"
        >
          {row.original.title}
        </Link>
        <div className="text-xs text-muted-foreground md:hidden">
          {row.original.department}
        </div>
      </>
    ),
    meta: { headerClassName: 'w-[240px]' },
  },
  {
    accessorKey: 'department',
    header: 'Department',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.department}</span>
    ),
    meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => <JobStatusBadge value={row.original.status} size="sm" />,
  },
  {
    id: 'critical',
    header: 'Critical',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.isCritical ? (
        <span className="text-sm text-red-600">
          Critical
        </span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
    meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
  },
  {
    id: 'pipelineHealth',
    header: 'Pipeline',
    enableSorting: false,
    cell: ({ row }) =>
      row.original.pipelineHealth ? (
        <PipelineHealthBadge value={row.original.pipelineHealth} size="sm" />
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
    meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell' },
  },
  {
    id: 'candidateCount',
    header: 'Candidates',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-center block">{row.original.activeCandidateCount ?? '-'}</span>
    ),
    meta: { headerClassName: 'text-center', cellClassName: 'text-center' },
  },
  {
    accessorKey: 'openedAt',
    header: 'Opened',
    enableSorting: true,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatDate(row.original.openedAt)}</span>
    ),
    meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
  },
  {
    accessorKey: 'targetFillDate',
    header: 'Target Fill',
    enableSorting: true,
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatDate(row.original.targetFillDate)}</span>
    ),
    meta: { headerClassName: 'hidden xl:table-cell', cellClassName: 'hidden xl:table-cell' },
  },
]

interface AllJobsTableProps {
  userCanMutate: boolean
}

export function AllJobsTable({ userCanMutate }: AllJobsTableProps) {
  // Local filter state (dashboard doesn't use URL params)
  const [search, setSearch] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ITEMS_PER_PAGE,
  })

  // Derive sort field and order from sorting state
  const sortField: SortField = (sorting[0]?.id as SortField | undefined) ?? 'updatedAt'
  const sortOrder = sorting[0]?.desc ? 'desc' : 'asc'

  // Use TanStack Query for data fetching
  const { data, isLoading, isFetching, error, refetch } = useJobsQuery({
    search: search.trim() || undefined,
    status: selectedStatuses.length > 0 ? selectedStatuses.join(',') : undefined,
    department: selectedDepartments.length > 0 ? selectedDepartments : undefined,
    sort: sortField,
    order: sortOrder,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    includeCount: true,
  })

  const jobs = data?.jobs ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 0

  const departmentOptions = useMemo(() => {
    const jobList = data?.jobs ?? []
    const unique = new Set(jobList.map((job) => job.department).filter(Boolean))
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [data?.jobs])

  const resetToFirstPage = () => {
    setPagination((current) => ({
      ...current,
      pageIndex: 0,
    }))
  }

  const toggleValue = (value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    resetToFirstPage()
    setter((selected) =>
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    )
  }

  const clearFilters = () => {
    setSearch('')
    setSelectedStatuses([])
    setSelectedDepartments([])
    setSorting(DEFAULT_SORTING)
    setPagination({
      pageIndex: 0,
      pageSize: ITEMS_PER_PAGE,
    })
  }

  const handleSortingChange = (
    updater: SortingState | ((current: SortingState) => SortingState),
  ) => {
    setSorting((current) => {
      const nextSorting = typeof updater === 'function' ? updater(current) : updater
      // Backend supports a single sort field only.
      const primarySort = nextSorting[0]
      if (primarySort === undefined) {
        return []
      }
      return [primarySort]
    })
    resetToFirstPage()
  }

  const hasFilters =
    search.trim().length > 0 ||
    selectedStatuses.length > 0 ||
    selectedDepartments.length > 0

  if (error) {
    return <ErrorState message={error.message} onRetry={() => void refetch()} />
  }

  return (
    <div className="space-y-4">
      {/* Header with premium styling and clear view-all path */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">All Jobs</h2>
          <Link
            href="/jobs"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View full list →
          </Link>
        </div>
        {userCanMutate ? (
          <Link href="/jobs/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="h-4 w-4 mr-2" />
            New Job
          </Link>
        ) : null}
      </div>

      {/* Filter bar matching list workspace contract patterns */}
      <FilterBar
        showClearAll={hasFilters}
        onClearAll={clearFilters}
        className="flex-col justify-between gap-2 sm:flex-row sm:items-center sm:gap-4"
      >
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            resetToFirstPage()
          }}
          placeholder="Search jobs..."
          fullWidth={false}
          className="w-72"
        />

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs hover:bg-muted/50 transition-colors">
            Status
            {selectedStatuses.length ? ` (${selectedStatuses.length})` : ''}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Filter by status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(JOB_STATUS).map(([key, config]) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={selectedStatuses.includes(key)}
                  onCheckedChange={() =>
                    toggleValue(key, setSelectedStatuses)
                  }
                >
                  {config.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs hover:bg-muted/50 transition-colors">
            Department
            {selectedDepartments.length ? ` (${selectedDepartments.length})` : ''}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
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
                      toggleValue(department, setSelectedDepartments)
                    }
                  >
                    {department}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </FilterBar>

      {/* Table with premium container styling and responsive scroll */}
      {jobs.length === 0 && !isLoading ? (
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
        <DataTable
          columns={columns}
          data={jobs}
          sorting={sorting}
          onSortingChange={handleSortingChange}
          pagination={pagination}
          onPaginationChange={setPagination}
          pageCount={totalPages}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyMessage="No jobs found"
          totalCount={total}
          entityLabel="jobs"
        />
      )}
    </div>
  )
}
