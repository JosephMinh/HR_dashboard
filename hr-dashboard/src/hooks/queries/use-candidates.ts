/**
 * Candidates Query Hooks
 *
 * TanStack Query hooks for candidates data fetching.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, buildUrl, createRetryPolicy } from '@/lib/api-client'
import { queryCachePolicy, queryKeys, type CandidatesFilters } from '@/lib/query-keys'

// Types
export interface Candidate {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  currentCompany: string | null
  location: string | null
  source: string | null
  resumeKey: string | null
  resumeName: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  jobCount?: number
}

export interface CandidatesResponse {
  candidates: Candidate[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CreateCandidateInput {
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  linkedinUrl?: string | null
  currentCompany?: string | null
  location?: string | null
  source?: string | null
  resumeKey?: string | null
  resumeName?: string | null
  notes?: string | null
  jobId?: string
}

export interface UpdateCandidateInput extends Partial<Omit<CreateCandidateInput, 'jobId'>> {
  id: string
}

/**
 * Fetch candidates list with filters and pagination
 */
export function useCandidatesQuery(filters?: CandidatesFilters & { includeJobCount?: boolean }) {
  return useQuery<CandidatesResponse, Error>({
    queryKey: queryKeys.candidates.list(filters),
    queryFn: async () => {
      const url = buildUrl('/api/candidates', {
        search: filters?.search,
        sort: filters?.sort,
        order: filters?.order,
        page: filters?.page,
        pageSize: filters?.limit,
        includeJobCount: filters?.includeJobCount,
      })
      return api.get<CandidatesResponse>(url)
    },
    staleTime: queryCachePolicy.candidates.list.staleTime,
    gcTime: queryCachePolicy.candidates.list.gcTime,
    retry: createRetryPolicy(queryCachePolicy.candidates.list.maxRetries),
  })
}

/**
 * Fetch single candidate by ID
 */
export function useCandidateQuery(id: string | undefined) {
  return useQuery<Candidate, Error>({
    queryKey: queryKeys.candidates.detail(id ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('Candidate ID is required')
      return api.get<Candidate>(`/api/candidates/${id}`)
    },
    enabled: !!id,
    staleTime: queryCachePolicy.candidates.detail.staleTime,
    gcTime: queryCachePolicy.candidates.detail.gcTime,
    retry: createRetryPolicy(queryCachePolicy.candidates.detail.maxRetries),
  })
}

/**
 * Create a new candidate
 */
export function useCreateCandidateMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateCandidateInput) => {
      return api.post<{ candidate: Candidate; linkedJobId?: string }>('/api/candidates', input)
    },
    onSuccess: (data) => {
      // Invalidate candidate lists
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.lists() })
      // If linked to a job, invalidate that job's applications
      if (data.linkedJobId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.applications.byJob(data.linkedJobId),
        })
        void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(data.linkedJobId) })
      }
    },
  })
}

/**
 * Update an existing candidate
 */
export function useUpdateCandidateMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateCandidateInput) => {
      return api.patch<Candidate>(`/api/candidates/${id}`, input)
    },
    onSuccess: (data) => {
      // Invalidate the specific candidate and all lists
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.detail(data.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.lists() })
    },
  })
}

/**
 * Delete a candidate
 */
export function useDeleteCandidateMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      return api.delete<void>(`/api/candidates/${id}`)
    },
    onSuccess: (_data, id) => {
      // Remove from cache and invalidate lists
      queryClient.removeQueries({ queryKey: queryKeys.candidates.detail(id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.lists() })
      // Also invalidate applications since a candidate's applications are deleted
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.all })
    },
  })
}
