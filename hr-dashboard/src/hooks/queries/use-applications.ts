/**
 * Applications Mutation Hooks
 *
 * TanStack Query hooks for application updates and unlink actions.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api-client"
import { queryKeys } from "@/lib/query-keys"

export interface ApplicationResponse {
  id: string
  jobId: string
  candidateId: string
  stage: string
  recruiterOwner: string | null
  interviewNotes: string | null
  stageUpdatedAt: string
  createdAt: string
  updatedAt: string
  job?: {
    id: string
    title: string
    department: string
  }
  candidate?: {
    id: string
    firstName: string
    lastName: string
    email: string | null
  }
}

export interface CreateApplicationInput {
  jobId: string
  candidateId: string
  stage?: string
  recruiterOwner?: string | null
  interviewNotes?: string | null
}

export interface UpdateApplicationInput {
  id: string
  stage?: string
  recruiterOwner?: string | null
  interviewNotes?: string | null
}

export interface DeleteApplicationInput {
  id: string
  jobId?: string
  candidateId?: string
}

/**
 * Create a new application (attach candidate to job).
 */
export function useCreateApplicationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateApplicationInput) => {
      return api.post<ApplicationResponse>('/api/applications', input)
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.applications.lists(),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.applications.byJob(data.jobId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.applications.byCandidate(data.candidateId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.jobs.detail(data.jobId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.candidates.detail(data.candidateId),
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.lists() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.lists() })
    },
    onError: (error, variables) => {
      console.error(
        `[useCreateApplicationMutation] Failed to create application for job ${variables.jobId}, candidate ${variables.candidateId}:`,
        error
      )
    },
  })
}

/**
 * Update an existing application (stage/owner/notes).
 */
export function useUpdateApplicationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateApplicationInput) => {
      return api.patch<ApplicationResponse>(`/api/applications/${id}`, input)
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.applications.detail(data.id),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.applications.byJob(data.jobId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.applications.byCandidate(data.candidateId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.jobs.detail(data.jobId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.candidates.detail(data.candidateId),
      })
    },
    onError: (error, variables) => {
      console.error(`[useUpdateApplicationMutation] Failed to update application ${variables.id}:`, error)
    },
  })
}

/**
 * Delete/unlink an application from job pipeline.
 */
export function useDeleteApplicationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: DeleteApplicationInput) => {
      return api.delete<{ success: boolean }>(`/api/applications/${id}`)
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.applications.detail(variables.id),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.applications.lists(),
      })

      if (variables.jobId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.applications.byJob(variables.jobId),
        })
        void queryClient.invalidateQueries({
          queryKey: queryKeys.jobs.detail(variables.jobId),
        })
      }

      if (variables.candidateId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.applications.byCandidate(variables.candidateId),
        })
        void queryClient.invalidateQueries({
          queryKey: queryKeys.candidates.detail(variables.candidateId),
        })
      }
    },
    onError: (error, variables) => {
      console.error(`[useDeleteApplicationMutation] Failed to delete application ${variables.id}:`, error)
    },
  })
}
