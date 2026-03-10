'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, FileCheck2, FileX2, UserRoundSearch } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
import { useCandidatesQuery } from '@/hooks/queries'

type SortField = 'name' | 'email' | 'updatedAt'
type SortOrder = 'asc' | 'desc'

const ITEMS_PER_PAGE = 20

interface CandidatesTableProps {
  userCanMutate?: boolean
}

export function CandidatesTable({ userCanMutate = false }: CandidatesTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const search = searchParams.get('search') || ''
  const sort = (searchParams.get('sort') || 'name') as SortField
  const order = (searchParams.get('order') || 'asc') as SortOrder
  const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  // Use TanStack Query for data fetching
  const { data, isLoading, error, refetch } = useCandidatesQuery({
    search: search || undefined,
    sort,
    order,
    page,
    limit: ITEMS_PER_PAGE,
    includeJobCount: true,
  })

  const candidates = data?.candidates ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())

      Object.entries(updates).forEach(([key, value]) => {
        if (!value) {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      })

      if (!('page' in updates)) {
        params.delete('page')
      }

      const nextUrl = `/candidates?${params.toString()}`
      if ('page' in updates) {
        router.push(nextUrl)
        return
      }
      router.replace(nextUrl)
    },
    [router, searchParams],
  )

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      updateParams({ order: order === 'asc' ? 'desc' : 'asc' })
      return
    }

    updateParams({ sort: field, order: field === 'updatedAt' ? 'desc' : 'asc' })
  }

  const getSortIcon = (field: SortField) => {
    if (sort !== field) return <ArrowUpDown className="ml-1 h-3 w-3" />
    return order === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />
  }

  const getAriaSort = (field: SortField): 'ascending' | 'descending' | 'none' => {
    if (sort !== field) return 'none'
    return order === 'asc' ? 'ascending' : 'descending'
  }

  const clearFilters = () => {
    router.push('/candidates')
  }

  const hasFilters = search.length > 0

  // Calculate display range for pagination info
  const startIndex = (page - 1) * ITEMS_PER_PAGE

  if (error) {
    return <ErrorState message={error.message} onRetry={() => void refetch()} />
  }

  return (
    <div className="space-y-4">
      <FilterBar showClearAll={hasFilters} onClearAll={clearFilters} className="justify-between">
        <SearchInput
          value={search}
          onChange={(value) => updateParams({ search: value })}
          placeholder="Search by name or email..."
          fullWidth={false}
          className="w-72"
        />
      </FilterBar>

      {isLoading ? (
        <TableSkeleton rows={8} columns={7} />
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={UserRoundSearch}
          title="No candidates found"
          description={
            hasFilters
              ? 'Try a different search term.'
              : 'Candidates will appear here once added.'
          }
          action={!hasFilters && userCanMutate ? {
            label: 'Create Candidate',
            onClick: () => router.push('/candidates/new'),
          } : undefined}
        />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[240px]" aria-sort={getAriaSort('name')}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3"
                      onClick={() => toggleSort('name')}
                    >
                      Name
                      {getSortIcon('name')}
                    </Button>
                  </TableHead>
                  <TableHead aria-sort={getAriaSort('email')}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3"
                      onClick={() => toggleSort('email')}
                    >
                      Email
                      {getSortIcon('email')}
                    </Button>
                  </TableHead>
                  <TableHead>Current Company</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-center">Resume</TableHead>
                  <TableHead className="text-center">Jobs</TableHead>
                  <TableHead aria-sort={getAriaSort('updatedAt')}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3"
                      onClick={() => toggleSort('updatedAt')}
                    >
                      Updated
                      {getSortIcon('updatedAt')}
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell>
                      <Link
                        href={`/candidates/${candidate.id}`}
                        className="font-medium hover:underline"
                      >
                        {candidate.firstName} {candidate.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {candidate.email ?? '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {candidate.currentCompany ?? '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {candidate.location ?? '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {candidate.resumeKey || candidate.resumeName ? (
                        <FileCheck2
                          className="mx-auto h-4 w-4 text-emerald-600"
                          aria-label="Resume uploaded"
                        />
                      ) : (
                        <FileX2
                          className="mx-auto h-4 w-4 text-muted-foreground"
                          aria-label="No resume"
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {candidate.jobCount ?? '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(candidate.updatedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-
              {Math.min(startIndex + ITEMS_PER_PAGE, total)} of{' '}
              {total} candidates
            </p>
            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateParams({ page: String(page - 1) })}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
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
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
