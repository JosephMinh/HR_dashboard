import { ApiError } from '@/lib/api-client'

export interface FormSubmissionError {
  formError: string
  fieldErrors: Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toMessage(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = toMessage(item)
      if (message) {
        return message
      }
    }
  }

  return undefined
}

function normalizePath(path: unknown): string | undefined {
  if (typeof path === 'string') {
    return path.trim() || undefined
  }

  if (!Array.isArray(path)) {
    return undefined
  }

  const normalized = path
    .map((segment) => {
      if (typeof segment === 'number') {
        return `[${segment}]`
      }
      if (isRecord(segment) && 'key' in segment) {
        return String(segment.key)
      }
      return String(segment)
    })
    .join('.')
    .replace(/\.\[/g, '[')
    .trim()

  return normalized || undefined
}

function addFieldError(
  fieldErrors: Record<string, string>,
  field: unknown,
  message: unknown,
) {
  const normalizedField = normalizePath(field)
  const normalizedMessage = toMessage(message)
  if (!normalizedField || !normalizedMessage) {
    return
  }
  if (!fieldErrors[normalizedField]) {
    fieldErrors[normalizedField] = normalizedMessage
  }
}

export function extractFieldErrors(details: unknown): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  if (!isRecord(details)) {
    return fieldErrors
  }

  const rawFieldErrors = details.fieldErrors
  if (isRecord(rawFieldErrors)) {
    for (const [field, message] of Object.entries(rawFieldErrors)) {
      addFieldError(fieldErrors, field, message)
    }
  }

  for (const key of ['errors', 'issues']) {
    const entries = details[key]
    if (!Array.isArray(entries)) {
      continue
    }

    for (const entry of entries) {
      if (!isRecord(entry)) {
        continue
      }

      const message = toMessage(entry.message) ?? toMessage(entry.error)
      const field = entry.field ?? entry.path
      addFieldError(fieldErrors, field, message)
    }
  }

  return fieldErrors
}

export function getErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  if (ApiError.isApiError(error)) {
    return error.message || fallback
  }

  if (error instanceof Error) {
    return error.message || fallback
  }

  if (isRecord(error)) {
    return toMessage(error.message) ?? toMessage(error.error) ?? fallback
  }

  return fallback
}

export function toFormSubmissionError(
  error: unknown,
  fallback = 'An error occurred',
): FormSubmissionError {
  const details = ApiError.isApiError(error)
    ? error.details
    : isRecord(error) && 'details' in error
      ? error.details
      : error

  return {
    formError: getErrorMessage(error, fallback),
    fieldErrors: extractFieldErrors(details),
  }
}
