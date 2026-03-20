/**
 * Dashboard Query Hooks
 *
 * TanStack Query hooks for dashboard stats.
 */

import { useQuery } from '@tanstack/react-query'
import { api, createRetryPolicy } from '@/lib/api-client'
import { queryCachePolicy, queryKeys, type DashboardFilters } from '@/lib/query-keys'
import type { DashboardStats as DashboardStatsShape } from '@/lib/dashboard'

export type DashboardStats = DashboardStatsShape

/**
 * Fetch dashboard statistics
 */
export function useDashboardStatsQuery(filters?: DashboardFilters) {
  return useQuery<DashboardStats, Error>({
    queryKey: queryKeys.dashboard.stats(filters),
    queryFn: async () => {
      return api.get<DashboardStats>('/api/dashboard/stats')
    },
    staleTime: queryCachePolicy.dashboard.stats.staleTime,
    gcTime: queryCachePolicy.dashboard.stats.gcTime,
    retry: createRetryPolicy(queryCachePolicy.dashboard.stats.maxRetries),
  })
}
