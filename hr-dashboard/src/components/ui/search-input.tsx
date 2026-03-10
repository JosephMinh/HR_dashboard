'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Search, X } from 'lucide-react'
import { Input } from './input'
import { Button } from './button'

interface SearchInputProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
  fullWidth?: boolean
}

export function SearchInput({
  value: controlledValue,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
  fullWidth = true,
}: SearchInputProps) {
  const [internalValue, setInternalValue] = useState(controlledValue ?? '')
  const isFirstRender = useRef(true)
  const lastEmittedValue = useRef(controlledValue ?? '')
  const hasPendingDebounce = useRef(false)
  const previousControlledValue = useRef(controlledValue)

  useEffect(() => {
    if (controlledValue === undefined) {
      return
    }

    if (controlledValue === previousControlledValue.current) {
      return
    }

    if (controlledValue === internalValue) {
      lastEmittedValue.current = controlledValue
      hasPendingDebounce.current = false
      previousControlledValue.current = controlledValue
      return
    }

    const isStaleControlledCatchUp =
      hasPendingDebounce.current &&
      controlledValue.length > 0 &&
      controlledValue === lastEmittedValue.current &&
      controlledValue.length < internalValue.length &&
      internalValue.startsWith(controlledValue)

    if (!isStaleControlledCatchUp) {
      lastEmittedValue.current = controlledValue
      hasPendingDebounce.current = false
      // eslint-disable-next-line react-hooks/set-state-in-effect -- required for controlled component sync
      setInternalValue(controlledValue)
    }

    previousControlledValue.current = controlledValue
  }, [controlledValue, internalValue])

  useEffect(() => {
    if (!onChange) return

    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (internalValue === lastEmittedValue.current) {
      hasPendingDebounce.current = false
      return
    }

    hasPendingDebounce.current = true
    const timer = setTimeout(() => {
      lastEmittedValue.current = internalValue
      hasPendingDebounce.current = false
      onChange(internalValue)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [internalValue, debounceMs, onChange])

  const handleClear = useCallback(() => {
    setInternalValue('')
    hasPendingDebounce.current = false
    lastEmittedValue.current = ''
    onChange?.('')
  }, [onChange])

  const handleChange = useCallback((nextValue: string) => {
    setInternalValue(nextValue)
  }, [])

  return (
    <div className={cn('relative', fullWidth ? 'w-full' : 'w-64', className)} role="search">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={internalValue}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && internalValue) {
            e.preventDefault()
            handleClear()
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder.replace('...', '')}
        className="pl-9 pr-8 shadow-xs"
      />
      {internalValue && (
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          onClick={handleClear}
          className="absolute right-1 top-1/2 -translate-y-1/2"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}
