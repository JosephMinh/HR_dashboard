/**
 * Users Query Hooks
 *
 * TanStack Query hooks for admin user management.
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api, buildUrl, createRetryPolicy } from '@/lib/api-client'
import { queryCachePolicy, queryKeys, type UsersFilters } from '@/lib/query-keys'

export interface User {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

export interface UsersResponse {
  users: User[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CreateUserInput {
  name: string
  email: string
  role: string
}

export interface InviteDeliveryOutcome {
  status: 'sent' | 'failed'
  error?: string
  setupUrl: string
}

export interface CreateUserResponse extends User {
  invite: InviteDeliveryOutcome
}

export interface UpdateUserInput {
  id: string
  name?: string
  role?: string
  active?: boolean
}

export interface ResetPasswordResponse {
  tempPassword: string
}

/**
 * Fetch users list with filters and pagination (admin only)
 */
export function useUsersQuery(filters?: UsersFilters) {
  return useQuery<UsersResponse, Error>({
    queryKey: queryKeys.users.list(filters),
    queryFn: async () => {
      const url = buildUrl('/api/users', {
        search: filters?.search,
        active: filters?.active,
        page: filters?.page,
        pageSize: filters?.limit,
      })
      return api.get<UsersResponse>(url)
    },
    staleTime: queryCachePolicy.users.list.staleTime,
    gcTime: queryCachePolicy.users.list.gcTime,
    retry: createRetryPolicy(queryCachePolicy.users.list.maxRetries),
    placeholderData: keepPreviousData,
  })
}

/**
 * Create a new user (admin only)
 */
export function useCreateUserMutation() {
  const queryClient = useQueryClient()

  return useMutation<CreateUserResponse, Error, CreateUserInput>({
    mutationFn: async (input) => {
      return api.post<CreateUserResponse>('/api/users', input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
    },
  })
}

/**
 * Update a user (admin only)
 */
export function useUpdateUserMutation() {
  const queryClient = useQueryClient()

  return useMutation<User, Error, UpdateUserInput>({
    mutationFn: async ({ id, ...input }) => {
      return api.patch<User>(`/api/users/${id}`, input)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
    },
  })
}

/**
 * Reset a user's password (admin only)
 */
export function useResetPasswordMutation() {
  const queryClient = useQueryClient()

  return useMutation<ResetPasswordResponse, Error, string>({
    mutationFn: async (userId) => {
      return api.post<ResetPasswordResponse>(`/api/users/${userId}/reset-password`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
    },
  })
}
