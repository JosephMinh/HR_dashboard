'use client'

import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { Button } from './button'

type FeedbackVariant = 'success' | 'error' | 'warning' | 'info' | 'loading'

interface InlineFeedbackProps {
  variant: FeedbackVariant
  title?: string
  message: string
  className?: string
  onDismiss?: () => void
  onRetry?: () => void
  retryLabel?: string
}

const variantConfig: Record<
  FeedbackVariant,
  {
    icon: LucideIcon
    containerClass: string
    iconClass: string
    titleClass: string
  }
> = {
  success: {
    icon: CheckCircle2,
    containerClass:
      'border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/50',
    iconClass: 'text-green-600 dark:text-green-400',
    titleClass: 'text-green-800 dark:text-green-200',
  },
  error: {
    icon: XCircle,
    containerClass:
      'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/50',
    iconClass: 'text-red-600 dark:text-red-400',
    titleClass: 'text-red-800 dark:text-red-200',
  },
  warning: {
    icon: AlertTriangle,
    containerClass:
      'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/50',
    iconClass: 'text-amber-600 dark:text-amber-400',
    titleClass: 'text-amber-800 dark:text-amber-200',
  },
  info: {
    icon: Info,
    containerClass:
      'border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/50',
    iconClass: 'text-blue-600 dark:text-blue-400',
    titleClass: 'text-blue-800 dark:text-blue-200',
  },
  loading: {
    icon: Loader2,
    containerClass: 'border-border bg-muted/50',
    iconClass: 'text-muted-foreground animate-spin',
    titleClass: 'text-foreground',
  },
}

export function InlineFeedback({
  variant,
  title,
  message,
  className,
  onDismiss,
  onRetry,
  retryLabel = 'Try again',
}: InlineFeedbackProps) {
  const config = variantConfig[variant]
  const IconComponent = config.icon

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-lg border px-4 py-3',
        config.containerClass,
        className
      )}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      <IconComponent
        className={cn('mt-0.5 h-5 w-5 shrink-0', config.iconClass)}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        {title && (
          <p className={cn('font-medium', config.titleClass)}>{title}</p>
        )}
        <p
          className={cn(
            'text-sm',
            title ? 'mt-0.5 text-muted-foreground' : config.titleClass
          )}
        >
          {message}
        </p>

        {/* Action buttons - only show when retry action exists */}
        {onRetry && (
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-7 px-2 text-xs"
            >
              {retryLabel}
            </Button>
            {onDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="h-7 px-2 text-xs"
              >
                Dismiss
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Dismiss button in corner */}
      {onDismiss && !onRetry && (
        <button
          onClick={onDismiss}
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dismiss"
        >
          <AlertCircle className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// Compact inline message for form validation and field-level feedback
export function InlineMessage({
  variant,
  children,
  className,
}: {
  variant: 'success' | 'error' | 'warning' | 'info'
  children: React.ReactNode
  className?: string
}) {
  const config = variantConfig[variant]
  const IconComponent = config.icon

  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-sm',
        config.iconClass,
        className
      )}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <IconComponent className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

// Operation status indicator for async transitions
export function OperationStatus({
  status,
  messages,
}: {
  status: 'idle' | 'loading' | 'success' | 'error'
  messages: {
    loading?: string
    success?: string
    error?: string
  }
}) {
  if (status === 'idle') return null

  const message = messages[status] ?? ''
  if (!message) return null

  // Loading uses spinner icon with muted styling
  if (status === 'loading') {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
        <span>{message}</span>
      </p>
    )
  }

  // Success/error use InlineMessage
  return <InlineMessage variant={status}>{message}</InlineMessage>
}
