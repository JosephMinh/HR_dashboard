import { afterEach, describe, expect, it, vi } from 'vitest'

import { authConfig } from '@/lib/auth.config'

const nextAuthMock = vi.fn(() => ({
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
  auth: vi.fn(),
}))

const findUniqueMock = vi.fn()

vi.mock('next-auth', () => ({
  default: nextAuthMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
    },
  },
}))

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

afterEach(() => {
  findUniqueMock.mockReset()
  nextAuthMock.mockClear()
})

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

describe('refreshJwtTokenFromDatabase', () => {
  it('preserves anonymous tokens that have no bound user id', async () => {
    const { refreshJwtTokenFromDatabase } = await import('@/lib/auth')
    const token = { name: 'Anonymous' }

    await expect(refreshJwtTokenFromDatabase(token as never)).resolves.toEqual(token)
    expect(findUniqueMock).not.toHaveBeenCalled()
  })

  it('returns null when the backing user has been deleted', async () => {
    findUniqueMock.mockResolvedValue(null)

    const { refreshJwtTokenFromDatabase } = await import('@/lib/auth')

    await expect(
      refreshJwtTokenFromDatabase({ id: 'user-1', sub: 'user-1' } as never)
    ).resolves.toBeNull()
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        mustChangePassword: true,
      },
    })
  })

  it('returns null when the backing user is inactive', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'user-1',
      email: 'inactive@example.com',
      name: 'Inactive User',
      role: 'VIEWER',
      active: false,
      mustChangePassword: false,
    })

    const { refreshJwtTokenFromDatabase } = await import('@/lib/auth')

    await expect(
      refreshJwtTokenFromDatabase({ id: 'user-1', sub: 'user-1' } as never)
    ).resolves.toBeNull()
  })

  it('refreshes mutable session fields from the live user record', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'user-1',
      email: 'updated@example.com',
      name: 'Updated User',
      role: 'ADMIN',
      active: true,
      mustChangePassword: true,
    })

    const { refreshJwtTokenFromDatabase } = await import('@/lib/auth')

    await expect(
      refreshJwtTokenFromDatabase({
        id: 'user-1',
        sub: 'user-1',
        email: 'stale@example.com',
        name: 'Stale User',
        role: 'VIEWER',
        mustChangePassword: false,
      } as never)
    ).resolves.toMatchObject({
      id: 'user-1',
      sub: 'user-1',
      email: 'updated@example.com',
      name: 'Updated User',
      role: 'ADMIN',
      mustChangePassword: true,
    })
  })
})
