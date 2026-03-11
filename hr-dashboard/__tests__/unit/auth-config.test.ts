import { describe, expect, it } from 'vitest'

import { authConfig } from '@/lib/auth.config'

function runAuthorized(pathname: string, isLoggedIn: boolean) {
  const authorized = authConfig.callbacks?.authorized
  if (!authorized) {
    throw new Error('authorized callback is not configured')
  }

  return authorized({
    auth: isLoggedIn
      ? { user: { id: 'user-1', email: 'user@example.com', role: 'ADMIN' } }
      : null,
    request: { nextUrl: new URL(`http://localhost${pathname}`) },
  } as never)
}

describe('auth.config authorized callback', () => {
  it('uses JWT sessions for app authentication state', () => {
    expect(authConfig.session?.strategy).toBe('jwt')
    expect(authConfig.session?.maxAge).toBe(4 * 60 * 60)
  })

  it('does not override Auth.js cookie defaults or disable CSRF checks', () => {
    expect('cookies' in authConfig).toBe(false)
    expect('skipCSRFCheck' in authConfig).toBe(false)
  })

  it('redirects authenticated users away from /login to /', () => {
    const result = runAuthorized('/login', true)

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).headers.get('location')).toBe('http://localhost/')
  })

  it('blocks unauthenticated users from root dashboard route', () => {
    const result = runAuthorized('/', false)

    expect(result).toBe(false)
  })

  it('allows unauthenticated users on /login', () => {
    const result = runAuthorized('/login', false)

    expect(result).toBe(true)
  })
})
