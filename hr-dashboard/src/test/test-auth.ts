/**
 * Real Auth Test Harness — setupTestAuth()
 *
 * Replaces the per-file `vi.mock('@/lib/auth')` + `authMock` pattern.
 * Installs a single standardized mock that calls the real
 * `refreshJwtTokenFromDatabase()` on every `auth()` invocation.
 *
 * IMPORTANT: This module contains vi.mock() which Vitest hoists even from
 * transitively imported modules. Do NOT re-export this from barrel files
 * like setup-integration.ts — import directly from "@/test/test-auth".
 *
 * ```ts
 * import { setupTestAuth } from "@/test/test-auth"
 *
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
 */

import { vi, beforeEach } from "vitest"
import type { Session } from "next-auth"
import type { JWT } from "next-auth/jwt"
import { hash } from "bcryptjs"
import { getTestPrisma } from "./test-db"
import { uniqueEmail } from "./fixtures"
import type { TestUser, LoginOptions } from "./auth-harness"

// Re-export types for convenience
export type { TestUser, LoginOptions } from "./auth-harness"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Role = "ADMIN" | "RECRUITER" | "VIEWER"

const TEST_PASSWORD = "TestPassword123!"
const BCRYPT_ROUNDS = 4
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000

const DEFAULT_PASSWORD_HASH =
  "$2b$04$U9K6Mqrf/1gb.VYeVdNl3eLsDDw8g.qjknF4zR5smRVa9JCuBDmBm"

const roleDefaults: Record<Role, { name: string; emailPrefix: string }> = {
  ADMIN: { name: "Test Admin", emailPrefix: "test-admin" },
  RECRUITER: { name: "Test Recruiter", emailPrefix: "test-recruiter" },
  VIEWER: { name: "Test Viewer", emailPrefix: "test-viewer" },
}

// ---------------------------------------------------------------------------
// Internal state — shared between vi.mock factory closure and harness
// ---------------------------------------------------------------------------

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

async function _testAuthFn(): Promise<Session | null> {
  if (_state.forcedSession !== undefined) return _state.forcedSession
  if (!_state.userId) return null

  if (!_state.refreshFn) {
    throw new Error(
      "[test-auth] refreshJwtTokenFromDatabase not captured. " +
        "Ensure setupTestAuth() is called at module level.",
    )
  }

  const initialToken = { sub: _state.userId, id: _state.userId } as JWT
  const refreshed = await _state.refreshFn(initialToken)
  if (!refreshed) return null

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Setup real-auth integration testing.
 *
 * Call at module level in your test file (alongside setupIntegrationTests).
 * Vitest hoists the vi.mock automatically.
 *
 * **Replaces**: `const authMock = vi.fn(); vi.mock('@/lib/auth', ...)`
 */
export function setupTestAuth() {
  vi.mock("@/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/lib/auth")>()
    _state.refreshFn = original.refreshJwtTokenFromDatabase
    return { ...original, auth: _testAuthFn }
  })

  const _lastUserByRole = new Map<Role, TestUser>()

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
        email: opts?.email ?? uniqueEmail(defaults.emailPrefix),
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
    async loginAsNewUser(opts?: LoginOptions): Promise<TestUser> {
      const testUser = await createUser(opts)
      _state.userId = testUser.id
      return testUser
    },

    async loginAsRole(role: Role): Promise<TestUser> {
      return this.loginAsNewUser({ role })
    },

    createUser,

    loginAs(userId: string): void {
      _state.userId = userId
    },

    logout(): void {
      _state.userId = null
      _state.forcedSession = undefined
    },

    async deactivateCurrentUser(): Promise<void> {
      if (!_state.userId) {
        throw new Error("[test-auth] No user is currently authenticated.")
      }
      const prisma = getTestPrisma()
      await prisma.user.update({
        where: { id: _state.userId },
        data: { active: false },
      })
    },

    async activateUser(userId: string): Promise<void> {
      const prisma = getTestPrisma()
      await prisma.user.update({
        where: { id: userId },
        data: { active: true },
      })
    },

    async setMustChangePassword(value: boolean): Promise<void> {
      if (!_state.userId) {
        throw new Error("[test-auth] No user is currently authenticated.")
      }
      const prisma = getTestPrisma()
      await prisma.user.update({
        where: { id: _state.userId },
        data: { mustChangePassword: value },
      })
    },

    async changeRole(newRole: Role): Promise<void> {
      if (!_state.userId) {
        throw new Error("[test-auth] No user is currently authenticated.")
      }
      const prisma = getTestPrisma()
      await prisma.user.update({
        where: { id: _state.userId },
        data: { role: newRole },
      })
    },

    forceSession(session: Session | null): void {
      _state.forcedSession = session
    },

    clearForceSession(): void {
      _state.forcedSession = undefined
    },

    getLastUser(role: Role): TestUser | undefined {
      return _lastUserByRole.get(role)
    },

    get currentUserId(): string | null {
      return _state.userId
    },

    DEFAULT_PASSWORD: TEST_PASSWORD,
  }
}

export type TestAuthHarness = ReturnType<typeof setupTestAuth>
