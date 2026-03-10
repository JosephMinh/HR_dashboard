import { describe, expect, it } from 'vitest'
import * as z from 'zod'

import { ApiError } from '@/lib/api-client'
import { createZodFormOptions, toFormSubmissionError } from '@/hooks/forms'

describe('form foundation utilities', () => {
  it('creates TanStack Form options with zod validator wiring (standard timing)', () => {
    const schema = z.object({
      firstName: z.string().min(1),
      email: z.string().email(),
    })

    const options = createZodFormOptions(schema)

    expect(typeof options.validatorAdapter).toBe('function')
    // Standard timing validates on blur and submit, not onChange
    expect(options.validators.onBlur).toBe(schema)
    expect(options.validators.onSubmit).toBe(schema)
  })

  it('creates TanStack Form options with eager timing', () => {
    const schema = z.object({
      firstName: z.string().min(1),
      email: z.string().email(),
    })

    const options = createZodFormOptions(schema, { timing: 'eager' })

    expect(typeof options.validatorAdapter).toBe('function')
    // Eager timing validates on change, blur, and submit
    expect(options.validators.onChange).toBe(schema)
    expect(options.validators.onBlur).toBe(schema)
    expect(options.validators.onSubmit).toBe(schema)
  })

  it('maps ApiError details.fieldErrors into form field errors', () => {
    const error = new ApiError('Validation failed', 400, undefined, {
      fieldErrors: {
        email: ['Invalid email format'],
      },
    })

    const mapped = toFormSubmissionError(error)

    expect(mapped.formError).toBe('Validation failed')
    expect(mapped.fieldErrors).toEqual({
      email: 'Invalid email format',
    })
  })

  it('normalizes issue paths with array segments', () => {
    const mapped = toFormSubmissionError({
      message: 'Validation failed',
      details: {
        issues: [
          {
            path: ['applications', 0, 'candidateId'],
            message: 'Candidate is required',
          },
        ],
      },
    })

    expect(mapped.formError).toBe('Validation failed')
    expect(mapped.fieldErrors).toEqual({
      'applications[0].candidateId': 'Candidate is required',
    })
  })

  it('uses top-level error field when message is absent', () => {
    const mapped = toFormSubmissionError({
      error: 'Unauthorized',
    })

    expect(mapped.formError).toBe('Unauthorized')
    expect(mapped.fieldErrors).toEqual({})
  })
})
