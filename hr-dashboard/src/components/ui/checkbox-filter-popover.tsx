'use client'

import * as React from 'react'
import { Popover } from '@base-ui/react/popover'
import { Checkbox } from '@base-ui/react/checkbox'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JobFilterOption } from '@/lib/job-filter-constants'

interface CheckboxFilterPopoverProps {
  options: JobFilterOption[]
  selected: string[]
  onChange: (values: string[]) => void
  triggerLabel: string
  ariaLabel: string
  widthClassName?: string
  isLoading?: boolean
  missingValue?: string
  enableSearch?: boolean
}

export function CheckboxFilterPopover({
  options,
  selected,
  onChange,
  triggerLabel,
  ariaLabel,
  widthClassName,
  isLoading = false,
  missingValue = '__MISSING__',
  enableSearch = false,
}: CheckboxFilterPopoverProps) {
  const [searchTerm, setSearchTerm] = React.useState('')

  const getOptionLabel = React.useCallback((option: JobFilterOption) => {
    return option.isMissing ? 'Not Set' : option.label
  }, [])

  // Build display options: known options + any deep-linked unknowns
  const allOptions = React.useMemo(() => {
    const knownValues = new Set(options.map((o) => o.value))
    const unknowns: JobFilterOption[] = selected
      .filter((v) => !knownValues.has(v))
      .map((v) => ({
        value: v,
        label: v === missingValue ? 'Not Set' : `${v} (Unavailable)`,
        isMissing: v === missingValue,
      }))
    return [...options, ...unknowns]
  }, [options, selected, missingValue])

  // Filter options by search term (selected items always visible so they can be unchecked)
  const displayOptions = React.useMemo(() => {
    if (!enableSearch || !searchTerm.trim()) return allOptions
    const needle = searchTerm.trim().toLowerCase()
    return allOptions.filter(
      (opt) => {
        const visibleLabel = getOptionLabel(opt).toLowerCase()
        return (
          visibleLabel.includes(needle) ||
          opt.label.toLowerCase().includes(needle) ||
          selected.includes(opt.value)
        )
      },
    )
  }, [allOptions, enableSearch, getOptionLabel, searchTerm, selected])

  const handleToggle = React.useCallback(
    (value: string) => {
      if (selected.includes(value)) {
        onChange(selected.filter((v) => v !== value))
      } else {
        onChange([...selected, value])
      }
    },
    [selected, onChange],
  )

  const selectedLabels = React.useMemo(() => {
    return selected.map((value) => {
      const option = allOptions.find((entry) => entry.value === value)
      if (!option) {
        return value
      }

      return getOptionLabel(option)
    })
  }, [allOptions, getOptionLabel, selected])

  const triggerPrimaryText = selectedLabels[0] ?? triggerLabel
  const extraSelectionCount = Math.max(0, selectedLabels.length - 1)
  const triggerTitle = selectedLabels.length > 0 ? selectedLabels.join(', ') : undefined

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) setSearchTerm('')
      }}
    >
      <Popover.Trigger
        className={cn(
          'flex items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none',
          'h-8 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'dark:bg-input/30 dark:hover:bg-input/50',
          selected.length > 0 && 'border-primary/50',
          widthClassName,
        )}
        aria-label={ariaLabel}
        disabled={isLoading && selected.length === 0}
        title={triggerTitle}
      >
        <span
          className={cn(
            'flex-1 text-left truncate',
            selected.length === 0 && 'text-muted-foreground',
          )}
        >
          {isLoading && selected.length === 0 ? 'Loading...' : triggerPrimaryText}
        </span>
        {extraSelectionCount > 0 && !isLoading && (
          <>
            <span className="sr-only"> </span>
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium leading-none text-primary">
              +{extraSelectionCount}
            </span>
          </>
        )}
        <ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
          <Popover.Popup className="min-w-44 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 origin-(--transform-origin) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2">
            {enableSearch && (
              <div className="border-b px-2 py-1.5">
                <div className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    aria-label="Search filter options"
                    autoFocus
                  />
                </div>
              </div>
            )}
            <div className="max-h-56 overflow-y-auto p-1">
              {displayOptions.length === 0 && !isLoading && (
                <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                  {searchTerm.trim() ? 'No matching options' : 'No options available'}
                </div>
              )}
              {displayOptions.map((option) => {
                const isChecked = selected.includes(option.value)
                return (
                  <label
                    key={option.value}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none',
                      'hover:bg-accent hover:text-accent-foreground',
                      'has-[:focus-visible]:bg-accent has-[:focus-visible]:text-accent-foreground',
                    )}
                  >
                    <Checkbox.Root
                      checked={isChecked}
                      onCheckedChange={() => handleToggle(option.value)}
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                        isChecked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input',
                      )}
                    >
                      <Checkbox.Indicator>
                        <Check className="size-3" strokeWidth={3} />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                    <span
                      className={cn(
                        'flex-1 truncate',
                        option.isMissing && 'italic text-muted-foreground',
                      )}
                    >
                      {getOptionLabel(option)}
                    </span>
                  </label>
                )
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
