/**
 * Real Auth Test Harness
 *
 * Two APIs, one goal: eliminate fake auth from integration tests.
 *
 * ## API 1: `setupTestAuth()` (recommended)
 *
 * Replaces the per-file `vi.mock('@/lib/auth')` + `authMock` pattern.
 * Installs a single standardized mock that calls the real
 * `refreshJwtTokenFromDatabase()` on every `auth()` invocation.
 *
 * ```ts
 * const testAuth = setupTestAuth()
 *
 * beforeEach(async () => {
 *   await testAuth.loginAsNewUser({ role: 'RECRUITER' })
 * })
 *
 * it('returns 200', async () => {
 *   const { GET } = await import('@/app/api/jobs/route')
 *   const res = await GET(new Request('http://localhost/api/jobs') as never)
 *   expect(res.status).toBe(200)
 * })
 *
 * it('returns 401 when logged out', async () => {
 *   testAuth.logout()
 *   // ...
 * })
 * ```
 *
 * What this catches that plain mocks miss:
 * - User deactivated in DB → auth() returns null
 * - Role changed in DB → session reflects new role
 * - User deleted → auth() returns null
 *
 * ## API 2: `createAuthHarness()` (legacy, compatible)
 *
 * Creates real DB-backed users and sessions but still needs an external
 * authMock. Useful during migration from old-style tests.
 */

import { vi, beforeEach } from "vitest"
import type { Session } from "next-auth"
import type { JWT } from "next-auth/jwt"
import { hash } from "bcryptjs"
import { getTestPrisma } from "./test-db"
import { uniqueEmail } from "./fixtures"

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

type Role = "ADMIN" | "RECRUITER" | "VIEWER"

const TEST_PASSWORD = "TestPassword123!"
const BCRYPT_ROUNDS = 4 // Fast for tests, still real bcrypt
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000 // Mirrors auth.config.ts

// Pre-computed bcrypt hash of TEST_PASSWORD at 4 rounds.
// Avoids calling hash() during tests (~50ms per call even at low rounds).
const DEFAULT_PASSWORD_HASH =
  "$2b$04$U9K6Mqrf/1gb.VYeVdNl3eLsDDw8g.qjknF4zR5smRVa9JCuBDmBm"

