/**
 * Typed API Client
 *
 * Provides consistent fetch wrappers with typed responses and error handling.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }

  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError
  }
}

/**
 * Returns a TanStack Query-compatible retry callback that retries only
 * transient failures (network unknown errors, 5xx, 408, 429).
 */
export function createRetryPolicy(maxRetries: number) {
  return (failureCount: number, error: unknown) => {
    if (failureCount >= maxRetries) {
      return false
    }

    if (!ApiError.isApiError(error)) {
      return true
    }

    if (error.status >= 500) {
      return true
    }

    return error.status === 408 || error.status === 429
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

interface ErrorResponseBody {
  message?: string
  error?: string
  code?: string
  details?: unknown
  fieldErrors?: Record<string, string | string[]>
}

/**
 * Base fetch wrapper with error handling
 */
async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options

  const headers: Record<string, string> = {}

  // Copy custom headers
  if (customHeaders instanceof Headers) {
    customHeaders.forEach((value, key) => {
      headers[key] = value
    })
  } else if (Array.isArray(customHeaders)) {
    for (const [key, value] of customHeaders) {
      headers[key] = value
    }
  } else if (customHeaders) {
    Object.assign(headers, customHeaders)
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // Handle non-JSON responses
  const contentType = response.headers.get('content-type')
  const isJson = contentType?.includes('application/json')

  if (!response.ok) {
    let errorData: ErrorResponseBody = {}

    if (isJson) {
      try {
        const parsed = await response.json()
        if (parsed && typeof parsed === 'object') {
          errorData = parsed as ErrorResponseBody
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    const message =
      errorData.message ??
      errorData.error ??
      `Request failed with status ${response.status}`
    const details =
      errorData.details ??
      (errorData.fieldErrors ? { fieldErrors: errorData.fieldErrors } : undefined)

    throw new ApiError(
      message,
      response.status,
      errorData.code,
      details
    )
  }

  if (!isJson) {
    // Non-JSON success response - only safe when T explicitly allows undefined/void
    // Callers expecting a value will get undefined, which may cause runtime errors
    // For DELETE endpoints returning 204 No Content, use api.delete<void>()
    return undefined as unknown as T
  }

  return response.json() as Promise<T>
}

/**
 * HTTP method helpers
 */
export const api = {
  get<T>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return request<T>(url, { ...options, method: 'GET' })
  },

  post<T>(url: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return request<T>(url, { ...options, method: 'POST', body })
  },

  patch<T>(url: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return request<T>(url, { ...options, method: 'PATCH', body })
  },

  put<T>(url: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return request<T>(url, { ...options, method: 'PUT', body })
  },

  delete<T>(url: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return request<T>(url, { ...options, method: 'DELETE' })
  },
}

/**
 * Build URL with query parameters
 */
export function buildUrl(base: string, params?: Record<string, string | number | boolean | null | undefined>): string {
  if (!params) return base

  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      searchParams.set(key, String(value))
    }
  }

  const queryString = searchParams.toString()
  return queryString ? `${base}?${queryString}` : base
}

/**
 * Pagination metadata returned by paginated endpoints
 */
export interface PaginationMeta {
  total: number
  page: number
  pageSize: number
  pageCount: number
}

/**
 * Standard paginated response shape
 */
export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}
