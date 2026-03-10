import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'
import { Button } from './button'

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'An error occurred while loading the data. Please try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-4 py-12 text-center',
        className
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 ring-1 ring-destructive/20">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">
        {title}
      </h3>
      <p className="max-w-sm text-sm text-muted-foreground mb-4">{message}</p>
      {onRetry && (
        <Button onClick={() => onRetry()} variant="outline">
          Try again
        </Button>
      )}
    </div>
  )
}