function nextTestEmail(prefix: string): string {
  return uniqueEmail(prefix)
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface TestUser {
  id: string
  email: string
  name: string
  role: Role
  passwordHash: string
}

export interface LoginOptions {
  role?: Role
  name?: string
  email?: string
  password?: string
  mustChangePassword?: boolean
  active?: boolean
}

// ---------------------------------------------------------------------------
// API 1: setupTestAuth() — full mock replacement
// ---------------------------------------------------------------------------

/**
 * Internal state for the setupTestAuth mock.
 * Shared between the vi.mock factory closure and the harness object.
 */
interface _AuthState {
  userId: string | null
  refreshFn: ((token: JWT) => Promise<JWT | null>) | null
  forcedSession: Session | null | undefined // undefined = not forced
}

const _state: _AuthState = {
  userId: null,
  refreshFn: null,
  forcedSession: undefined,
}

/**
 * The test replacement for NextAuth's `auth()`.
 *
 * Exercises the real `refreshJwtTokenFromDatabase` callback, which performs
 * a real database lookup against the test database.
 */
async function _testAuthFn(): Promise<Session | null> {
  // Forced override for edge-case testing
  if (_state.forcedSession !== undefined) return _state.forcedSession

  // No user → unauthenticated
  if (!_state.userId) return null

  if (!_state.refreshFn) {
    throw new Error(
      "[auth-harness] refreshJwtTokenFromDatabase not captured. " +
        "Ensure setupTestAuth() is called at module level.",
    )
  }

  // Build initial JWT token (same fields NextAuth populates after credential check).
  // refreshJwtTokenFromDatabase will fill in role/mustChangePassword from the DB.
  const initialToken = { sub: _state.userId, id: _state.userId } as JWT

  // Run the REAL JWT refresh — hits the test database!
  const refreshed = await _state.refreshFn(initialToken)
  if (!refreshed) return null

  // Build session using same logic as auth.ts session callback
  return {
    expires: new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString(),
    user: {
      id: refreshed.id as string,
      name: refreshed.name as string,
      email: refreshed.email as string,
      role: refreshed.role as Role,
      mustChangePassword: (refreshed.mustChangePassword ?? false) as boolean,
    },
  }
}

const roleDefaults: Record<Role, { name: string; emailPrefix: string }> = {
  ADMIN: { name: "Test Admin", emailPrefix: "test-admin" },
  RECRUITER: { name: "Test Recruiter", emailPrefix: "test-recruiter" },
  VIEWER: { name: "Test Viewer", emailPrefix: "test-viewer" },
}

/**
 * Setup real-auth integration testing.
 *
 * Call at module level in your test file (alongside setupIntegrationTests).
 * Vitest hoists the vi.mock automatically.
 *
 * **Replaces**: `const authMock = vi.fn(); vi.mock('@/lib/auth', ...)`
 */
export function setupTestAuth() {
  // Replace auth() with test implementation; keep all other exports
  vi.mock("@/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/lib/auth")>()
    _state.refreshFn = original.refreshJwtTokenFromDatabase
    return { ...original, auth: _testAuthFn }
  })

  // Track last created user per role for convenience helpers
  const _lastUserByRole = new Map<Role, TestUser>()

  // Reset between tests
  beforeEach(() => {
    _state.userId = null
    _state.forcedSession = undefined
    _lastUserByRole.clear()
  })

  async function createUser(opts?: LoginOptions): Promise<TestUser> {
    const prisma = getTestPrisma()
    const role = opts?.role ?? "RECRUITER"
    const defaults = roleDefaults[role]
    const passwordHash = opts?.password
      ? await hash(opts.password, BCRYPT_ROUNDS)
      : DEFAULT_PASSWORD_HASH

    const user = await prisma.user.create({
      data: {
        name: opts?.name ?? defaults.name,
        email: opts?.email ?? nextTestEmail(defaults.emailPrefix),
        role,
        passwordHash,
        mustChangePassword: opts?.mustChangePassword ?? false,
        active: opts?.active ?? true,
      },
    })

    const testUser: TestUser = {
      id: user.id,
      email: user.email,
      name: user.name ?? defaults.name,
      role,
      passwordHash,
    }

    _lastUserByRole.set(role, testUser)
    return testUser
  }

  return {
    /**
     * Create a new user in the test DB and authenticate as them.
     */
    async loginAsNewUser(opts?: LoginOptions): Promise<TestUser> {
      const testUser = await createUser(opts)
      _state.userId = testUser.id
      return testUser
    },

    /**
     * Create a new user with the given role and authenticate as them.
     * Convenience wrapper for `loginAsNewUser({ role })`.
     */
    async loginAsRole(role: Role): Promise<TestUser> {
      return this.loginAsNewUser({ role })
    },

    /**
     * Create a user without logging in. Useful for multi-user scenarios.
     */
    createUser,

    /**
     * Authenticate as an existing user (by ID).
     * If the user is inactive or deleted, auth() will correctly return null.
     */
    loginAs(userId: string): void {
      _state.userId = userId
    },

    /**
     * Clear authentication. Subsequent auth() calls return null.
     */
    logout(): void {
      _state.userId = null
      _state.forcedSession = undefined
    },

    /**
     * Deactivate the currently authenticated user in the DB.
     * Subsequent auth() calls will return null (refreshJwtTokenFromDatabase
     * checks user.active).
     */
    async deactivateCurrentUser(): Promise<void> {
      if (!_state.userId) {
        throw new Error("[auth-harness] No user is currently authenticated.")
      }
      const prisma = getTestPrisma()
      await prisma.user.update({
        where: { id: _state.userId },
        data: { active: false },
      })
    },

    /**
     * Re-activate a previously deactivated user.
     */
    async activateUser(userId: string): Promise<void> {
      const prisma = getTestPrisma()
      await prisma.user.update({
        where: { id: userId },
        data: { active: true },
      })
    },

    /**
     * Toggle mustChangePassword on the currently authenticated user.
     * The next auth() call will reflect the new value.
     */
    async setMustChangePassword(value: boolean): Promise<void> {
      if (!_state.userId) {
        throw new Error("[auth-harness] No user is currently authenticated.")
      }
      const prisma = getTestPrisma()
      await prisma.user.update({
        where: { id: _state.userId },
        data: { mustChangePassword: value },
      })
    },

    /**
     * Change the role of the currently authenticated user in the DB.
     * The next auth() call will reflect the new role.
     */
    async changeRole(newRole: Role): Promise<void> {
      if (!_state.userId) {
        throw new Error("[auth-harness] No user is currently authenticated.")
      }
      const prisma = getTestPrisma()
      await prisma.user.update({
        where: { id: _state.userId },
        data: { role: newRole },
      })
    },

    /**
     * Force auth() to return a specific value (bypass DB lookup).
     * Use sparingly for edge cases that can't be reproduced otherwise.
     */
    forceSession(session: Session | null): void {
      _state.forcedSession = session
    },

    /** Clear forced session, restoring DB-backed auth. */
    clearForceSession(): void {
      _state.forcedSession = undefined
    },

    /**
     * Get the last user created for a specific role.
     * Returns undefined if no user with that role was created this test.
     */
    getLastUser(role: Role): TestUser | undefined {
      return _lastUserByRole.get(role)
    },

    /** Currently authenticated user ID (or null). */
    get currentUserId(): string | null {
      return _state.userId
    },

    /** The default test password (unhashed). */
    DEFAULT_PASSWORD: TEST_PASSWORD,
  }
}

