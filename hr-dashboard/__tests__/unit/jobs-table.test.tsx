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

interface MockOption {
  value: string
  label: string
  isMissing: boolean
}

vi.mock('@/components/ui/checkbox-filter-popover', async () => {
  const React = await import('react')

  return {
    CheckboxFilterPopover: ({
      options,
      selected,
      onChange,
      ariaLabel,
      missingValue = '__MISSING__',
    }: {
      options: MockOption[]
      selected: string[]
      onChange: (values: string[]) => void
      ariaLabel: string
      widthClassName?: string
      missingValue?: string
    }) => {
      const knownValues = new Set(options.map((o) => o.value))
      const unknowns = selected
        .filter((v) => !knownValues.has(v))
        .map((v) => ({
          value: v,
          label: v === missingValue ? 'Not Set' : `${v} (Unavailable)`,
          isMissing: v === missingValue,
        }))
      const allOptions = [...options, ...unknowns]

      return (
        <div aria-label={ariaLabel} role="group">
          {allOptions.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => {
                  if (selected.includes(option.value)) {
                    onChange(selected.filter((v) => v !== option.value))
                  } else {
                    onChange([...selected, option.value])
                  }
                }}
                value={option.value}
              />
              {option.isMissing ? 'Not Set' : option.label}
            </label>
          ))}
        </div>
      )
    },
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

  it('threads multi-value filter params from the URL into useJobsQuery', () => {
    currentSearch = 'department=Engineering&employeeType=Full%20Time&location=Remote&recruiterOwner=Jane%20Recruiter&functionalPriority=P1&corporatePriority=Program&page=2'

    render(<JobsTable userCanMutate={false} />)

    expect(useJobsQueryMock).toHaveBeenCalledWith(expect.objectContaining({
      department: ['Engineering'],
      employeeType: ['Full Time'],
      location: ['Remote'],
      recruiterOwner: ['Jane Recruiter'],
      functionalPriority: ['P1'],
      corporatePriority: ['Program'],
      page: 2,
      limit: 20,
      includeCount: true,
    }))
  })

  it('renders all nine visible checkbox multi-select filter controls', () => {
    render(<JobsTable userCanMutate={false} />)

    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by priority')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by pipeline health')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by department')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by employee type')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by location')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by recruiter')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by functional priority')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by corporate priority')).toBeInTheDocument()
  })

  it('resets pagination and writes repeated params when a checkbox is toggled', () => {
    currentSearch = 'status=OPEN&page=3'

    render(<JobsTable userCanMutate={false} />)

    fireEvent.click(screen.getByLabelText('Engineering'))

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

    // The "Not Set" checkbox should be rendered and checked
    expect(screen.getByText('Not Set')).toBeInTheDocument()
    const notSetCheckbox = screen.getByRole('checkbox', { name: 'Not Set' })
    expect(notSetCheckbox).toBeChecked()

    // useJobsQuery receives the sentinel as an array element
    expect(useJobsQueryMock).toHaveBeenCalledWith(expect.objectContaining({
      location: [JOBS_MISSING_FILTER_SENTINEL],
      status: ['OPEN'],
      page: 3,
    }))

    // Unchecking the "Not Set" checkbox removes it from the URL
    fireEvent.click(notSetCheckbox)
    expect(replaceMock).toHaveBeenCalledWith('/jobs?status=OPEN')
  })

  it('preserves unavailable deep-linked values so they remain visible and clearable', () => {
    currentSearch = 'status=OPEN&page=4&corporatePriority=Legacy'

    render(<JobsTable userCanMutate={false} />)

    expect(screen.getByText('Legacy (Unavailable)')).toBeInTheDocument()
    const legacyCheckbox = screen.getByRole('checkbox', { name: 'Legacy (Unavailable)' })
    expect(legacyCheckbox).toBeChecked()

    expect(useJobsQueryMock).toHaveBeenCalledWith(expect.objectContaining({
      corporatePriority: ['Legacy'],
      status: ['OPEN'],
      page: 4,
    }))

    // Unchecking the unavailable value removes it from the URL
    fireEvent.click(legacyCheckbox)
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

  it('threads multiple selections in the same category to useJobsQuery', () => {
    currentSearch = 'department=Engineering&department=Sales&location=Remote&location=New%20York'

    useJobFilterOptionsQueryMock.mockReturnValue({
      data: {
        missingValue: JOBS_MISSING_FILTER_SENTINEL,
        options: {
          department: [
            { value: 'Engineering', label: 'Engineering', isMissing: false },
            { value: 'Sales', label: 'Sales', isMissing: false },
          ],
          employeeType: [],
          location: [
            { value: 'Remote', label: 'Remote', isMissing: false },
            { value: 'New York', label: 'New York', isMissing: false },
          ],
          recruiterOwner: [],
          functionalPriority: [],
          corporatePriority: [],
          function: [],
          level: [],
          horizon: [],
          asset: [],
        },
      },
      isLoading: false,
    })

    render(<JobsTable userCanMutate={false} />)

    expect(useJobsQueryMock).toHaveBeenCalledWith(expect.objectContaining({
      department: ['Engineering', 'Sales'],
      location: ['Remote', 'New York'],
    }))
  })

  it('unchecking one value in a multi-select preserves the other values', () => {
    currentSearch = 'department=Engineering&department=Sales'

    useJobFilterOptionsQueryMock.mockReturnValue({
      data: {
        missingValue: JOBS_MISSING_FILTER_SENTINEL,
        options: {
          department: [
            { value: 'Engineering', label: 'Engineering', isMissing: false },
            { value: 'Sales', label: 'Sales', isMissing: false },
          ],
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
      },
      isLoading: false,
    })

    render(<JobsTable userCanMutate={false} />)

    // Uncheck "Engineering" — "Sales" should remain
    const engineeringCheckbox = screen.getByRole('checkbox', { name: 'Engineering' })
    fireEvent.click(engineeringCheckbox)

    expect(replaceMock).toHaveBeenCalledWith('/jobs?department=Sales')
  })

  it('all nine filter groups are accessible with their aria-labels', () => {
    render(<JobsTable userCanMutate={false} />)

    const expectedLabels = [
      'Filter by status',
      'Filter by priority',
      'Filter by pipeline health',
      'Filter by department',
      'Filter by employee type',
      'Filter by location',
      'Filter by recruiter',
      'Filter by functional priority',
      'Filter by corporate priority',
    ]
    for (const label of expectedLabels) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('writes enum multi-select params in canonical option order instead of click order', () => {
    const { rerender } = render(<JobsTable userCanMutate={false} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Offer' }))
    currentSearch = 'status=OFFER'
    rerender(<JobsTable userCanMutate={false} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Open' }))

    expect(replaceMock).toHaveBeenLastCalledWith('/jobs?status=OPEN&status=OFFER')
  })

  it('writes missing-value selections after concrete values for nullable filters', () => {
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

    const { rerender } = render(<JobsTable userCanMutate={false} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Not Set' }))
    currentSearch = `location=${JOBS_MISSING_FILTER_SENTINEL}`
    rerender(<JobsTable userCanMutate={false} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Remote' }))

    expect(replaceMock).toHaveBeenLastCalledWith(
      `/jobs?location=Remote&location=${JOBS_MISSING_FILTER_SENTINEL}`,
    )
  })
})
