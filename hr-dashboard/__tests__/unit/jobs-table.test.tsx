import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JobsTable } from '@/app/jobs/jobs-table'
import { JOBS_MISSING_FILTER_SENTINEL } from '@/lib/query-keys'

const useJobsQueryMock = vi.fn()
const useJobFilterOptionsQueryMock = vi.fn()
const pushMock = vi.fn()
const replaceMock = vi.fn()

let currentSearch = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}))

vi.mock('@/hooks/queries', () => ({
  useJobsQuery: (params: unknown) => useJobsQueryMock(params),
  useJobFilterOptionsQuery: () => useJobFilterOptionsQueryMock(),
}))

vi.mock('@/components/ui/select', async () => {
  const React = await import('react')

  type SelectItemShape = {
    label: string
    value: string
  }

  const extractText = (node: React.ReactNode): string => {
    if (typeof node === 'string' || typeof node === 'number') {
      return String(node)
    }

    if (Array.isArray(node)) {
      return node.map(extractText).join('')
    }

    if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
      return extractText(node.props.children)
    }

    return ''
  }

  const collectSelectMetadata = (
    node: React.ReactNode,
    state: { ariaLabel?: string; items: SelectItemShape[] }
  ) => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement<{ children?: React.ReactNode; value?: string; 'aria-label'?: string }>(child)) {
        return
      }

      const type = child.type as { __mockSelectPart?: string }
      if (type.__mockSelectPart === 'trigger') {
        state.ariaLabel = child.props['aria-label']
      }

      if (type.__mockSelectPart === 'item' && child.props.value !== undefined) {
        state.items.push({
          value: child.props.value,
          label: extractText(child.props.children),
        })
      }

      collectSelectMetadata(child.props.children, state)
    })
  }

  const createPart = (part: string) => {
    const Component = ({ children }: { children?: React.ReactNode }) => <>{children}</>
    ;(Component as { __mockSelectPart?: string }).__mockSelectPart = part
    return Component
  }

  const SelectTrigger = createPart('trigger')
  const SelectContent = createPart('content')
  const SelectValue = createPart('value')
  const SelectItem = createPart('item') as unknown as ({
    children,
    value,
  }: {
    children?: React.ReactNode
    value: string
  }) => JSX.Element

  const Select = ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string
    onValueChange?: (nextValue: string) => void
    disabled?: boolean
    children?: React.ReactNode
  }) => {
    const state: { ariaLabel?: string; items: SelectItemShape[] } = { items: [] }
    collectSelectMetadata(children, state)

    return (
      <select
        aria-label={state.ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        {state.items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    )
  }

  return {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  }
})

