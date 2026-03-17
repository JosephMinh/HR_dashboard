/**
 * Legacy Auth Harness — createAuthHarness()
 *
 * Creates real DB-backed users and sessions but still requires an external
 * `authMock` set via `vi.mock`. Useful during the migration period from
 * old-style tests.
 *
 * For new tests, use `setupTestAuth()` from "@/test/test-auth" instead.
 *
 * NOTE: This file must NOT contain vi.mock() calls. Vitest hoists vi.mock
 * from transitively imported modules, which would break test files that
 * define their own vi.mock('@/lib/auth'). The setupTestAuth() function
 * (which uses vi.mock) lives in a separate file: test-auth.ts.
 */

import type { Session } from "next-auth"
import { getTestPrisma } from "./test-db"
import { uniqueEmail } from "./fixtures"

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

type Role = "ADMIN" | "RECRUITER" | "VIEWER"

const TEST_PASSWORD = "TestPassword123!"
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000

// Pre-computed bcrypt hash of TEST_PASSWORD at 4 rounds.
const DEFAULT_PASSWORD_HASH =
  "$2b$04$U9K6Mqrf/1gb.VYeVdNl3eLsDDw8g.qjknF4zR5smRVa9JCuBDmBm"

const roleDefaults: Record<Role, { name: string; emailPrefix: string }> = {
  ADMIN: { name: "Test Admin", emailPrefix: "test-admin" },
  RECRUITER: { name: "Test Recruiter", emailPrefix: "test-recruiter" },
  VIEWER: { name: "Test Viewer", emailPrefix: "test-viewer" },
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
// createAuthHarness() — legacy compatible
// ---------------------------------------------------------------------------

/**
 * Create an auth harness for integration tests.
 *
 * Creates real DB-backed users and sessions, but still requires an external
 * `authMock` set via `vi.mock`. Useful during the migration period.
 *
 * For new tests, use `setupTestAuth()` from "@/test/test-auth" instead.
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
    const email = uniqueEmail(config.emailPrefix)

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
