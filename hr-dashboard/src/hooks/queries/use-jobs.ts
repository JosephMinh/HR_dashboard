/**
 * Jobs Query Hooks
 *
 * TanStack Query hooks for jobs data fetching.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, buildUrl, createRetryPolicy } from '@/lib/api-client'
import { queryCachePolicy, queryKeys, type JobsFilters } from '@/lib/query-keys'

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

/**
 * Fetch jobs list with filters and pagination
 */
export function useJobsQuery(filters?: JobsFilters) {
  return useQuery<JobsResponse, Error>({
    queryKey: queryKeys.jobs.list(filters),
    queryFn: async () => {
      const url = buildUrl('/api/jobs', {
        status: filters?.status,
        department: Array.isArray(filters?.department)
          ? filters.department.join(',')
          : filters?.department,
        pipelineHealth: filters?.pipelineHealth,
        critical: filters?.critical,
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
  })
}

/**
 * Fetch single job by ID
 */
export function useJobQuery(id: string | undefined) {
  return useQuery<Job, Error>({
    queryKey: queryKeys.jobs.detail(id ?? ''),
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
  })
}
