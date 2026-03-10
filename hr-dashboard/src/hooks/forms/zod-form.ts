import { zodValidator } from '@tanstack/zod-form-adapter'
import type { ZodTypeAny } from 'zod'

export const zodFormValidatorAdapter = zodValidator()

export function createZodFormOptions<TSchema extends ZodTypeAny>(schema: TSchema) {
  return {
    validatorAdapter: zodFormValidatorAdapter,
    validators: {
      onChange: schema,
      onSubmit: schema,
    },
  } as const
}
