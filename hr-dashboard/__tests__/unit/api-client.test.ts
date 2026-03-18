import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError, buildUrl } from '@/lib/api-client'

describe('api-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses response.error as ApiError message when message is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(api.get('/api/jobs')).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        status: 401,
        message: 'Unauthorized',
      }),
    )
  })

  it('maps fieldErrors to ApiError.details when details is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Validation failed',
            fieldErrors: { title: 'Title is required' },
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )

    await expect(api.post('/api/jobs', {})).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        status: 400,
        message: 'Validation failed',
        details: { fieldErrors: { title: 'Title is required' } },
      }),
    )
  })

  it('preserves existing details when present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Validation failed',
            details: { fieldErrors: { department: 'Department is required' } },
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )

    try {
      await api.post('/api/jobs', {})
      throw new Error('Expected ApiError')
    } catch (error) {
      expect(ApiError.isApiError(error)).toBe(true)
      if (ApiError.isApiError(error)) {
        expect(error.details).toEqual({
          fieldErrors: { department: 'Department is required' },
        })
      }
    }
  })

  it('buildUrl emits repeated params for array values without CSV coercion', () => {
    expect(
      buildUrl('/api/jobs', {
        location: ['Chicago, IL', 'Remote'],
        department: ['Engineering', '__MISSING__'],
        includeCount: true,
      }),
    ).toBe(
      '/api/jobs?location=Chicago%2C+IL&location=Remote&department=Engineering&department=__MISSING__&includeCount=true',
    )
  })

  it('buildUrl omits empty arrays entirely', () => {
    expect(
      buildUrl('/api/jobs', {
        department: [],
        status: 'OPEN',
      }),
    ).toBe('/api/jobs?status=OPEN')
  })

  it('buildUrl treats single-element array identically to a scalar', () => {
    const withArray = buildUrl('/api/jobs', { department: ['Engineering'] })
    const withScalar = buildUrl('/api/jobs', { department: 'Engineering' })
    expect(withArray).toBe(withScalar)
    expect(withArray).toBe('/api/jobs?department=Engineering')
  })

  it('buildUrl preserves comma in array element values without splitting', () => {
    expect(
      buildUrl('/api/jobs', { location: ['Chicago, IL'] }),
    ).toBe('/api/jobs?location=Chicago%2C+IL')
  })
})
