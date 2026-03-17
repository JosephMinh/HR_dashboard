/**
 * Tradeoffs Query Hooks
 *
 * TanStack Query hooks for tradeoff data fetching.
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, buildUrl, createRetryPolicy } from '@/lib/api-client'
import { queryCachePolicy, queryKeys, type TradeoffsFilters } from '@/lib/query-keys'

// Types
export interface TradeoffJobSummary {
  id: string
  title: string
  department: string
  status: string
}

export interface Tradeoff {
  id: string
  importKey: string
  sourceRow: number
  rowType: string
  sourceTempJobId: number | null
  sourceJobId: string | null
  sourceDepartment: string | null
  sourceLevel: string | null
  sourceTitle: string | null
  targetTempJobId: number | null
  targetJobId: string | null
  targetDepartment: string | null
  targetLevel: string | null
  targetTitle: string | null
  levelDifference: number | null
  status: string | null
  notes: string | null
  createdAt: string
  sourceJob: TradeoffJobSummary | null
  targetJob: TradeoffJobSummary | null
}

export interface TradeoffsResponse {
  data: Tradeoff[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

/**
 * Fetch tradeoffs list with filters and pagination
 */
export function useTradeoffsQuery(filters?: TradeoffsFilters) {
  return useQuery<TradeoffsResponse, Error>({
    queryKey: queryKeys.tradeoffs.list(filters),
    queryFn: async () => {
      const url = buildUrl('/api/tradeoffs', {
        rowType: filters?.rowType,
        status: filters?.status,
        sourceDepartment: filters?.sourceDepartment,
        targetDepartment: filters?.targetDepartment,
        sort: filters?.sort,
        order: filters?.order,
        page: filters?.page,
        pageSize: filters?.pageSize,
      })
      return api.get<TradeoffsResponse>(url)
    },
    staleTime: queryCachePolicy.tradeoffs.list.staleTime,
    gcTime: queryCachePolicy.tradeoffs.list.gcTime,
    retry: createRetryPolicy(queryCachePolicy.tradeoffs.list.maxRetries),
    placeholderData: keepPreviousData,
  })
}
