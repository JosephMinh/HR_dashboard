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
  const suppressNextDebouncedEmit = useRef(false)

  useEffect(() => {
    if (controlledValue !== undefined && controlledValue !== internalValue) {
      suppressNextDebouncedEmit.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect -- required to synchronize local debounced input state with external controlled updates
      setInternalValue(controlledValue)
    }
  }, [controlledValue, internalValue])

  useEffect(() => {
    if (!onChange) return

    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (suppressNextDebouncedEmit.current) {
      suppressNextDebouncedEmit.current = false
      return
    }

    const timer = setTimeout(() => {
      onChange(internalValue)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [internalValue, debounceMs, onChange])

  const handleClear = useCallback(() => {
    setInternalValue('')
    // Trigger clear immediately and suppress the next debounced emission.
    suppressNextDebouncedEmit.current = true
    onChange?.('')
  }, [onChange])

  const handleChange = useCallback((nextValue: string) => {
    setInternalValue(nextValue)
  }, [])

  return (
    <div className={cn('relative', fullWidth ? 'w-full' : 'w-64', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="text"
        value={internalValue}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && internalValue) {
            e.preventDefault()
            handleClear()
          }
        }}
        placeholder={placeholder}
        className="pl-9 pr-8 shadow-xs"
      />
      {internalValue && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleClear}
          className="absolute right-1 top-1/2 -translate-y-1/2"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
