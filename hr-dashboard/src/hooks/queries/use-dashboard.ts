/**
 * Dashboard Query Hooks
 *
 * TanStack Query hooks for dashboard stats.
 */

import { useQuery } from '@tanstack/react-query'
import { api, createRetryPolicy } from '@/lib/api-client'
import { queryCachePolicy, queryKeys, type DashboardFilters } from '@/lib/query-keys'

// Types
export interface DashboardStats {
  openJobs: number
  activeCandidates: number
  hiresThisMonth: number
  avgTimeToHire: number | null
  pipelineStages: PipelineStageCount[]
  topJobs: TopJob[]
  recentActivity: ActivityItem[]
}

export interface PipelineStageCount {
  stage: string
  count: number
}

export interface TopJob {
  id: string
  title: string
  department: string
  candidateCount: number
  status: string
}

export interface ActivityItem {
  id: string
  type: string
  description: string
  timestamp: string
  entityId?: string
  entityType?: string
}

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
