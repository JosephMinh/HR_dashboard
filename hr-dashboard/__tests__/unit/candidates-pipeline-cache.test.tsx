/**
 * CandidatesPipeline Cache Behavior Tests
 *
 * Tests that verify the mutation → invalidation → UI update flow works correctly.
 * These tests focus on:
 * - Query data driving UI (not local state)
 * - Cache updates reflecting immediately in the component
 * - No stale data after mutations
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { queryKeys } from '@/lib/query-keys'

// Mock the API client
vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock next/navigation (useRouter is used by CandidatesPipeline)
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

// Minimal mock for status-config — spread the real module so transitive
// consumers (e.g. job-filter-constants) still find JOB_STATUS etc.
vi.mock('@/lib/status-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/status-config')>()
  return {
    ...actual,
    APPLICATION_STAGE: {
      APPLIED: { label: 'Applied', color: 'blue' },
      SCREENING: { label: 'Screening', color: 'yellow' },
      INTERVIEW: { label: 'Interview', color: 'purple' },
      OFFER: { label: 'Offer', color: 'green' },
    },
    getOrderedStages: () => [
      { key: 'APPLIED', config: { label: 'Applied', color: 'blue' } },
      { key: 'SCREENING', config: { label: 'Screening', color: 'yellow' } },
    ],
    getStatusColorClasses: () => ({ bg: 'bg-blue-100', text: 'text-blue-700' }),
  }
})

// Mock the mutation hooks
const mockUpdateMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
}
const mockDeleteMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
}

vi.mock('@/hooks/queries', () => ({
  useUpdateApplicationMutation: () => mockUpdateMutation,
  useDeleteApplicationMutation: () => mockDeleteMutation,
}))

// Import after mocks
import { CandidatesPipeline } from '@/app/jobs/[jobId]/candidates-pipeline'

interface Application {
  id: string
  stage: string
  stageUpdatedAt: string
  candidate: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    currentCompany: string | null
  }
}

const createMockApplication = (overrides: Partial<Application> & { id: string }): Application => ({
  id: overrides.id,
  stage: overrides.stage || 'APPLIED',
  stageUpdatedAt: overrides.stageUpdatedAt || new Date().toISOString(),
  candidate: {
    id: overrides.candidate?.id || `cand-${overrides.id}`,
    firstName: overrides.candidate?.firstName || 'Test',
    lastName: overrides.candidate?.lastName || 'User',
    email: overrides.candidate?.email || 'test@example.com',
    currentCompany: overrides.candidate?.currentCompany || null,
  },
})

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('CandidatesPipeline cache behavior', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
        },
      },
    })

    // Default API mock - returns empty applications (can be overridden per test)
    const { api } = await import('@/lib/api-client')
    vi.mocked(api.get).mockResolvedValue({ applications: [] })
  })

  describe('Query data drives UI', () => {
    it('renders applications from initial data', async () => {
      const initialApplications = [
        createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', currentCompany: 'Acme' } }),
        createMockApplication({ id: '2', candidate: { id: 'c2', firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com', currentCompany: 'Corp' } }),
      ]

      render(
        <CandidatesPipeline
          jobId="job-1"
          initialApplications={initialApplications}
          userCanMutate={false}
        />,
        { wrapper: createWrapper(queryClient) }
      )

      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    })

    it('updates UI when API returns new data after invalidation', async () => {
      const { api } = await import('@/lib/api-client')

      const initialApplications = [
        createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Alice', lastName: 'Smith', email: null, currentCompany: null } }),
      ]

      // First call returns initial, second call returns with new candidate
      vi.mocked(api.get)
        .mockResolvedValueOnce({
          applications: [
            createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Alice', lastName: 'Smith', email: null, currentCompany: null } }),
          ],
        })
        .mockResolvedValueOnce({
          applications: [
            createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Alice', lastName: 'Smith', email: null, currentCompany: null } }),
            createMockApplication({ id: '2', candidate: { id: 'c2', firstName: 'Charlie', lastName: 'Brown', email: null, currentCompany: null } }),
          ],
        })

      render(
        <CandidatesPipeline
          jobId="job-1"
          initialApplications={initialApplications}
          userCanMutate={false}
        />,
        { wrapper: createWrapper(queryClient) }
      )

      // Verify initial state
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()

      // Wait for initial fetch
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(1)
      })

      // Invalidate cache to trigger refetch
      await queryClient.invalidateQueries({ queryKey: queryKeys.applications.byJob('job-1') })

      // New candidate should appear after refetch
      await waitFor(() => {
        expect(screen.getByText('Charlie Brown')).toBeInTheDocument()
      })
    })
  })

  describe('Cache invalidation triggers UI update', () => {
    it('shows new data after invalidation triggers refetch', async () => {
      const { api } = await import('@/lib/api-client')

      // Initial render with one candidate
      const initialApplications = [
        createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Original', lastName: 'User', email: null, currentCompany: null } }),
      ]

      // First API call returns original, second returns with new candidate
      vi.mocked(api.get)
        .mockResolvedValueOnce({
          applications: [
            createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Original', lastName: 'User', email: null, currentCompany: null } }),
          ],
        })
        .mockResolvedValueOnce({
          applications: [
            createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Original', lastName: 'User', email: null, currentCompany: null } }),
            createMockApplication({ id: '2', candidate: { id: 'c2', firstName: 'New', lastName: 'Candidate', email: null, currentCompany: null } }),
          ],
        })

      render(
        <CandidatesPipeline
          jobId="job-1"
          initialApplications={initialApplications}
          userCanMutate={false}
        />,
        { wrapper: createWrapper(queryClient) }
      )

      // Initial state (placeholder data before fetch)
      expect(screen.getByText('Original User')).toBeInTheDocument()
      expect(screen.queryByText('New Candidate')).not.toBeInTheDocument()

      // Wait for initial fetch
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(1)
      })

      // Invalidate to trigger refetch
      await queryClient.invalidateQueries({ queryKey: queryKeys.applications.byJob('job-1') })

      // New candidate should appear after refetch
      await waitFor(() => {
        expect(screen.getByText('New Candidate')).toBeInTheDocument()
      })
    })
  })

  describe('No stale data after mutations', () => {
    it('removed candidate disappears from UI after refetch', async () => {
      const { api } = await import('@/lib/api-client')

      const initialApplications = [
        createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Alice', lastName: 'Smith', email: null, currentCompany: null } }),
        createMockApplication({ id: '2', candidate: { id: 'c2', firstName: 'Bob', lastName: 'Jones', email: null, currentCompany: null } }),
      ]

      // First API call returns both, second returns only Alice (Bob deleted)
      vi.mocked(api.get)
        .mockResolvedValueOnce({
          applications: [
            createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Alice', lastName: 'Smith', email: null, currentCompany: null } }),
            createMockApplication({ id: '2', candidate: { id: 'c2', firstName: 'Bob', lastName: 'Jones', email: null, currentCompany: null } }),
          ],
        })
        .mockResolvedValueOnce({
          applications: [
            createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Alice', lastName: 'Smith', email: null, currentCompany: null } }),
          ],
        })

      render(
        <CandidatesPipeline
          jobId="job-1"
          initialApplications={initialApplications}
          userCanMutate={true}
        />,
        { wrapper: createWrapper(queryClient) }
      )

      // Both should be visible initially (placeholder data)
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.getByText('Bob Jones')).toBeInTheDocument()

      // Wait for initial fetch
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(1)
      })

      // Invalidate to trigger refetch (simulates post-delete invalidation)
      await queryClient.invalidateQueries({ queryKey: queryKeys.applications.byJob('job-1') })

      // Bob should disappear after refetch
      await waitFor(() => {
        expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument()
      })
      // Alice should still be there
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })

    it('stage change reflects in UI when API returns updated data', async () => {
      const { api } = await import('@/lib/api-client')

      const initialApplications = [
        createMockApplication({ id: '1', stage: 'APPLIED', candidate: { id: 'c1', firstName: 'Alice', lastName: 'Smith', email: null, currentCompany: null } }),
      ]

      // First API call returns initial data, second returns updated stage
      vi.mocked(api.get)
        .mockResolvedValueOnce({
          applications: [
            createMockApplication({ id: '1', stage: 'APPLIED', candidate: { id: 'c1', firstName: 'Alice', lastName: 'Smith', email: null, currentCompany: null } }),
          ],
        })
        .mockResolvedValueOnce({
          applications: [
            createMockApplication({ id: '1', stage: 'SCREENING', candidate: { id: 'c1', firstName: 'Alice', lastName: 'Smith', email: null, currentCompany: null } }),
          ],
        })

      render(
        <CandidatesPipeline
          jobId="job-1"
          initialApplications={initialApplications}
          userCanMutate={false}
        />,
        { wrapper: createWrapper(queryClient) }
      )

      // Initial stage shown (from placeholderData before fetch completes)
      expect(screen.getByText('Applied')).toBeInTheDocument()

      // Wait for initial fetch
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(1)
      })

      // Invalidate and wait for refetch
      await queryClient.invalidateQueries({ queryKey: queryKeys.applications.byJob('job-1') })

      // New stage should appear after refetch
      await waitFor(() => {
        expect(screen.getByText('Screening')).toBeInTheDocument()
      })
    })
  })

  describe('Initial data vs query data', () => {
    it('uses initialApplications as placeholder data', () => {
      const initialApplications = [
        createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Initial', lastName: 'Data', email: null, currentCompany: null } }),
      ]

      render(
        <CandidatesPipeline
          jobId="job-1"
          initialApplications={initialApplications}
          userCanMutate={false}
        />,
        { wrapper: createWrapper(queryClient) }
      )

      // Should show initial data immediately (no loading state)
      expect(screen.getByText('Initial Data')).toBeInTheDocument()
    })

    it('API data takes precedence over initialApplications after fetch', async () => {
      const { api } = await import('@/lib/api-client')

      // API returns different data than initialApplications
      vi.mocked(api.get).mockResolvedValue({
        applications: [
          createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'API', lastName: 'Data', email: null, currentCompany: null } }),
        ],
      })

      const initialApplications = [
        createMockApplication({ id: '1', candidate: { id: 'c1', firstName: 'Initial', lastName: 'Data', email: null, currentCompany: null } }),
      ]

      render(
        <CandidatesPipeline
          jobId="job-1"
          initialApplications={initialApplications}
          userCanMutate={false}
        />,
        { wrapper: createWrapper(queryClient) }
      )

      // Initially shows placeholder data
      expect(screen.getByText('Initial Data')).toBeInTheDocument()

      // After fetch completes, should show API data
      await waitFor(() => {
        expect(screen.getByText('API Data')).toBeInTheDocument()
      })
      expect(screen.queryByText('Initial Data')).not.toBeInTheDocument()
    })
  })
})
