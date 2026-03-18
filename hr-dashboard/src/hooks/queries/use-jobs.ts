/**
 * Jobs Query Hooks
 *
 * TanStack Query hooks for jobs data fetching.
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api, buildUrl, createRetryPolicy } from '@/lib/api-client'
import {
  queryCachePolicy,
  queryKeys,
  JOBS_MISSING_FILTER_SENTINEL,
  type JobsFilterParam,
  type JobsFilters,
} from '@/lib/query-keys'

export type JobFilterField =
  | 'department'
  | 'employeeType'
  | 'location'
  | 'recruiterOwner'
  | 'functionalPriority'
  | 'corporatePriority'
  | 'function'
  | 'level'
  | 'horizon'
  | 'asset'

export interface JobFilterOption {
  label: string
  value: string
  isMissing: boolean
}

export interface JobFilterOptionsResponse {
  missingValue: typeof JOBS_MISSING_FILTER_SENTINEL
  options: Record<JobFilterField, JobFilterOption[]>
}

// Types
export interface Job {
  id: string
  title: string
  department: string
  description: string
  location: string | null
  hiringManager: string | null
  recruiterOwner: string | null
  status: string
  priority: string
  pipelineHealth: string | null
  isCritical: boolean
  openedAt: string | null
  targetFillDate: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
  importKey?: string | null
  sourceSheet?: string | null
  sourceRow?: number | null
  tempJobId?: number | null
  employeeType?: string | null
  function?: string | null
  level?: string | null
  horizon?: string | null
  asset?: string | null
  keyCapability?: string | null
  businessRationale?: string | null
  milestone?: string | null
  talentAssessment?: string | null
  functionalPriority?: string | null
  corporatePriority?: string | null
  isTradeoff?: boolean
  recruitingStatus?: string | null
  fpaLevel?: string | null
  fpaTiming?: string | null
  fpaNote?: string | null
  fpaApproved?: string | null
  hiredName?: string | null
  hibobId?: number | null
  notes?: string | null
  activeCandidateCount?: number
}

export interface JobsResponse {
  jobs: Job[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CreateJobInput {
  title: string
  department: string
  description: string
  location?: string
  hiringManager?: string
  recruiterOwner?: string
  status?: string
  priority?: string
  pipelineHealth?: string
  isCritical?: boolean
  openedAt?: string
  targetFillDate?: string
}

export interface UpdateJobInput extends Partial<CreateJobInput> {
  id: string
}

function serializeJobsFilterParam(value?: JobsFilterParam): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const values = (Array.isArray(value) ? value : [value])
    .map((entry) => entry.trim())
    .filter(Boolean)

  return values.length > 0 ? values.join(',') : undefined
}

/**
 * Fetch jobs list with filters and pagination
 */
export function useJobsQuery(filters?: JobsFilters) {
  return useQuery<JobsResponse, Error>({
    queryKey: queryKeys.jobs.list(filters),
    queryFn: async () => {
      const url = buildUrl('/api/jobs', {
        status: filters?.status,
        department: serializeJobsFilterParam(filters?.department),
        pipelineHealth: filters?.pipelineHealth,
        priority: filters?.priority,
        horizon: serializeJobsFilterParam(filters?.horizon),
        employeeType: serializeJobsFilterParam(filters?.employeeType),
        function: serializeJobsFilterParam(filters?.function),
        level: serializeJobsFilterParam(filters?.level),
        asset: serializeJobsFilterParam(filters?.asset),
        location: serializeJobsFilterParam(filters?.location),
        recruiterOwner: serializeJobsFilterParam(filters?.recruiterOwner),
        functionalPriority: serializeJobsFilterParam(filters?.functionalPriority),
        corporatePriority: serializeJobsFilterParam(filters?.corporatePriority),
        search: filters?.search,
        sort: filters?.sort,
        order: filters?.order,
        page: filters?.page,
        pageSize: filters?.limit,
        includeCount: filters?.includeCount,
      })
      return api.get<JobsResponse>(url)
    },
    staleTime: queryCachePolicy.jobs.list.staleTime,
    gcTime: queryCachePolicy.jobs.list.gcTime,
    retry: createRetryPolicy(queryCachePolicy.jobs.list.maxRetries),
    // Keep previous data visible during refetches for smooth transitions
    placeholderData: keepPreviousData,
  })
}

export function useJobFilterOptionsQuery() {
  return useQuery<JobFilterOptionsResponse, Error>({
    queryKey: queryKeys.jobs.filterOptions(),
    queryFn: async () => api.get<JobFilterOptionsResponse>('/api/jobs/filter-options'),
    staleTime: queryCachePolicy.jobs.filterOptions.staleTime,
    gcTime: queryCachePolicy.jobs.filterOptions.gcTime,
    retry: createRetryPolicy(queryCachePolicy.jobs.filterOptions.maxRetries),
  })
}

// Sentinel value for disabled queries - prevents cache pollution with empty keys
const SKIP_QUERY_ID = '__skip__' as const

/**
 * Fetch single job by ID
 */
export function useJobQuery(id: string | undefined) {
  return useQuery<Job, Error>({
    // Use sentinel value when no ID to avoid cache pollution
    queryKey: queryKeys.jobs.detail(id ?? SKIP_QUERY_ID),
    queryFn: async () => {
      if (!id) throw new Error('Job ID is required')
      return api.get<Job>(`/api/jobs/${id}`)
    },
    enabled: !!id,
    staleTime: queryCachePolicy.jobs.detail.staleTime,
    gcTime: queryCachePolicy.jobs.detail.gcTime,
    retry: createRetryPolicy(queryCachePolicy.jobs.detail.maxRetries),
  })
}

/**
 * Create a new job
 */
export function useCreateJobMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateJobInput) => {
      return api.post<Job>('/api/jobs', input)
    },
    onSuccess: () => {
      // Invalidate all job lists to refetch
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.lists() })
    },
    onError: (error) => {
      console.error('[useCreateJobMutation] Failed to create job:', error)
    },
  })
}

/**
 * Update an existing job
 */
export function useUpdateJobMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateJobInput) => {
      return api.patch<Job>(`/api/jobs/${id}`, input)
    },
    onSuccess: (data) => {
      // Invalidate the specific job and all lists
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(data.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.lists() })
    },
    onError: (error, variables) => {
      console.error(`[useUpdateJobMutation] Failed to update job ${variables.id}:`, error)
    },
  })
}

/**
 * Delete a job
 */
export function useDeleteJobMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      return api.delete<void>(`/api/jobs/${id}`)
    },
    onSuccess: (_data, id) => {
      // Remove from cache and invalidate lists
      queryClient.removeQueries({ queryKey: queryKeys.jobs.detail(id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.lists() })
    },
    onError: (error, id) => {
      console.error(`[useDeleteJobMutation] Failed to delete job ${id}:`, error)
    },
  })
}
