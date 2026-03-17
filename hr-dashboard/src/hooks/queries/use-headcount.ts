/**
 * Headcount Projections Query Hooks
 *
 * TanStack Query hooks for headcount projection data fetching.
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, buildUrl, createRetryPolicy } from '@/lib/api-client'
import { queryCachePolicy, queryKeys, type HeadcountFilters } from '@/lib/query-keys'

// Types
export interface HeadcountJobSummary {
  id: string
  title: string
  department: string
  status: string
}

export interface HeadcountProjection {
  id: string
  importKey: string
  sourceRow: number
  tempJobId: number | null
  rawTempJobId: string | null
  matchedJobId: string | null
  department: string
  employeeName: string | null
  level: string | null
  jobTitle: string | null
  startDate: string | null
  monthlyFte: Record<string, number | null>
  createdAt: string
  matchedJob: HeadcountJobSummary | null
}

export interface HeadcountResponse {
  data: HeadcountProjection[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface HeadcountSummaryEntry {
  department: string
  monthlyTotals: Record<string, number>
}

export interface HeadcountSummaryResponse {
  departments: string[]
  months: string[]
  data: HeadcountSummaryEntry[]
}

/**
 * Fetch headcount projections list with filters and pagination
 */
export function useHeadcountQuery(filters?: HeadcountFilters) {
  return useQuery<HeadcountResponse, Error>({
    queryKey: queryKeys.headcount.list(filters),
    queryFn: async () => {
      const url = buildUrl('/api/headcount', {
        department: filters?.department,
        level: filters?.level,
        matchedStatus: filters?.matchedStatus,
        sort: filters?.sort,
        order: filters?.order,
        page: filters?.page,
        pageSize: filters?.pageSize,
      })
      return api.get<HeadcountResponse>(url)
    },
    staleTime: queryCachePolicy.headcount.list.staleTime,
    gcTime: queryCachePolicy.headcount.list.gcTime,
    retry: createRetryPolicy(queryCachePolicy.headcount.list.maxRetries),
    placeholderData: keepPreviousData,
  })
}

/**
 * Fetch headcount summary (aggregated by department) for charts
 */
export function useHeadcountSummaryQuery(department?: string) {
  return useQuery<HeadcountSummaryResponse, Error>({
    queryKey: queryKeys.headcount.summary(department),
    queryFn: async () => {
      const url = buildUrl('/api/headcount/summary', {
        department: department || undefined,
      })
      return api.get<HeadcountSummaryResponse>(url)
    },
    staleTime: queryCachePolicy.headcount.summary.staleTime,
    gcTime: queryCachePolicy.headcount.summary.gcTime,
    retry: createRetryPolicy(queryCachePolicy.headcount.summary.maxRetries),
  })
}
