/**
 * Query Hooks Unit Tests
 *
 * Tests for TanStack Query hooks including:
 * - Query key stability
 * - Mutation invalidation correctness
 * - Cache invalidation patterns
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  JOBS_MISSING_FILTER_SENTINEL,
  queryCachePolicy,
  queryKeys,
} from '@/lib/query-keys'

describe('normalizeJobsFilterParam', () => {
  // Import the function under test directly
  let normalizeJobsFilterParam: typeof import('@/lib/query-keys').normalizeJobsFilterParam

  beforeEach(async () => {
    ;({ normalizeJobsFilterParam } = await import('@/lib/query-keys'))
  })

  it('returns undefined for undefined input', () => {
    expect(normalizeJobsFilterParam(undefined)).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(normalizeJobsFilterParam('')).toBeUndefined()
  })

  it('returns undefined for whitespace-only string', () => {
    expect(normalizeJobsFilterParam('   ')).toBeUndefined()
  })

  it('trims a scalar string', () => {
    expect(normalizeJobsFilterParam('  Engineering  ')).toBe('Engineering')
  })

  it('passes through a normal scalar unchanged', () => {
    expect(normalizeJobsFilterParam('Remote')).toBe('Remote')
  })

  it('returns undefined for an empty array', () => {
    expect(normalizeJobsFilterParam([])).toBeUndefined()
  })

  it('returns undefined for an array of only empty/whitespace strings', () => {
    expect(normalizeJobsFilterParam(['', '  ', ''])).toBeUndefined()
  })

  it('collapses a single-element array to a scalar', () => {
    expect(normalizeJobsFilterParam(['Engineering'])).toBe('Engineering')
  })

  it('collapses a single-element array with whitespace to a trimmed scalar', () => {
    expect(normalizeJobsFilterParam(['  Remote  '])).toBe('Remote')
  })

  it('deduplicates array values', () => {
    expect(normalizeJobsFilterParam(['Engineering', 'Engineering', 'Product']))
      .toEqual(['Engineering', 'Product'])
  })

  it('deduplicates after trimming', () => {
    expect(normalizeJobsFilterParam([' Engineering ', 'Engineering']))
      .toBe('Engineering')
  })

  it('sorts array values with locale-aware comparison', () => {
    expect(normalizeJobsFilterParam(['Zebra', 'Apple', 'Mango']))
      .toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it('sorts the __MISSING__ sentinel to the end', () => {
    expect(normalizeJobsFilterParam(['__MISSING__', 'Engineering', 'Remote']))
      .toEqual(['Engineering', 'Remote', '__MISSING__'])
  })

  it('handles mixed sentinel + concrete values for nullable fields', () => {
    expect(normalizeJobsFilterParam(['Remote', '__MISSING__', 'Chicago, IL']))
      .toEqual(['Chicago, IL', 'Remote', '__MISSING__'])
  })

  it('preserves comma-containing values without splitting', () => {
    const result = normalizeJobsFilterParam(['Chicago, IL', 'New York, NY'])
    expect(result).toEqual(['Chicago, IL', 'New York, NY'])
  })

  it('uses numeric-aware sorting (e.g. L2 before L10)', () => {
    expect(normalizeJobsFilterParam(['L10', 'L2', 'L5']))
      .toEqual(['L2', 'L5', 'L10'])
  })

  it('filters out empty strings from arrays', () => {
    expect(normalizeJobsFilterParam(['Engineering', '', 'Product']))
      .toEqual(['Engineering', 'Product'])
  })
})

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

    it('includes the expanded jobs filter contract in list keys', () => {
      const filters = {
        department: ['Engineering', JOBS_MISSING_FILTER_SENTINEL],
        employeeType: 'Full Time',
        location: 'Remote',
        recruiterOwner: JOBS_MISSING_FILTER_SENTINEL,
        functionalPriority: 'P1',
        corporatePriority: 'Program',
        function: 'Platform',
        level: 'L5',
        horizon: '2026',
        asset: 'Core',
      }

      expect(queryKeys.jobs.list(filters)).toEqual(['jobs', 'list', filters])
    })

    it('normalizes multi-value jobs filters for deterministic cache keys', () => {
      const left = queryKeys.jobs.list({
        department: ['__MISSING__', 'Engineering', 'Remote'],
        location: ['Remote', 'Chicago, IL'],
      })
      const right = queryKeys.jobs.list({
        department: ['Remote', 'Engineering', '__MISSING__'],
        location: ['Chicago, IL', 'Remote'],
      })

      expect(left).toEqual(right)
      expect(left[2]).toEqual({
        department: ['Engineering', 'Remote', '__MISSING__'],
        location: ['Chicago, IL', 'Remote'],
      })
    })

    it('returns detail key with id', () => {
      expect(queryKeys.jobs.detail('abc-123')).toEqual(['jobs', 'detail', 'abc-123'])
    })

    it('returns filter-options key', () => {
      expect(queryKeys.jobs.filterOptions()).toEqual(['jobs', 'filterOptions'])
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
const mockUseQuery = vi.fn((options: unknown) => options)
const mockQueryClient = {
  invalidateQueries: mockInvalidateQueries,
  removeQueries: mockRemoveQueries,
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQuery: mockUseQuery,
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
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  buildUrl: (
    base: string,
    params?: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>,
  ) => {
    if (!params) return base

    const searchParams = new URLSearchParams()
    for (const [key, rawValue] of Object.entries(params)) {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue]

      for (const value of values) {
        if (value !== null && value !== undefined && value !== '') {
          searchParams.append(key, String(value))
        }
      }
    }

    const queryString = searchParams.toString()
    return queryString ? `${base}?${queryString}` : base
  },
  createRetryPolicy: vi.fn(() => vi.fn()),
}))

describe('query hook response contracts', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockClear()
    mockRemoveQueries.mockClear()
    mockUseQuery.mockClear()
  })

  it('unwraps candidate detail responses from the API envelope', async () => {
    const { api } = await import('@/lib/api-client')
    const candidate = {
      id: 'cand-123',
      firstName: 'Ava',
      lastName: 'Chen',
      email: 'ava@example.com',
      phone: null,
      linkedinUrl: null,
      currentCompany: null,
      location: null,
      source: null,
      resumeKey: null,
      resumeName: null,
      notes: null,
      createdAt: '2026-03-20T00:00:00.000Z',
      updatedAt: '2026-03-20T00:00:00.000Z',
    }
    vi.mocked(api.get).mockResolvedValueOnce({ candidate })

    const { useCandidateQuery } = await import('@/hooks/queries/use-candidates')
    const query = useCandidateQuery(candidate.id) as unknown as {
      queryKey: unknown
      queryFn: () => Promise<unknown>
    }

    expect(query.queryKey).toEqual(queryKeys.candidates.detail(candidate.id))
    await expect(query.queryFn()).resolves.toEqual(candidate)
  })

  it('unwraps candidate update responses from the API envelope', async () => {
    const { api } = await import('@/lib/api-client')
    const candidate = {
      id: 'cand-456',
      firstName: 'Mina',
      lastName: 'Patel',
      email: 'mina@example.com',
      phone: null,
      linkedinUrl: null,
      currentCompany: null,
      location: null,
      source: null,
      resumeKey: 'resumes/550e8400-e29b-41d4-a716-446655440000.pdf',
      resumeName: 'resume.pdf',
      notes: null,
      createdAt: '2026-03-20T00:00:00.000Z',
      updatedAt: '2026-03-20T00:00:00.000Z',
    }
    vi.mocked(api.patch).mockResolvedValueOnce({ candidate })

    const { useUpdateCandidateMutation } = await import('@/hooks/queries/use-candidates')
    const mutation = useUpdateCandidateMutation()

    await expect(
      mutation.mutateAsync({
        id: candidate.id,
        resumeKey: candidate.resumeKey,
        resumeName: candidate.resumeName,
      }),
    ).resolves.toEqual(candidate)

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.candidates.detail(candidate.id),
    })
  })

  it('uses the dashboard route contract exposed by the API', async () => {
    const { api } = await import('@/lib/api-client')
    const stats = {
      jobsOpen: 4,
      jobsClosed: 2,
      activeCriticalJobs: 1,
      activeCandidates: 7,
      pipelineHealth: {
        ahead: 1,
        onTrack: 3,
        behind: 2,
      },
      criticalJobs: [
        {
          id: 'job-1',
          title: 'Platform Engineer',
          department: 'Engineering',
          recruiterOwner: 'Ava',
          targetFillDate: '2026-04-01T00:00:00.000Z',
          pipelineHealth: 'BEHIND',
          activeCandidateCount: 2,
        },
      ],
      recentJobs: [
        {
          id: 'job-2',
          title: 'Designer',
          department: 'Design',
          status: 'OPEN',
          pipelineHealth: 'ON_TRACK',
          activeCandidateCount: 1,
          updatedAt: '2026-03-20T00:00:00.000Z',
        },
      ],
    }
    vi.mocked(api.get).mockResolvedValueOnce(stats)

    const { useDashboardStatsQuery } = await import('@/hooks/queries/use-dashboard')
    const query = useDashboardStatsQuery() as unknown as {
      queryKey: unknown
      queryFn: () => Promise<unknown>
    }

    expect(query.queryKey).toEqual(queryKeys.dashboard.stats())
    await expect(query.queryFn()).resolves.toEqual(stats)
  })
})

describe('mutation invalidation patterns', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockClear()
    mockRemoveQueries.mockClear()
    mockUseQuery.mockClear()
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

describe('jobs query hooks', () => {
  beforeEach(() => {
    mockUseQuery.mockClear()
  })

  it('useJobsQuery forwards the full jobs filter contract into the request URL', async () => {
    const { api } = await import('@/lib/api-client')
    vi.mocked(api.get).mockResolvedValueOnce({
      jobs: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    })

    const { useJobsQuery } = await import('@/hooks/queries/use-jobs')
    const filters = {
      status: 'OPEN',
      department: ['Engineering', JOBS_MISSING_FILTER_SENTINEL],
      employeeType: 'Full Time',
      location: ['Remote', 'Chicago, IL'],
      recruiterOwner: 'Jane Recruiter',
      functionalPriority: 'P1',
      corporatePriority: 'Program',
      function: 'Engineering',
      level: 'L5',
      pipelineHealth: 'AHEAD',
      priority: 'HIGH',
      horizon: '2026',
      asset: 'Core',
      search: 'platform',
      sort: 'updatedAt',
      order: 'desc' as const,
      page: 2,
      limit: 50,
      includeCount: true,
    }

    const query = useJobsQuery(filters) as unknown as {
      queryKey: unknown
      queryFn: () => Promise<unknown>
      staleTime: number
    }
    expect(query.queryKey).toEqual(queryKeys.jobs.list(filters))

    await query.queryFn()

    expect(api.get).toHaveBeenCalledWith(
      '/api/jobs?status=OPEN&department=Engineering&department=__MISSING__&pipelineHealth=AHEAD&priority=HIGH&horizon=2026&employeeType=Full+Time&function=Engineering&level=L5&asset=Core&location=Chicago%2C+IL&location=Remote&recruiterOwner=Jane+Recruiter&functionalPriority=P1&corporatePriority=Program&search=platform&sort=updatedAt&order=desc&page=2&pageSize=50&includeCount=true',
    )
    expect(query.staleTime).toBe(queryCachePolicy.jobs.list.staleTime)
  })

  it('useJobFilterOptionsQuery targets the consolidated endpoint with the long-lived cache policy', async () => {
    const { api } = await import('@/lib/api-client')
    vi.mocked(api.get).mockResolvedValueOnce({
      filters: {
        department: [],
        employeeType: [],
        location: [],
        recruiterOwner: [],
        functionalPriority: [],
        corporatePriority: [],
        function: [],
        level: [],
        horizon: [],
        asset: [],
      },
      meta: {
        missing: {
          label: 'Missing',
          placement: 'last',
        },
      },
    })

    const { useJobFilterOptionsQuery } = await import('@/hooks/queries/use-jobs')
    const query = useJobFilterOptionsQuery() as unknown as {
      queryKey: unknown
      queryFn: () => Promise<unknown>
      staleTime: number
      gcTime: number
    }

    expect(query.queryKey).toEqual(queryKeys.jobs.filterOptions())

    await query.queryFn()

    expect(api.get).toHaveBeenCalledWith('/api/jobs/filter-options')
    expect(query.staleTime).toBe(queryCachePolicy.jobs.filterOptions.staleTime)
    expect(query.gcTime).toBe(queryCachePolicy.jobs.filterOptions.gcTime)
  })
})