export type TestAuthHarness = ReturnType<typeof setupTestAuth>

// ---------------------------------------------------------------------------
// API 2: createAuthHarness() — legacy compatible
// ---------------------------------------------------------------------------

/**
 * Create an auth harness for integration tests.
 *
 * **Legacy API** — new tests should use `setupTestAuth()` instead.
 *
 * This harness creates real DB-backed users and sessions, but still requires
 * an external `authMock` set via `vi.mock`. It's useful during the migration
 * period from old-style tests.
 */
export function createAuthHarness() {
  const userCache = new Map<Role, TestUser>()

  async function ensureUser(role: Role): Promise<TestUser> {
    const cached = userCache.get(role)
    if (cached) {
      const prisma = getTestPrisma()
      const exists = await prisma.user.findUnique({ where: { id: cached.id } })
      if (exists) return cached
      userCache.delete(role)
    }

    const prisma = getTestPrisma()
    const config = roleDefaults[role]
    const email = nextTestEmail(config.emailPrefix)

    const user = await prisma.user.create({
      data: {
        name: config.name,
        email,
        role,
        passwordHash: DEFAULT_PASSWORD_HASH,
        active: true,
        mustChangePassword: false,
      },
    })

    const testUser: TestUser = {
      id: user.id,
      email: user.email,
      name: user.name ?? config.name,
      role,
      passwordHash: DEFAULT_PASSWORD_HASH,
    }

    userCache.set(role, testUser)
    return testUser
  }

  async function sessionAs(role: Role): Promise<Session> {
    const user = await ensureUser(role)
    return {
      expires: new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: false,
      },
    }
  }

  function getUser(role: Role): TestUser | undefined {
    return userCache.get(role)
  }

  function clearCache(): void {
    userCache.clear()
  }

  return {
    sessionAs,
    ensureUser,
    getUser,
    clearCache,
    testPassword: TEST_PASSWORD,
  }
}

export type AuthHarness = ReturnType<typeof createAuthHarness>
