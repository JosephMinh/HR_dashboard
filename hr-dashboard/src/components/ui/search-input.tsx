'use client'

import { useEffect, useState, useCallback } from 'react'
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
  const isControlled = controlledValue !== undefined
  const [internalValue, setInternalValue] = useState(controlledValue ?? '')
  const value = isControlled ? controlledValue : internalValue

  // Debounced onChange
  useEffect(() => {
    if (!onChange) return

    const timer = setTimeout(() => {
      onChange(value)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [value, debounceMs, onChange])

  const handleClear = useCallback(() => {
    if (!isControlled) {
      setInternalValue('')
    }
  }, [isControlled])

  const handleChange = useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setInternalValue(nextValue)
      }

      if (isControlled) {
        onChange?.(nextValue)
      }
    },
    [isControlled, onChange]
  )

  return (
    <div className={cn('relative', fullWidth ? 'w-full' : 'w-64', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleClear}
          className="absolute right-1 top-1/2 -translate-y-1/2"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
