/**
 * setupTestAuth() Integration Tests
 *
 * Verifies the modern auth harness creates real DB-backed users
 * and exercises the real refreshJwtTokenFromDatabase() callback.
 *
 * These tests prove that auth-gated API routes can be tested without
 * manually wiring vi.mock('@/lib/auth') in each file.
 */

import { describe, it, expect } from "vitest"
import {
  setupIntegrationTests,
  setupTestAuth,
  getTestPrisma,
} from "@/test/setup-integration"

describe("setupTestAuth()", () => {
  setupIntegrationTests()
  const testAuth = setupTestAuth()

  it("loginAsNewUser creates a real DB user and authenticates", async () => {
    const user = await testAuth.loginAsNewUser({ role: "ADMIN" })
    const prisma = getTestPrisma()

    expect(user.id).toBeTruthy()
    expect(user.role).toBe("ADMIN")

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    expect(dbUser).not.toBeNull()
    expect(dbUser?.role).toBe("ADMIN")
    expect(dbUser?.active).toBe(true)
  })

  it("auth() returns session with real user data after login", async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER", name: "Jane Doe" })

    const { auth } = await import("@/lib/auth")
    const session = await auth()

    expect(session).not.toBeNull()
    expect(session?.user.role).toBe("RECRUITER")
    expect(session?.user.name).toBe("Jane Doe")
    expect(session?.user.mustChangePassword).toBe(false)
  })

  it("auth() returns null when logged out", async () => {
    await testAuth.loginAsNewUser({ role: "VIEWER" })
    testAuth.logout()

    const { auth } = await import("@/lib/auth")
    const session = await auth()
    expect(session).toBeNull()
  })

  it("auth() detects user deactivation in DB", async () => {
    const user = await testAuth.loginAsNewUser({ role: "RECRUITER" })
    const prisma = getTestPrisma()

    // Deactivate the user directly in DB
    await prisma.user.update({
      where: { id: user.id },
      data: { active: false },
    })

    const { auth } = await import("@/lib/auth")
    const session = await auth()
    expect(session).toBeNull()
  })

  it("auth() detects user deletion in DB", async () => {
    const user = await testAuth.loginAsNewUser({ role: "VIEWER" })
    const prisma = getTestPrisma()

    // Delete the user
    await prisma.user.delete({ where: { id: user.id } })

    const { auth } = await import("@/lib/auth")
    const session = await auth()
    expect(session).toBeNull()
  })

  it("auth() reflects role change in DB", async () => {
    const user = await testAuth.loginAsNewUser({ role: "VIEWER" })
    const prisma = getTestPrisma()

    // Promote to ADMIN
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    })

    const { auth } = await import("@/lib/auth")
    const session = await auth()
    expect(session?.user.role).toBe("ADMIN")
  })

  it("loginAs switches to an existing user", async () => {
    const user1 = await testAuth.loginAsNewUser({ role: "ADMIN" })
    const prisma = getTestPrisma()

    // Create a second user directly
    const user2 = await prisma.user.create({
      data: {
        name: "Other User",
        email: `other-${Date.now()}@test.local`,
        role: "VIEWER",
        passwordHash: "unused",
        active: true,
      },
    })

    testAuth.loginAs(user2.id)

    const { auth } = await import("@/lib/auth")
    const session = await auth()
    expect(session?.user.id).toBe(user2.id)
    expect(session?.user.role).toBe("VIEWER")
    expect(session?.user.id).not.toBe(user1.id)
  })

  it("forceSession overrides DB-backed auth", async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })

    testAuth.forceSession({
      expires: "2999-01-01T00:00:00.000Z",
      user: {
        id: "forced-id",
        name: "Forced",
        email: "forced@test.local",
        role: "ADMIN",
        mustChangePassword: true,
      },
    })

    const { auth } = await import("@/lib/auth")
    const session = await auth()
    expect(session?.user.id).toBe("forced-id")
    expect(session?.user.role).toBe("ADMIN")
    expect(session?.user.mustChangePassword).toBe(true)
  })

  it("clearForceSession restores DB-backed auth", async () => {
    const user = await testAuth.loginAsNewUser({ role: "RECRUITER" })

    testAuth.forceSession(null)
    const { auth } = await import("@/lib/auth")
    expect(await auth()).toBeNull()

    testAuth.clearForceSession()
    const session = await auth()
    expect(session?.user.id).toBe(user.id)
    expect(session?.user.role).toBe("RECRUITER")
  })

  it("mustChangePassword flag is respected", async () => {
    await testAuth.loginAsNewUser({
      role: "RECRUITER",
      mustChangePassword: true,
    })

    const { auth } = await import("@/lib/auth")
    const session = await auth()
    expect(session?.user.mustChangePassword).toBe(true)
  })

  it("session has valid future expiry", async () => {
    await testAuth.loginAsNewUser({ role: "VIEWER" })

    const { auth } = await import("@/lib/auth")
    const session = await auth()
    const expires = new Date(session!.expires)
    expect(expires.getTime()).toBeGreaterThan(Date.now())
  })

  it("currentUserId tracks the active user", async () => {
    expect(testAuth.currentUserId).toBeNull()

    const user = await testAuth.loginAsNewUser({ role: "ADMIN" })
    expect(testAuth.currentUserId).toBe(user.id)

    testAuth.logout()
    expect(testAuth.currentUserId).toBeNull()
  })

  it("resets auth between tests (this test starts unauthenticated)", async () => {
    const { auth } = await import("@/lib/auth")
    const session = await auth()
    expect(session).toBeNull()
  })
})