describe('JobsTable filters', () => {
  beforeEach(() => {
    currentSearch = ''
    pushMock.mockReset()
    replaceMock.mockReset()
    useJobsQueryMock.mockReset()
    useJobFilterOptionsQueryMock.mockReset()

    useJobsQueryMock.mockReturnValue({
      data: {
        jobs: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      },
      isLoading: false,
      isFetching: false,
      isPlaceholderData: false,
      error: null,
      refetch: vi.fn(),
    })

    useJobFilterOptionsQueryMock.mockReturnValue({
      data: {
        missingValue: JOBS_MISSING_FILTER_SENTINEL,
        options: {
          department: [{ value: 'Engineering', label: 'Engineering', isMissing: false }],
          employeeType: [{ value: 'Full Time', label: 'Full Time', isMissing: false }],
          location: [{ value: 'Remote', label: 'Remote', isMissing: false }],
          recruiterOwner: [{ value: 'Jane Recruiter', label: 'Jane Recruiter', isMissing: false }],
          functionalPriority: [{ value: 'P1', label: 'P1', isMissing: false }],
          corporatePriority: [{ value: 'Program', label: 'Program', isMissing: false }],
          function: [],
          level: [],
          horizon: [],
          asset: [],
        },
      },
      isLoading: false,
    })
  })

  it('threads new jobs dropdown params from the URL into useJobsQuery', () => {
    currentSearch = 'department=Engineering&employeeType=Full%20Time&location=Remote&recruiterOwner=Jane%20Recruiter&functionalPriority=P1&corporatePriority=Program&page=2'

    render(<JobsTable userCanMutate={false} />)

    expect(useJobsQueryMock).toHaveBeenCalledWith(expect.objectContaining({
      department: 'Engineering',
      employeeType: 'Full Time',
      location: 'Remote',
      recruiterOwner: 'Jane Recruiter',
      functionalPriority: 'P1',
      corporatePriority: 'Program',
      page: 2,
      limit: 20,
      includeCount: true,
    }))
  })

  it('renders the six new server-backed dropdown controls', () => {
    render(<JobsTable userCanMutate={false} />)

    expect(screen.getByLabelText('Filter by department')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by employee type')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by location')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by recruiter')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by functional priority')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by corporate priority')).toBeInTheDocument()
  })

  it('resets pagination and updates the URL when a new dropdown value is selected', () => {
    currentSearch = 'status=OPEN&page=3'

    render(<JobsTable userCanMutate={false} />)

    fireEvent.change(screen.getByLabelText('Filter by department'), {
      target: { value: 'Engineering' },
    })

    expect(replaceMock).toHaveBeenCalledWith('/jobs?status=OPEN&department=Engineering')
  })

  it('renders and applies the explicit missing-value option for nullable filters', () => {
    currentSearch = `status=OPEN&page=3&location=${JOBS_MISSING_FILTER_SENTINEL}`

    useJobFilterOptionsQueryMock.mockReturnValue({
      data: {
        missingValue: JOBS_MISSING_FILTER_SENTINEL,
        options: {
          department: [{ value: 'Engineering', label: 'Engineering', isMissing: false }],
          employeeType: [{ value: 'Full Time', label: 'Full Time', isMissing: false }],
          location: [
            { value: 'Remote', label: 'Remote', isMissing: false },
            { value: JOBS_MISSING_FILTER_SENTINEL, label: 'Missing', isMissing: true },
          ],
          recruiterOwner: [{ value: 'Jane Recruiter', label: 'Jane Recruiter', isMissing: false }],
          functionalPriority: [{ value: 'P1', label: 'P1', isMissing: false }],
          corporatePriority: [{ value: 'Program', label: 'Program', isMissing: false }],
          function: [],
          level: [],
          horizon: [],
          asset: [],
        },
      },
      isLoading: false,
    })

    render(<JobsTable userCanMutate={false} />)

    expect(screen.getByRole('option', { name: 'Not Set' })).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by location')).toHaveValue(JOBS_MISSING_FILTER_SENTINEL)
    expect(useJobsQueryMock).toHaveBeenCalledWith(expect.objectContaining({
      location: JOBS_MISSING_FILTER_SENTINEL,
      status: 'OPEN',
      page: 3,
    }))

    fireEvent.change(screen.getByLabelText('Filter by location'), {
      target: { value: JOBS_MISSING_FILTER_SENTINEL },
    })

    expect(replaceMock).toHaveBeenCalledWith(`/jobs?status=OPEN&location=${JOBS_MISSING_FILTER_SENTINEL}`)

    fireEvent.change(screen.getByLabelText('Filter by location'), {
      target: { value: 'ALL' },
    })

    expect(replaceMock).toHaveBeenLastCalledWith('/jobs?status=OPEN')
  })

  it('preserves unavailable deep-linked values so they remain understandable and clearable', () => {
    currentSearch = 'status=OPEN&page=4&corporatePriority=Legacy'

    render(<JobsTable userCanMutate={false} />)

    expect(screen.getByRole('option', { name: 'Legacy (Unavailable)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by corporate priority')).toHaveValue('Legacy')
    expect(useJobsQueryMock).toHaveBeenCalledWith(expect.objectContaining({
      corporatePriority: 'Legacy',
      status: 'OPEN',
      page: 4,
    }))

    fireEvent.change(screen.getByLabelText('Filter by corporate priority'), {
      target: { value: 'ALL' },
    })

    expect(replaceMock).toHaveBeenCalledWith('/jobs?status=OPEN')
  })

  it('treats the new dropdown params as filtered empty-state context', () => {
    currentSearch = 'department=Engineering'

    render(<JobsTable userCanMutate={false} />)

    expect(screen.getByText('No matches found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('treats the new dropdown params as active filters for clear-all', () => {
    currentSearch = 'department=Engineering'

    render(<JobsTable userCanMutate={false} />)

    fireEvent.click(screen.getByRole('button', { name: /clear all/i }))

    expect(pushMock).toHaveBeenCalledWith('/jobs')
  })
})
