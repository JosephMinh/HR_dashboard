import { zodValidator } from '@tanstack/zod-form-adapter'
import type { ZodTypeAny } from 'zod'

export const zodFormValidatorAdapter = zodValidator()

/**
 * Validation timing options for forms.
 *
 * - 'eager': Validates on every change (can feel aggressive)
 * - 'standard': Validates on blur + submit (recommended for most forms)
 * - 'lazy': Validates only on submit (for simple forms)
 */
export type ValidationTiming = 'eager' | 'standard' | 'lazy'

interface CreateZodFormOptionsConfig {
  /** When to run validation. Default: 'standard' (onBlur + onSubmit) */
  timing?: ValidationTiming
}

/**
 * Creates TanStack Form options with standardized Zod validation.
 *
 * Default timing is 'standard' which validates:
 * - onBlur: When user leaves a field (catches errors early without being annoying)
 * - onSubmit: Final validation before submission
 *
 * This approach provides good UX: users see errors when they move to the next field,
 * not while they're still typing.
 */
export function createZodFormOptions<TSchema extends ZodTypeAny>(
  schema: TSchema,
  config: CreateZodFormOptionsConfig = {}
) {
  const { timing = 'standard' } = config

  // Build validators based on timing preference
  const validators: Record<string, TSchema> = {
    onSubmit: schema, // Always validate on submit
  }

  if (timing === 'eager') {
    validators.onChange = schema
    validators.onBlur = schema
  } else if (timing === 'standard') {
    validators.onBlur = schema
  }
  // 'lazy' only validates onSubmit (already included)

  return {
    validatorAdapter: zodFormValidatorAdapter,
    validators,
  } as const
}
