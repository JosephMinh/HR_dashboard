'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { buttonVariants } from './button-variants'
import {
  type StateType,
  type ActionType,
  getStateConfig,
  getActionConfig,
  interpolateCopy,
  ICON_STYLE_CLASSES,
} from '@/lib/state-surface-taxonomy'

// ============================================================================
// STATE SURFACE COMPONENT
// ============================================================================

interface StateSurfaceProps {
  type: StateType
  resource?: string         // e.g., "jobs", "candidates"
  searchQuery?: string      // For empty-search state
  errorDetails?: {          // Technical details for error states
    message?: string
    code?: string
    digest?: string
  }
  onRetry?: () => void      // Callback for retry action
  onClearFilters?: () => void // Callback for clear filters action
  onCreate?: () => void     // Callback for create action
  createLabel?: string      // Custom label for create button
  className?: string
  compact?: boolean         // Compact mode for inline/embedded use
}

export function StateSurface({
  type,
  resource = 'items',
  searchQuery,
  errorDetails,
  onRetry,
  onClearFilters,
  onCreate,
  createLabel,
  className,
  compact = false,
}: StateSurfaceProps) {
  const router = useRouter()
  const config = getStateConfig(type)
  const iconStyleClasses = ICON_STYLE_CLASSES[config.iconStyle]

  // Interpolate variables into copy
  const title = interpolateCopy(config.title, { resource, query: searchQuery ?? '' })
  const description = interpolateCopy(config.description, { resource, query: searchQuery ?? '' })

  // Handle actions
  const handleAction = useCallback((actionType: ActionType) => {
    switch (actionType) {
      case 'retry':
        onRetry?.()
        break
      case 'create':
        onCreate?.()
        break
      case 'clear-filters':
        onClearFilters?.()
        break
      case 'navigate-home':
        router.push('/')
        break
      case 'navigate-back':
        router.back()
        break
      case 'login':
        router.push('/login')
        break
      case 'refresh':
        window.location.reload()
        break
      case 'contact-support':
        // Could be configured to open a support widget or mailto
        break
    }
  }, [router, onRetry, onCreate, onClearFilters])

  const Icon = config.icon

  // Render primary action button
  const renderAction = (actionType: ActionType | undefined, isPrimary: boolean) => {
    if (!actionType) return null

    const actionConfig = getActionConfig(actionType)
    const ActionIcon = actionConfig.icon

    // Check if action is actionable
    const isActionable = (
      (actionType === 'retry' && onRetry) ||
      (actionType === 'create' && onCreate) ||
      (actionType === 'clear-filters' && onClearFilters) ||
      ['navigate-home', 'navigate-back', 'login', 'refresh', 'contact-support'].includes(actionType)
    )

    if (!isActionable) return null

    const label = actionType === 'create' && createLabel
      ? createLabel
      : interpolateCopy(actionConfig.label, { resource })

    const variant = isPrimary ? 'default' : 'outline'

    // For navigation actions, use Link
    if (actionType === 'navigate-home') {
      return (
        <Link href="/" className={buttonVariants({ variant, size: compact ? 'sm' : 'default' })}>
          <ActionIcon className={cn('h-4 w-4', !compact && 'mr-2')} />
          {!compact && label}
        </Link>
      )
    }

    if (actionType === 'login') {
      return (
        <Link href="/login" className={buttonVariants({ variant, size: compact ? 'sm' : 'default' })}>
          <ActionIcon className={cn('h-4 w-4', !compact && 'mr-2')} />
          {!compact && label}
        </Link>
      )
    }

    return (
      <Button
        variant={variant}
        size={compact ? 'sm' : 'default'}
        onClick={() => handleAction(actionType)}
      >
        <ActionIcon className={cn('h-4 w-4', !compact && 'mr-2')} />
        {!compact && label}
      </Button>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-6 px-4' : 'py-12 px-4',
        className
      )}
    >
      {/* Icon with premium treatment */}
      <div
        className={cn(
          'flex items-center justify-center rounded-2xl ring-1 ring-border/50',
          compact ? 'h-12 w-12 mb-3' : 'h-16 w-16 mb-4',
          iconStyleClasses.container
        )}
      >
        <Icon
          className={cn(
            iconStyleClasses.icon,
            compact ? 'h-6 w-6' : 'h-8 w-8'
          )}
        />
      </div>

      {/* Title */}
      <h3
        className={cn(
          'font-semibold tracking-tight text-foreground',
          compact ? 'text-base mb-0.5' : 'text-lg mb-1'
        )}
      >
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p
          className={cn(
            'text-muted-foreground max-w-sm',
            compact ? 'text-xs mb-3' : 'text-sm mb-4'
          )}
        >
          {description}
        </p>
      )}

      {/* Technical details for error states */}
      {config.showTechnicalDetails && errorDetails && (
        <div
          className={cn(
            'rounded-lg border border-border/50 bg-muted/30 px-3 py-2 mb-4',
            compact && 'text-xs'
          )}
        >
          {errorDetails.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              Error ID: {errorDetails.digest}
            </p>
          )}
          {errorDetails.code && !errorDetails.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              Code: {errorDetails.code}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className={cn('flex items-center', compact ? 'gap-2' : 'gap-3')}>
        {renderAction(config.primaryAction, true)}
        {renderAction(config.secondaryAction, false)}
      </div>
    </div>
  )
}

