/**
 * Query Hooks Unit Tests
 *
 * Tests for TanStack Query hooks including:
 * - Query key stability
 * - Mutation invalidation correctness
 * - Cache invalidation patterns
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '@/lib/query-keys'

describe('queryKeys factory', () => {
  describe('jobs', () => {
    it('returns stable all key', () => {
      expect(queryKeys.jobs.all).toEqual(['jobs'])
      expect(queryKeys.jobs.all).toBe(queryKeys.jobs.all)
    })

    it('returns stable lists key', () => {
      expect(queryKeys.jobs.lists()).toEqual(['jobs', 'list'])
      expect(queryKeys.jobs.lists()).toEqual(queryKeys.jobs.lists())
    })

    it('returns list key without filters', () => {
      expect(queryKeys.jobs.list()).toEqual(['jobs', 'list'])
    })

    it('returns list key with filters', () => {
      const filters = { status: 'OPEN', page: 1 }
      expect(queryKeys.jobs.list(filters)).toEqual(['jobs', 'list', filters])
    })

    it('returns detail key with id', () => {
      expect(queryKeys.jobs.detail('abc-123')).toEqual(['jobs', 'detail', 'abc-123'])
    })

    it('maintains filter object reference in list key', () => {
      const filters = { status: 'OPEN' }
      const key1 = queryKeys.jobs.list(filters)
      const key2 = queryKeys.jobs.list(filters)
      expect(key1[2]).toBe(key2[2])
    })
  })

  describe('candidates', () => {
    it('returns stable all key', () => {
      expect(queryKeys.candidates.all).toEqual(['candidates'])
    })

    it('returns list key with search filter', () => {
      const filters = { search: 'John' }
      expect(queryKeys.candidates.list(filters)).toEqual(['candidates', 'list', filters])
    })

    it('returns detail key with id', () => {
      expect(queryKeys.candidates.detail('xyz-789')).toEqual(['candidates', 'detail', 'xyz-789'])
    })

    it('returns resume key with storage key', () => {
      expect(queryKeys.candidates.resume('resume-key-123')).toEqual([
        'candidates',
        'resume',
        'resume-key-123',
      ])
    })
  })

  describe('applications', () => {
    it('returns stable all key', () => {
      expect(queryKeys.applications.all).toEqual(['applications'])
    })

    it('returns byJob key', () => {
      expect(queryKeys.applications.byJob('job-123')).toEqual([
        'applications',
        'byJob',
        'job-123',
      ])
    })

    it('returns byCandidate key', () => {
      expect(queryKeys.applications.byCandidate('cand-456')).toEqual([
        'applications',
        'byCandidate',
        'cand-456',
      ])
    })

    it('returns detail key with id', () => {
      expect(queryKeys.applications.detail('app-789')).toEqual([
        'applications',
        'detail',
        'app-789',
      ])
    })
  })

  describe('dashboard', () => {
    it('returns stable all key', () => {
      expect(queryKeys.dashboard.all).toEqual(['dashboard'])
    })

    it('returns stats key without filters', () => {
      expect(queryKeys.dashboard.stats()).toEqual(['dashboard', 'stats'])
    })

    it('returns stats key with filters', () => {
      const filters = { timeRange: 'week' }
      expect(queryKeys.dashboard.stats(filters)).toEqual(['dashboard', 'stats', filters])
    })
  })
})

// Mock QueryClient for mutation invalidation tests
const mockInvalidateQueries = vi.fn()
const mockRemoveQueries = vi.fn()
const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
  removeQueries: mockRemoveQueries,
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => mockQueryClient,
    useMutation: vi.fn((options: { mutationFn: (arg: unknown) => Promise<unknown>; onSuccess?: (data: unknown, variables: unknown) => void }) => ({
      mutateAsync: async (input: unknown) => {
        const result = await options.mutationFn(input)
        if (options.onSuccess) {
          options.onSuccess(result, input)
        }
        return result
      },
      isPending: false,
      error: null,
    })),
  }
})

vi.mock('@/lib/api-client', () => ({
  api: {
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('mutation invalidation patterns', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockClear()
    mockRemoveQueries.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('job mutations', () => {
    it('useCreateJobMutation invalidates job lists on success', async () => {
      const { api } = await import('@/lib/api-client')
      const mockJob = { id: 'new-job-id', title: 'Test Job' }
      vi.mocked(api.post).mockResolvedValueOnce(mockJob)

      const { useCreateJobMutation } = await import('@/hooks/queries/use-jobs')
      const mutation = useCreateJobMutation()

      await mutation.mutateAsync({ title: 'Test Job', department: 'Engineering', description: 'Test' })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.jobs.lists(),
      })
    })

    it('useUpdateJobMutation invalidates detail and lists on success', async () => {
      const { api } = await import('@/lib/api-client')
      const mockJob = { id: 'job-123', title: 'Updated Job' }
      vi.mocked(api.patch).mockResolvedValueOnce(mockJob)

      const { useUpdateJobMutation } = await import('@/hooks/queries/use-jobs')
      const mutation = useUpdateJobMutation()

      await mutation.mutateAsync({ id: 'job-123', title: 'Updated Job' })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.jobs.detail('job-123'),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.jobs.lists(),
      })
    })

    it('useDeleteJobMutation removes from cache and invalidates lists', async () => {
      const { api } = await import('@/lib/api-client')
      vi.mocked(api.delete).mockResolvedValueOnce(undefined)

      const { useDeleteJobMutation } = await import('@/hooks/queries/use-jobs')
      const mutation = useDeleteJobMutation()

      await mutation.mutateAsync('job-to-delete')

      expect(mockRemoveQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.jobs.detail('job-to-delete'),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.jobs.lists(),
      })
    })
  })

  describe('candidate mutations', () => {
    it('useCreateCandidateMutation invalidates candidate lists and linked job on success', async () => {
      const { api } = await import('@/lib/api-client')
      const mockResult = {
        candidate: { id: 'cand-123' },
        linkedJobId: 'job-456',
      }
      vi.mocked(api.post).mockResolvedValueOnce(mockResult)

      const { useCreateCandidateMutation } = await import('@/hooks/queries/use-candidates')
      const mutation = useCreateCandidateMutation()

      await mutation.mutateAsync({
        firstName: 'John',
        lastName: 'Doe',
        jobId: 'job-456',
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.candidates.lists(),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.applications.byJob('job-456'),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.jobs.detail('job-456'),
      })
    })

    it('useDeleteCandidateMutation invalidates applications cache', async () => {
      const { api } = await import('@/lib/api-client')
      vi.mocked(api.delete).mockResolvedValueOnce(undefined)

      const { useDeleteCandidateMutation } = await import('@/hooks/queries/use-candidates')
      const mutation = useDeleteCandidateMutation()

      await mutation.mutateAsync('cand-to-delete')

      expect(mockRemoveQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.candidates.detail('cand-to-delete'),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.applications.all,
      })
    })
  })

  describe('application mutations', () => {
    it('useCreateApplicationMutation invalidates job and candidate caches', async () => {
      const { api } = await import('@/lib/api-client')
      const mockApp = {
        id: 'app-123',
        jobId: 'job-456',
        candidateId: 'cand-789',
      }
      vi.mocked(api.post).mockResolvedValueOnce(mockApp)

      const { useCreateApplicationMutation } = await import('@/hooks/queries/use-applications')
      const mutation = useCreateApplicationMutation()

      await mutation.mutateAsync({ jobId: 'job-456', candidateId: 'cand-789' })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.applications.lists(),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.applications.byJob('job-456'),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.applications.byCandidate('cand-789'),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.jobs.detail('job-456'),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.candidates.detail('cand-789'),
      })
    })

    it('useUpdateApplicationMutation invalidates related caches', async () => {
      const { api } = await import('@/lib/api-client')
      const mockApp = {
        id: 'app-123',
        jobId: 'job-456',
        candidateId: 'cand-789',
        stage: 'SCREENING',
      }
      vi.mocked(api.patch).mockResolvedValueOnce(mockApp)

      const { useUpdateApplicationMutation } = await import('@/hooks/queries/use-applications')
      const mutation = useUpdateApplicationMutation()

      await mutation.mutateAsync({ id: 'app-123', stage: 'SCREENING' })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.applications.detail('app-123'),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.applications.byJob('job-456'),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.applications.byCandidate('cand-789'),
      })
    })

    it('useDeleteApplicationMutation invalidates only provided IDs', async () => {
      const { api } = await import('@/lib/api-client')
      vi.mocked(api.delete).mockResolvedValueOnce({ success: true })

      const { useDeleteApplicationMutation } = await import('@/hooks/queries/use-applications')
      const mutation = useDeleteApplicationMutation()

      await mutation.mutateAsync({
        id: 'app-to-delete',
        jobId: 'job-456',
      })

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.applications.detail('app-to-delete'),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.applications.byJob('job-456'),
      })
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.jobs.detail('job-456'),
      })
      // Should NOT invalidate candidate-related keys when candidateId not provided
      expect(mockInvalidateQueries).not.toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: expect.arrayContaining(['byCandidate']),
        }),
      )
    })
  })
})
