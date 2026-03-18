import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CheckboxFilterPopover } from '@/components/ui/checkbox-filter-popover'

// Mock Base UI Popover to render inline (no portal)
vi.mock('@base-ui/react/popover', () => {
  return {
    Popover: {
      Root: ({ children }: { children: React.ReactNode }) => {
        // Always render children as "open"
        return <div data-testid="popover-root">{children}</div>
      },
      Trigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
        <button type="button" {...props}>{children}</button>
      ),
      Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      Positioner: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popover-popup">{children}</div>,
    },
  }
})

// Mock Base UI Checkbox to render a native checkbox
vi.mock('@base-ui/react/checkbox', () => {
  return {
    Checkbox: {
      Root: ({
        checked,
        onCheckedChange,
        children,
        ...props
      }: {
        checked: boolean
        onCheckedChange: () => void
        children?: React.ReactNode
      }) => {
        void children

        return (
          <input
            type="checkbox"
            checked={checked}
            onChange={onCheckedChange}
            {...props}
          />
        )
      },
      Indicator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
  }
})

const locationOptions = [
  { value: 'New York', label: 'New York', isMissing: false },
  { value: 'San Francisco', label: 'San Francisco', isMissing: false },
  { value: 'Chicago, IL', label: 'Chicago, IL', isMissing: false },
  { value: 'Remote', label: 'Remote', isMissing: false },
  { value: 'London', label: 'London', isMissing: false },
  { value: '__MISSING__', label: 'Missing', isMissing: true },
]

describe('CheckboxFilterPopover search', () => {
  it('does not show search input when enableSearch is false', () => {
    render(
      <CheckboxFilterPopover
        options={locationOptions}
        selected={[]}
        onChange={() => {}}
        triggerLabel="All Locations"
        ariaLabel="Filter by location"
      />,
    )

    expect(screen.queryByLabelText('Search filter options')).not.toBeInTheDocument()
  })

  it('shows search input when enableSearch is true', () => {
    render(
      <CheckboxFilterPopover
        options={locationOptions}
        selected={[]}
        onChange={() => {}}
        triggerLabel="All Locations"
        ariaLabel="Filter by location"
        enableSearch
      />,
    )

    expect(screen.getByLabelText('Search filter options')).toBeInTheDocument()
  })

  it('filters options by search term', () => {
    render(
      <CheckboxFilterPopover
        options={locationOptions}
        selected={[]}
        onChange={() => {}}
        triggerLabel="All Locations"
        ariaLabel="Filter by location"
        enableSearch
      />,
    )

    const searchInput = screen.getByLabelText('Search filter options')
    fireEvent.change(searchInput, { target: { value: 'new' } })

    expect(screen.getByText('New York')).toBeInTheDocument()
    expect(screen.queryByText('San Francisco')).not.toBeInTheDocument()
    expect(screen.queryByText('Remote')).not.toBeInTheDocument()
  })

  it('keeps selected items visible even when they do not match search', () => {
    render(
      <CheckboxFilterPopover
        options={locationOptions}
        selected={['Remote']}
        onChange={() => {}}
        triggerLabel="All Locations"
        ariaLabel="Filter by location"
        enableSearch
      />,
    )

    const searchInput = screen.getByLabelText('Search filter options')
    fireEvent.change(searchInput, { target: { value: 'new' } })

    // "New York" matches search
    expect(screen.getByText('New York')).toBeInTheDocument()
    // "Remote" doesn't match search but is selected, so still visible in the options list
    // (also appears in the trigger, so use getAllByText)
    const remoteElements = screen.getAllByText('Remote')
    expect(remoteElements.length).toBeGreaterThanOrEqual(2) // trigger + option
    // "London" doesn't match and isn't selected
    expect(screen.queryByText('London')).not.toBeInTheDocument()
  })

  it('shows "No matching options" when search yields no results', () => {
    render(
      <CheckboxFilterPopover
        options={locationOptions}
        selected={[]}
        onChange={() => {}}
        triggerLabel="All Locations"
        ariaLabel="Filter by location"
        enableSearch
      />,
    )

    const searchInput = screen.getByLabelText('Search filter options')
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } })

    expect(screen.getByText('No matching options')).toBeInTheDocument()
  })

  it('search is case-insensitive', () => {
    render(
      <CheckboxFilterPopover
        options={locationOptions}
        selected={[]}
        onChange={() => {}}
        triggerLabel="All Locations"
        ariaLabel="Filter by location"
        enableSearch
      />,
    )

    const searchInput = screen.getByLabelText('Search filter options')
    fireEvent.change(searchInput, { target: { value: 'SAN' } })

    expect(screen.getByText('San Francisco')).toBeInTheDocument()
    expect(screen.queryByText('New York')).not.toBeInTheDocument()
  })
})

describe('CheckboxFilterPopover trigger summary', () => {
  const simpleOptions = [
    { value: 'A', label: 'Alpha', isMissing: false },
    { value: 'B', label: 'Beta', isMissing: false },
    { value: 'C', label: 'Gamma', isMissing: false },
  ]

  it('shows triggerLabel when nothing is selected', () => {
    render(
      <CheckboxFilterPopover
        options={simpleOptions}
        selected={[]}
        onChange={() => {}}
        triggerLabel="All Items"
        ariaLabel="Filter"
      />,
    )
    expect(screen.getByText('All Items')).toBeInTheDocument()
  })

  it('shows the single selected label', () => {
    render(
      <CheckboxFilterPopover
        options={simpleOptions}
        selected={['B']}
        onChange={() => {}}
        triggerLabel="All Items"
        ariaLabel="Filter"
      />,
    )
    // Trigger shows "Beta" (also in the options list)
    const trigger = screen.getByLabelText('Filter')
    expect(trigger).toHaveTextContent('Beta')
  })

  it('shows first label + count for multiple selections', () => {
    render(
      <CheckboxFilterPopover
        options={simpleOptions}
        selected={['A', 'C']}
        onChange={() => {}}
        triggerLabel="All Items"
        ariaLabel="Filter"
      />,
    )
    const trigger = screen.getByLabelText('Filter')
    expect(trigger).toHaveTextContent('Alpha +1')
  })

  it('exposes the full selected summary on the collapsed trigger', () => {
    render(
      <CheckboxFilterPopover
        options={simpleOptions}
        selected={['A', 'C']}
        onChange={() => {}}
        triggerLabel="All Items"
        ariaLabel="Filter"
      />,
    )

    expect(screen.getByLabelText('Filter')).toHaveAttribute('title', 'Alpha, Gamma')
  })

  it('shows "Not Set" for missing-value selections', () => {
    const optionsWithMissing = [
      ...simpleOptions,
      { value: '__MISSING__', label: 'Missing', isMissing: true },
    ]
    render(
      <CheckboxFilterPopover
        options={optionsWithMissing}
        selected={['__MISSING__']}
        onChange={() => {}}
        triggerLabel="All Items"
        ariaLabel="Filter"
      />,
    )
    const trigger = screen.getByLabelText('Filter')
    expect(trigger).toHaveTextContent('Not Set')
  })

  it('uses missing and unavailable display labels in the full selected summary', () => {
    render(
      <CheckboxFilterPopover
        options={simpleOptions}
        selected={['__MISSING__', 'Legacy']}
        onChange={() => {}}
        triggerLabel="All Items"
        ariaLabel="Filter"
      />,
    )

    const trigger = screen.getByLabelText('Filter')
    expect(trigger).toHaveTextContent('Not Set +1')
    expect(trigger).toHaveAttribute('title', 'Not Set, Legacy (Unavailable)')
  })
})
