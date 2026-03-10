'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { showSuccessToast, showErrorToast } from '@/lib/feedback'

type FeedbackStatus = 'idle' | 'submitting' | 'success' | 'error'

interface FormFeedbackState {
  status: FeedbackStatus
  message: string | null
}

interface UseFormFeedbackOptions {
  /** Entity type for toast messages (e.g., 'job', 'candidate') */
  entityType: 'job' | 'candidate' | 'application' | 'resume' | 'user'
  /** Action being performed */
  action: 'create' | 'update'
  /** Duration to show success state before returning to idle (ms) */
  successDuration?: number
  /** Whether to show toast notifications */
  showToasts?: boolean
}

/**
 * Hook for standardized form submission feedback.
 *
 * Provides:
 * - Submitting/success/error state tracking
 * - Toast notifications for success/error
 * - Auto-reset to idle after success
 * - Consistent messaging patterns
 *
 * Usage:
 * ```tsx
 * const feedback = useFormFeedback({ entityType: 'job', action: 'create' })
 *
 * const handleSubmit = async (data) => {
 *   feedback.setSubmitting()
 *   try {
 *     await saveJob(data)
 *     feedback.setSuccess('Senior Engineer')
 *   } catch (error) {
 *     feedback.setError(error)
 *   }
 * }
 * ```
 */
export function useFormFeedback({
  entityType,
  action,
  successDuration = 2000,
  showToasts = true,
}: UseFormFeedbackOptions) {
  const [state, setState] = useState<FormFeedbackState>({
    status: 'idle',
    message: null,
  })
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const clearState = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setState({ status: 'idle', message: null })
  }, [])

  const setSubmitting = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setState({ status: 'submitting', message: null })
  }, [])

  const setSuccess = useCallback(
    (entityName?: string) => {
      const actionVerb = action === 'create' ? 'created' : 'updated'
      setState({ status: 'success', message: `${entityType} ${actionVerb}` })

      if (showToasts) {
        showSuccessToast(actionVerb, entityType, entityName)
      }

      // Auto-reset to idle after duration
      timeoutRef.current = setTimeout(() => {
        setState({ status: 'idle', message: null })
      }, successDuration)
    },
    [action, entityType, showToasts, successDuration]
  )

  const setError = useCallback(
    (error?: Error | string) => {
      const errorMessage = error instanceof Error ? error.message : error
      setState({ status: 'error', message: errorMessage ?? 'An error occurred' })

      if (showToasts) {
        showErrorToast(`${action} ${entityType}`, error)
      }
    },
    [action, entityType, showToasts]
  )

  return {
    ...state,
    isSubmitting: state.status === 'submitting',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
    setSubmitting,
    setSuccess,
    setError,
    clearState,
  }
}

/**
 * Get submit button label based on feedback status.
 */
export function getSubmitLabel(
  status: FeedbackStatus,
  action: 'create' | 'update',
  entityType: string
): string {
  switch (status) {
    case 'submitting':
      return 'Saving...'
    case 'success':
      return 'Saved!'
    case 'error':
      return action === 'create' ? `Create ${entityType}` : 'Save Changes'
    default:
      return action === 'create' ? `Create ${entityType}` : 'Save Changes'
  }
}
