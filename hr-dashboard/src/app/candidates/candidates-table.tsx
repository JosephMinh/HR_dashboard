'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowUpDown, FileCheck2, FileX2, UserRoundSearch } from 'lucide-react'

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

interface Candidate {
  id: string
  firstName: string
  lastName: string
  email: string | null
  currentCompany: string | null
  location: string | null
  resumeKey: string | null
  resumeName: string | null
  updatedAt: string
  jobCount?: number
}

interface CandidatesResponse {
  candidates: Candidate[]
  total: number
}

type SortField = 'name' | 'email' | 'updatedAt'
type SortOrder = 'asc' | 'desc'

const ITEMS_PER_PAGE = 20

export function CandidatesTable() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const search = searchParams.get('search') || ''
  const sort = (searchParams.get('sort') || 'name') as SortField
  const order = (searchParams.get('order') || 'asc') as SortOrder
  const page = parseInt(searchParams.get('page') || '1', 10)

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

      router.push(`/candidates?${params.toString()}`)
    },
    [router, searchParams],
  )

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('sort', sort)
    params.set('order', order)
    params.set('includeJobCount', 'true')

    try {
      const response = await fetch(`/api/candidates?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch candidates')
      }

      const data: CandidatesResponse = await response.json()
      setCandidates(data.candidates)
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
  }, [search, sort, order])

  useEffect(() => {
    void fetchCandidates()
  }, [fetchCandidates])

  const toggleSort = (field: SortField) => {
    if (sort === field) {
      updateParams({ order: order === 'asc' ? 'desc' : 'asc' })
      return
    }

    updateParams({ sort: field, order: field === 'updatedAt' ? 'desc' : 'asc' })
  }

  const clearFilters = () => {
    router.push('/candidates')
  }

  const hasFilters = search.length > 0
  const startIndex = (page - 1) * ITEMS_PER_PAGE
  const paginatedCandidates = candidates.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  )
  const totalPages = Math.ceil(candidates.length / ITEMS_PER_PAGE)

  if (error) {
    return <ErrorState message={error} onRetry={fetchCandidates} />
  }

  return (
    <div className="space-y-4">
      <FilterBar showClearAll={hasFilters} onClearAll={clearFilters}>
        <SearchInput
          value={search}
          onChange={(value) => updateParams({ search: value })}
          placeholder="Search by name or email..."
          fullWidth={false}
          className="w-72"
        />
      </FilterBar>

      {loading ? (
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
        />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[240px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3"
                      onClick={() => toggleSort('name')}
                    >
                      Name
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3"
                      onClick={() => toggleSort('email')}
                    >
                      Email
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                  <TableHead>Current Company</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-center">Resume</TableHead>
                  <TableHead className="text-center">Jobs</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3"
                      onClick={() => toggleSort('updatedAt')}
                    >
                      Updated
                      <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCandidates.map((candidate) => (
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

          {totalPages > 1 ? (
            <p className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-
              {Math.min(startIndex + ITEMS_PER_PAGE, candidates.length)} of{' '}
              {total} candidates
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Showing {total} candidate{total === 1 ? '' : 's'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
