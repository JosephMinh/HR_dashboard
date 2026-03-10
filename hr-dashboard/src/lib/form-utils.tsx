/**
 * TanStack Form + Zod Utilities
 *
 * Shared form adapters and helpers for integrating TanStack Form with Zod schemas.
 */

import { zodValidator } from '@tanstack/zod-form-adapter'
import type { z } from 'zod'

// Re-export for convenience
export { useForm } from '@tanstack/react-form'

/**
 * Get the Zod validator adapter instance
 * Use this when setting up TanStack Form with Zod validation
 *
 * @example
 * ```tsx
 * const form = useForm({
 *   defaultValues: { title: '' },
 *   validatorAdapter: getZodValidator(),
 *   validators: {
 *     onSubmit: JobSchema,
 *   },
 * })
 * ```
 */
export function getZodValidator() {
  return zodValidator()
}

/**
 * Parse form data with Zod schema and return validation result
 */
export function validateFormData<TSchema extends z.ZodType>(
  schema: TSchema,
  data: unknown
): { success: true; data: z.infer<TSchema> } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  // Convert Zod errors to field-keyed object
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const path = issue.path.join('.')
    if (!errors[path]) {
      errors[path] = issue.message
    }
  }

  return { success: false, errors }
}

/**
 * Extract error message from field meta errors
 */
export function extractErrorMessage(errors: unknown[]): string | undefined {
  if (!errors || errors.length === 0) return undefined

  const firstError = errors[0]
  if (typeof firstError === 'string') return firstError
  if (typeof firstError === 'object' && firstError !== null && 'message' in firstError) {
    return String((firstError as { message: unknown }).message)
  }
  return String(firstError)
}

/**
 * Form field wrapper props for label and error display
 */
export interface FormFieldWrapperProps {
  label: string
  name: string
  error?: string
  required?: boolean
  description?: string
  children: React.ReactNode
}

/**
 * Simple wrapper component for form fields with label and error
 */
export function FormFieldWrapper({
  label,
  name,
  error,
  required,
  description,
  children,
}: FormFieldWrapperProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
      {description && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {error && (
        <p id={`${name}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// Re-export the validator for direct use
export { zodValidator }
