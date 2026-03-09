import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { Button } from './button'

interface FilterBarProps {
  children: React.ReactNode
  onClearAll?: () => void
  showClearAll?: boolean
  className?: string
}

export function FilterBar({
  children,
  onClearAll,
  showClearAll = false,
  className,
}: FilterBarProps) {
  return (
    <div className={cn(
      'flex flex-wrap items-center gap-2',
      className
    )}>
      {children}
      {showClearAll && onClearAll && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="text-muted-foreground"
        >
          <X className="h-3 w-3 mr-1" />
          Clear all
        </Button>
      )}
    </div>
  )
}
