'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Hook to guard against accidental navigation when form has unsaved changes.
 *
 * Features:
 * - Browser beforeunload warning for page refresh/close
 * - Next.js router interception for client-side navigation
 * - Customizable confirmation message
 *
 * Usage:
 * ```tsx
 * const { setDirty, clearDirty } = useFormDirtyGuard({
 *   enabled: form.state.isDirty,
 *   message: 'You have unsaved changes. Are you sure you want to leave?'
 * })
 * ```
 */
interface UseFormDirtyGuardOptions {
  /** Whether the form has unsaved changes */
  enabled: boolean
  /** Custom confirmation message */
  message?: string
  /** Callback when user confirms navigation */
  onConfirmLeave?: () => void
}

const DEFAULT_MESSAGE = 'You have unsaved changes. Are you sure you want to leave?'

export function useFormDirtyGuard({
  enabled,
  message = DEFAULT_MESSAGE,
  onConfirmLeave,
}: UseFormDirtyGuardOptions) {
  const isDirtyRef = useRef(enabled)
  const router = useRouter()

  // Keep ref in sync
  useEffect(() => {
    isDirtyRef.current = enabled
  }, [enabled])

  // Browser beforeunload event
  useEffect(() => {
    if (!enabled) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault()
        // Modern browsers ignore custom messages, but we set it anyway
        e.returnValue = message
        return message
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [enabled, message])

  // Provide a guarded navigation function
  const navigateWithGuard = useCallback(
    (path: string) => {
      if (isDirtyRef.current) {
        const confirmed = window.confirm(message)
        if (confirmed) {
          onConfirmLeave?.()
          router.push(path)
        }
      } else {
        router.push(path)
      }
    },
    [message, onConfirmLeave, router]
  )

  // Manual methods to set/clear dirty state (useful for programmatic control)
  const setDirty = useCallback(() => {
    isDirtyRef.current = true
  }, [])

  const clearDirty = useCallback(() => {
    isDirtyRef.current = false
  }, [])

  return {
    isDirty: enabled,
    navigateWithGuard,
    setDirty,
    clearDirty,
  }
}