// ============================================================================
// CONVENIENCE COMPONENTS
// ============================================================================

interface EmptyStateSurfaceProps {
  resource?: string
  hasFilters?: boolean
  hasSearch?: boolean
  searchQuery?: string
  onCreate?: () => void
  createLabel?: string
  onClearFilters?: () => void
  className?: string
  compact?: boolean
}

export function EmptyStateSurface({
  resource = 'items',
  hasFilters = false,
  hasSearch = false,
  searchQuery,
  onCreate,
  createLabel,
  onClearFilters,
  className,
  compact,
}: EmptyStateSurfaceProps) {
  let type: StateType = 'empty'
  if (hasSearch && searchQuery) {
    type = 'empty-search'
  } else if (hasFilters) {
    type = 'empty-filtered'
  }

  return (
    <StateSurface
      type={type}
      resource={resource}
      searchQuery={searchQuery}
      onCreate={onCreate}
      createLabel={createLabel}
      onClearFilters={onClearFilters}
      className={className}
      compact={compact}
    />
  )
}

interface ErrorStateSurfaceProps {
  error?: Error & { status?: number; code?: string; digest?: string }
  message?: string
  onRetry?: () => void
  className?: string
  compact?: boolean
}

export function ErrorStateSurface({
  error,
  message,
  onRetry,
  className,
  compact,
}: ErrorStateSurfaceProps) {
  // Determine error type from error object
  let type: StateType = 'error-unknown'
  if (error) {
    if (error.status === 401) type = 'unauthenticated'
    else if (error.status === 403) type = 'unauthorized'
    else if (error.status === 404) type = 'not-found'
    else if (error.status && error.status >= 500) type = 'error-server'
    else if (error.status && error.status >= 400) type = 'error-client'
    else if (error.message?.includes('fetch') || error.message?.includes('network')) {
      type = 'error-network'
    }
  }

  return (
    <StateSurface
      type={type}
      onRetry={onRetry}
      errorDetails={error ? {
        message: message ?? error.message,
        code: error.code,
        digest: error.digest,
      } : undefined}
      className={className}
      compact={compact}
    />
  )
}

interface UnauthorizedStateSurfaceProps {
  reason?: 'unauthorized' | 'unauthenticated'
  className?: string
  compact?: boolean
}

export function UnauthorizedStateSurface({
  reason = 'unauthorized',
  className,
  compact,
}: UnauthorizedStateSurfaceProps) {
  return (
    <StateSurface
      type={reason}
      className={className}
      compact={compact}
    />
  )
}

interface NotFoundStateSurfaceProps {
  resource?: string
  className?: string
  compact?: boolean
}

export function NotFoundStateSurface({
  resource,
  className,
  compact,
}: NotFoundStateSurfaceProps) {
  return (
    <StateSurface
      type="not-found"
      resource={resource}
      className={className}
      compact={compact}
    />
  )
}
