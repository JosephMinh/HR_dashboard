'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface LoadingTransitionProps {
  isLoading: boolean
  /** Minimum time to show loading state (prevents flash for fast loads) */
  minLoadingMs?: number
  /** Skeleton/loading content */
  skeleton: React.ReactNode
  /** Loaded content */
  children: React.ReactNode
  /** Additional class for the wrapper */
  className?: string
}

/**
 * Smoothly transitions between loading and loaded states with:
 * - Fade transition to prevent jarring state changes
 * - Optional minimum loading time to prevent flash
 * - Motion-safe animations that respect reduced-motion preferences
 */
export function LoadingTransition({
  isLoading,
  minLoadingMs = 0,
  skeleton,
  children,
  className,
}: LoadingTransitionProps) {
  const [showLoading, setShowLoading] = React.useState(isLoading)
  const loadingStartRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (isLoading) {
      // Started loading - record time
      loadingStartRef.current = Date.now()
      setShowLoading(true)
    } else if (loadingStartRef.current !== null) {
      // Finished loading - ensure minimum display time
      const elapsed = Date.now() - loadingStartRef.current
      const remaining = Math.max(0, minLoadingMs - elapsed)

      if (remaining > 0) {
        const timer = setTimeout(() => {
          setShowLoading(false)
          loadingStartRef.current = null
        }, remaining)
        return () => clearTimeout(timer)
      }

      setShowLoading(false)
      loadingStartRef.current = null
    }
  }, [isLoading, minLoadingMs])

  return (
    <div className={cn('relative', className)}>
      {/* Loading skeleton with fade transition */}
      <div
        className={cn(
          'transition-opacity duration-150 motion-reduce:duration-0',
          showLoading ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'
        )}
        aria-hidden={showLoading ? 'false' : 'true'}
      >
        {skeleton}
      </div>

      {/* Loaded content with fade transition */}
      <div
        className={cn(
          'transition-opacity duration-150 motion-reduce:duration-0',
          showLoading ? 'opacity-0 pointer-events-none absolute inset-0' : 'opacity-100'
        )}
        aria-hidden={showLoading ? 'true' : 'false'}
      >
        {children}
      </div>
    </div>
  )
}

interface DelayedLoadingProps {
  isLoading: boolean
  /** Delay before showing loading indicator (prevents flash for fast loads) */
  delayMs?: number
  children: React.ReactNode
}

/**
 * Shows loading indicator only after a delay.
 * Prevents loading state flash for operations that complete quickly.
 */
export function DelayedLoading({
  isLoading,
  delayMs = 200,
  children,
}: DelayedLoadingProps) {
  const [showLoading, setShowLoading] = React.useState(false)

  React.useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setShowLoading(true), delayMs)
      return () => clearTimeout(timer)
    }
    setShowLoading(false)
  }, [isLoading, delayMs])

  if (!showLoading) return null

  return <>{children}</>
}

interface LoadingOverlayProps {
  isLoading: boolean
  /** Delay before showing overlay */
  delayMs?: number
  className?: string
}

/**
 * Semi-transparent overlay for inline loading states.
 * Shows a subtle overlay with spinner after a delay.
 */
export function LoadingOverlay({
  isLoading,
  delayMs = 150,
  className,
}: LoadingOverlayProps) {
  const [show, setShow] = React.useState(false)

  React.useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setShow(true), delayMs)
      return () => clearTimeout(timer)
    }
    setShow(false)
  }, [isLoading, delayMs])

  if (!show) return null

  return (
    <div
      className={cn(
        'absolute inset-0 flex items-center justify-center',
        'bg-background/60 backdrop-blur-[1px]',
        'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150',
        'motion-reduce:animate-none',
        className
      )}
      aria-label="Loading"
    >
      <div className="h-5 w-5 rounded-full border-2 border-primary/30 border-t-primary motion-safe:animate-spin motion-reduce:animate-none" />
    </div>
  )
}
