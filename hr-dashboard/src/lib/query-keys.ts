/**
 * Query Key Factory
 *
 * Canonical query keys for TanStack Query.
 * Following the factory pattern from TKDodo's blog:
 * https://tkdodo.eu/blog/effective-react-query-keys
 *
 * Structure: [scope, type, ...params]
 */

import { JOB_FILTER_FIELDS, JOB_FILTER_MISSING_VALUE } from './job-filter-constants'

// Types for filter parameters
export const JOBS_MISSING_FILTER_SENTINEL = JOB_FILTER_MISSING_VALUE

export type JobsFilterParam = string | string[]

export interface JobsFilters {
  status?: JobsFilterParam
  department?: JobsFilterParam
  pipelineHealth?: JobsFilterParam
  priority?: JobsFilterParam
  horizon?: JobsFilterParam
  employeeType?: JobsFilterParam
  function?: JobsFilterParam
  level?: JobsFilterParam
  asset?: JobsFilterParam
  location?: JobsFilterParam
  recruiterOwner?: JobsFilterParam
  functionalPriority?: JobsFilterParam
  corporatePriority?: JobsFilterParam
  search?: string
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  limit?: number
  includeCount?: boolean
}

export interface CandidatesFilters {
  search?: string
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export interface ApplicationsFilters {
  jobId?: string
  candidateId?: string
  stage?: string
}

export interface UsersFilters {
  search?: string
  active?: string
  page?: number
  limit?: number
}

export interface TradeoffsFilters {
  rowType?: string
  status?: string
  sourceDepartment?: string
  targetDepartment?: string
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface HeadcountFilters {
  department?: string
  level?: string
  matchedStatus?: 'matched' | 'unmatched'
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface DashboardFilters {
  timeRange?: string
}

const JOBS_MULTI_VALUE_FILTER_KEYS = JOB_FILTER_FIELDS satisfies readonly (keyof JobsFilters)[]

function compareJobsFilterValues(left: string, right: string): number {
  if (left === JOBS_MISSING_FILTER_SENTINEL && right !== JOBS_MISSING_FILTER_SENTINEL) {
    return 1
  }

  if (right === JOBS_MISSING_FILTER_SENTINEL && left !== JOBS_MISSING_FILTER_SENTINEL) {
    return -1
  }

  return left.localeCompare(right, undefined, {
    sensitivity: 'base',
    numeric: true,
  })
}

export function normalizeJobsFilterParam(
  value?: JobsFilterParam,
): JobsFilterParam | undefined {
  if (value === undefined) {
    return undefined
  }

  if (Array.isArray(value)) {
    const normalizedValues = [...new Set(
      value
        .map((entry) => entry.trim())
        .filter(Boolean),
    )].sort(compareJobsFilterValues)

    if (normalizedValues.length === 0) {
      return undefined
    }

    return normalizedValues.length === 1 ? normalizedValues[0] : normalizedValues
  }

  const normalizedValue = value.trim()
  return normalizedValue.length > 0 ? normalizedValue : undefined
}

function normalizeJobsFilters(filters: JobsFilters): JobsFilters {
  const normalizedFilters: JobsFilters = { ...filters }

  for (const key of JOBS_MULTI_VALUE_FILTER_KEYS) {
    const normalizedValue = normalizeJobsFilterParam(filters[key])
    if (normalizedValue === undefined) {
      delete normalizedFilters[key]
      continue
    }

    normalizedFilters[key] = normalizedValue
  }

  return normalizedFilters
}

interface CachePolicy {
  staleTime: number
  gcTime: number
  maxRetries: number
}

/**
 * Cache policy matrix by query surface volatility.
 * - list queries: fresher, shorter cache lifetime
 * - detail queries: slightly longer cache retention
 * - dashboard stats: longer stale window to limit aggregate endpoint load
 */
export const queryCachePolicy: {
  jobs: {
    list: CachePolicy
    detail: CachePolicy
    filterOptions: CachePolicy
  }
  candidates: {
    list: CachePolicy
    detail: CachePolicy
  }
  dashboard: {
    stats: CachePolicy
  }
  applications: {
    list: CachePolicy
    detail: CachePolicy
    byJob: CachePolicy
    byCandidate: CachePolicy
  }
  tradeoffs: {
    list: CachePolicy
  }
  headcount: {
    list: CachePolicy
    summary: CachePolicy
  }
  users: {
    list: CachePolicy
  }
} = {
  jobs: {
    list: { staleTime: 20_000, gcTime: 5 * 60_000, maxRetries: 2 },
    detail: { staleTime: 60_000, gcTime: 10 * 60_000, maxRetries: 1 },
    filterOptions: { staleTime: 5 * 60_000, gcTime: 30 * 60_000, maxRetries: 1 },
  },
  candidates: {
    list: { staleTime: 20_000, gcTime: 5 * 60_000, maxRetries: 2 },
    detail: { staleTime: 60_000, gcTime: 10 * 60_000, maxRetries: 1 },
  },
  dashboard: {
    stats: { staleTime: 2 * 60_000, gcTime: 10 * 60_000, maxRetries: 1 },
  },
  applications: {
    list: { staleTime: 10_000, gcTime: 5 * 60_000, maxRetries: 1 },
    detail: { staleTime: 30_000, gcTime: 10 * 60_000, maxRetries: 1 },
    byJob: { staleTime: 10_000, gcTime: 5 * 60_000, maxRetries: 1 },
    byCandidate: { staleTime: 10_000, gcTime: 5 * 60_000, maxRetries: 1 },
  },
  tradeoffs: {
    list: { staleTime: 60_000, gcTime: 10 * 60_000, maxRetries: 1 },
  },
  headcount: {
    list: { staleTime: 60_000, gcTime: 10 * 60_000, maxRetries: 1 },
    summary: { staleTime: 2 * 60_000, gcTime: 10 * 60_000, maxRetries: 1 },
  },
  users: {
    list: { staleTime: 15_000, gcTime: 5 * 60_000, maxRetries: 1 },
  },
}

/**
 * Query keys factory
 *
 * Usage:
 *   queryKeys.jobs.all           -> ['jobs']
 *   queryKeys.jobs.lists()       -> ['jobs', 'list']
 *   queryKeys.jobs.list(filters) -> ['jobs', 'list', { ...filters }]
 *   queryKeys.jobs.detail(id)    -> ['jobs', 'detail', id]
 */
export const queryKeys = {
  // Jobs
  jobs: {
    all: ['jobs'] as const,
    lists: () => [...queryKeys.jobs.all, 'list'] as const,
    list: (filters?: JobsFilters) =>
      filters
        ? ([...queryKeys.jobs.lists(), normalizeJobsFilters(filters)] as const)
        : queryKeys.jobs.lists(),
    details: () => [...queryKeys.jobs.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.jobs.details(), id] as const,
    filterOptions: () => [...queryKeys.jobs.all, 'filterOptions'] as const,
  },

  // Candidates
  candidates: {
    all: ['candidates'] as const,
    lists: () => [...queryKeys.candidates.all, 'list'] as const,
    list: (filters?: CandidatesFilters) =>
      filters
        ? ([...queryKeys.candidates.lists(), filters] as const)
        : queryKeys.candidates.lists(),
    details: () => [...queryKeys.candidates.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.candidates.details(), id] as const,
    resume: (key: string) => [...queryKeys.candidates.all, 'resume', key] as const,
  },

  // Applications
  applications: {
    all: ['applications'] as const,
    lists: () => [...queryKeys.applications.all, 'list'] as const,
    list: (filters?: ApplicationsFilters) =>
      filters
        ? ([...queryKeys.applications.lists(), filters] as const)
        : queryKeys.applications.lists(),
    details: () => [...queryKeys.applications.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.applications.details(), id] as const,
    byJob: (jobId: string) =>
      [...queryKeys.applications.all, 'byJob', jobId] as const,
    byCandidate: (candidateId: string) =>
      [...queryKeys.applications.all, 'byCandidate', candidateId] as const,
  },

  // Dashboard
  dashboard: {
    all: ['dashboard'] as const,
    stats: (filters?: DashboardFilters) =>
      filters
        ? ([...queryKeys.dashboard.all, 'stats', filters] as const)
        : ([...queryKeys.dashboard.all, 'stats'] as const),
  },

  // Tradeoffs
  tradeoffs: {
    all: ['tradeoffs'] as const,
    lists: () => [...queryKeys.tradeoffs.all, 'list'] as const,
    list: (filters?: TradeoffsFilters) =>
      filters
        ? ([...queryKeys.tradeoffs.lists(), filters] as const)
        : queryKeys.tradeoffs.lists(),
  },

  // Headcount Projections
  headcount: {
    all: ['headcount'] as const,
    lists: () => [...queryKeys.headcount.all, 'list'] as const,
    list: (filters?: HeadcountFilters) =>
      filters
        ? ([...queryKeys.headcount.lists(), filters] as const)
        : queryKeys.headcount.lists(),
    summary: (department?: string) =>
      department
        ? ([...queryKeys.headcount.all, 'summary', department] as const)
        : ([...queryKeys.headcount.all, 'summary'] as const),
  },

  // Users (for admin/settings)
  users: {
    all: ['users'] as const,
    lists: () => [...queryKeys.users.all, 'list'] as const,
    list: (filters?: UsersFilters) =>
      filters
        ? ([...queryKeys.users.lists(), filters] as const)
        : queryKeys.users.lists(),
    detail: (id: string) => [...queryKeys.users.all, 'detail', id] as const,
    current: () => [...queryKeys.users.all, 'current'] as const,
  },
} as const

/**
 * Type helper for query key arrays
 */
export type QueryKey = readonly unknown[]
