import { toast } from 'sonner'

// Standardized feedback patterns for mutations and user actions
// These patterns ensure consistent, premium-feeling user feedback across the app

// ============================================================================
// TOAST FEEDBACK PATTERNS
// ============================================================================

type EntityType = 'job' | 'candidate' | 'application' | 'resume' | 'user'

// Success feedback with consistent language
export function showSuccessToast(
  action: 'created' | 'updated' | 'deleted' | 'saved' | 'uploaded' | 'sent',
  entityType: EntityType,
  entityName?: string
) {
  const actionVerbs = {
    created: 'created',
    updated: 'updated',
    deleted: 'deleted',
    saved: 'saved',
    uploaded: 'uploaded',
    sent: 'sent',
  }

  const entityLabels: Record<EntityType, string> = {
    job: 'Job',
    candidate: 'Candidate',
    application: 'Application',
    resume: 'Resume',
    user: 'User',
  }

  const label = entityLabels[entityType]
  const verb = actionVerbs[action]
  const description = entityName ? `"${entityName}" has been ${verb}.` : undefined

  toast.success(`${label} ${verb}`, {
    description,
  })
}

// Error feedback with action context
export function showErrorToast(
  action: string,
  error?: string | Error
) {
  const errorMessage = error instanceof Error ? error.message : error

  toast.error(`Failed to ${action}`, {
    description: errorMessage ?? 'Please try again or contact support if the problem persists.',
  })
}

// Warning feedback for non-critical issues
export function showWarningToast(title: string, description?: string) {
  toast.warning(title, { description })
}

// Info feedback for neutral notifications
export function showInfoToast(title: string, description?: string) {
  toast.info(title, { description })
}

// Loading toast with promise pattern for async operations
export function showLoadingToast<T>(
  promise: Promise<T>,
  messages: {
    loading: string
    success: string | ((data: T) => string)
    error: string | ((error: Error) => string)
  }
): Promise<T> {
  toast.promise(promise, {
    loading: messages.loading,
    success: messages.success,
    error: messages.error,
  })
  return promise
}

// ============================================================================
// MUTATION FEEDBACK HELPERS
// ============================================================================

// Standard create operation feedback
export async function withCreateFeedback<T>(
  promise: Promise<T>,
  entityType: EntityType,
  getName?: (result: T) => string
): Promise<T> {
  try {
    const result = await promise
    const name = getName?.(result)
    showSuccessToast('created', entityType, name)
    return result
  } catch (error) {
    showErrorToast(`create ${entityType}`, error instanceof Error ? error : undefined)
    throw error
  }
}

// Standard update operation feedback
export async function withUpdateFeedback<T>(
  promise: Promise<T>,
  entityType: EntityType,
  entityName?: string
): Promise<T> {
  try {
    const result = await promise
    showSuccessToast('updated', entityType, entityName)
    return result
  } catch (error) {
    showErrorToast(`update ${entityType}`, error instanceof Error ? error : undefined)
    throw error
  }
}

// Standard delete operation feedback
export async function withDeleteFeedback<T>(
  promise: Promise<T>,
  entityType: EntityType,
  entityName?: string
): Promise<T> {
  try {
    const result = await promise
    showSuccessToast('deleted', entityType, entityName)
    return result
  } catch (error) {
    showErrorToast(`delete ${entityType}`, error instanceof Error ? error : undefined)
    throw error
  }
}

// ============================================================================
// INLINE FEEDBACK CONFIGURATION
// ============================================================================

// When to use toast vs inline feedback:
//
// USE TOAST:
// - Background operations (auto-save, sync)
// - Global confirmations (logout, settings saved)
// - Operations that don't have a natural inline location
// - Success states for completed flows (form submitted)
//
// USE INLINE FEEDBACK:
// - Form validation errors (show at field level)
// - Operation errors that need user action (retry in context)
// - Loading states for buttons/inputs
// - Progress indicators for multi-step operations

export const feedbackConfig = {
  // Auto-dismiss timing
  toastDuration: {
    success: 3000,
    error: 5000,
    warning: 4000,
    info: 3000,
  },

  // Standard loading messages
  loadingMessages: {
    saving: 'Saving changes...',
    creating: 'Creating...',
    deleting: 'Deleting...',
    uploading: 'Uploading...',
    loading: 'Loading...',
  },

  // Standard error recovery text
  errorRecovery: {
    retry: 'Try again',
    cancel: 'Cancel',
    contactSupport: 'Contact support',
  },
} as const
