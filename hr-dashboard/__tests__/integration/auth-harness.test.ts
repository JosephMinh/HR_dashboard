/**
 * Auth Harness Integration Tests
 *
 * Verifies both auth harness APIs:
 * 1. setupTestAuth() — real DB-backed auth with refreshJwtTokenFromDatabase
 * 2. createAuthHarness() — legacy API with manual mock control
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  setupIntegrationTests,
  getTestPrisma,
  createAuthHarness,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

// ---------------------------------------------------------------------------
// API 1: setupTestAuth() — real auth mock replacement
// ---------------------------------------------------------------------------

describe("setupTestAuth()", () => {
  setupIntegrationTests()
  const testAuth = setupTestAuth()

  it("loginAsNewUser creates a real ADMIN in the database", async () => {
    const user = await testAuth.loginAsNewUser({ role: "ADMIN" })
    const prisma = getTestPrisma()

    expect(user.id).toBeTruthy()
    expect(user.role).toBe("ADMIN")

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    expect(dbUser).not.toBeNull()
    expect(dbUser?.role).toBe("ADMIN")
    expect(dbUser?.active).toBe(true)
  })

  it("loginAsNewUser creates a real RECRUITER in the database", async () => {
    const user = await testAuth.loginAsNewUser({ role: "RECRUITER" })
    const prisma = getTestPrisma()

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    expect(dbUser).not.toBeNull()
    expect(dbUser?.role).toBe("RECRUITER")
  })

  it("loginAsNewUser creates a real VIEWER in the database", async () => {
    const user = await testAuth.loginAsNewUser({ role: "VIEWER" })
    const prisma = getTestPrisma()

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    expect(dbUser).not.toBeNull()
    expect(dbUser?.role).toBe("VIEWER")
  })

  it("loginAsRole is a convenience shortcut", async () => {
    const user = await testAuth.loginAsRole("ADMIN")
    expect(user.role).toBe("ADMIN")
    expect(testAuth.currentUserId).toBe(user.id)
  })

  it("auth() returns session with real user data after login", async () => {
    const user = await testAuth.loginAsNewUser({ role: "RECRUITER", name: "Jane Doe" })

    // Import auth and call it as a route handler would
    const { auth } = await import("@/lib/auth")
    const session = await auth()

    expect(session).not.toBeNull()
    expect(session!.user.id).toBe(user.id)
    expect(session!.user.role).toBe("RECRUITER")
    expect(session!.user.name).toBe("Jane Doe")
    expect(session!.user.mustChangePassword).toBe(false)
  })

  it("auth() returns null when logged out", async () => {
    await testAuth.loginAsNewUser({ role: "ADMIN" })
    testAuth.logout()

    const { auth } = await import("@/lib/auth")
    const session = await auth()

    expect(session).toBeNull()
  })

  it("auth() returns null after user is deactivated", async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })

    // Deactivate the user
    await testAuth.deactivateCurrentUser()

    // auth() should return null because refreshJwtTokenFromDatabase checks active
    const { auth } = await import("@/lib/auth")
    const session = await auth()

    expect(session).toBeNull()
  })

  it("auth() reflects mustChangePassword from DB", async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })

    await testAuth.setMustChangePassword(true)

    const { auth } = await import("@/lib/auth")
    const session = await auth()

    expect(session).not.toBeNull()
    expect(session!.user.mustChangePassword).toBe(true)
  })

  it("auth() reflects role change from DB", async () => {
    await testAuth.loginAsNewUser({ role: "VIEWER" })

    await testAuth.changeRole("ADMIN")

    const { auth } = await import("@/lib/auth")
    const session = await auth()

    expect(session).not.toBeNull()
    expect(session!.user.role).toBe("ADMIN")
  })

  it("loginAs switches to existing user by ID", async () => {
    const admin = await testAuth.createUser({ role: "ADMIN" })
    const recruiter = await testAuth.createUser({ role: "RECRUITER" })

    testAuth.loginAs(admin.id)
    const { auth } = await import("@/lib/auth")
    let session = await auth()
    expect(session!.user.role).toBe("ADMIN")

    testAuth.loginAs(recruiter.id)
    session = await auth()
    expect(session!.user.role).toBe("RECRUITER")
  })

  it("forceSession overrides DB lookup", async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })

    testAuth.forceSession(null)

    const { auth } = await import("@/lib/auth")
    const session = await auth()
    expect(session).toBeNull()

    testAuth.clearForceSession()
    const restored = await auth()
    expect(restored).not.toBeNull()
  })

  it("session has valid expiry in the future", async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })

    const { auth } = await import("@/lib/auth")
    const session = await auth()

    expect(session).not.toBeNull()
    const expires = new Date(session!.expires)
    expect(expires.getTime()).toBeGreaterThan(Date.now())
  })

  it("user has bcrypt-hashed password in DB", async () => {
    const user = await testAuth.loginAsNewUser({ role: "ADMIN" })
    const prisma = getTestPrisma()

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    expect(dbUser?.passwordHash).toMatch(/^\$2[ab]\$/)
  })

  it("getLastUser returns the last user created for a role", async () => {
    const admin = await testAuth.loginAsNewUser({ role: "ADMIN" })
    expect(testAuth.getLastUser("ADMIN")?.id).toBe(admin.id)
    expect(testAuth.getLastUser("VIEWER")).toBeUndefined()
  })

  it("deactivateCurrentUser throws when not authenticated", async () => {
    await expect(testAuth.deactivateCurrentUser()).rejects.toThrow(
      "No user is currently authenticated",
    )
  })

  it("setMustChangePassword throws when not authenticated", async () => {
    await expect(testAuth.setMustChangePassword(true)).rejects.toThrow(
      "No user is currently authenticated",
    )
  })

  it("activateUser re-enables a deactivated user", async () => {
    const user = await testAuth.loginAsNewUser({ role: "RECRUITER" })
    await testAuth.deactivateCurrentUser()

    const { auth } = await import("@/lib/auth")
    expect(await auth()).toBeNull()

    await testAuth.activateUser(user.id)
    const session = await auth()
    expect(session).not.toBeNull()
    expect(session!.user.id).toBe(user.id)
  })

  it("DEFAULT_PASSWORD is available for credential-based tests", () => {
    expect(testAuth.DEFAULT_PASSWORD).toBeTruthy()
    expect(testAuth.DEFAULT_PASSWORD.length).toBeGreaterThanOrEqual(8)
  })
})

// ---------------------------------------------------------------------------
// API 2: createAuthHarness() — legacy compatible
// ---------------------------------------------------------------------------

describe("createAuthHarness() (legacy)", () => {
  setupIntegrationTests()
  const harness = createAuthHarness()

  beforeEach(() => {
    harness.clearCache()
  })

  it("creates a real ADMIN user in the database", async () => {
    const session = await harness.sessionAs("ADMIN")
    const prisma = getTestPrisma()

    expect(session.user.role).toBe("ADMIN")
    expect(session.user.id).toBeTruthy()

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    })
    expect(dbUser).not.toBeNull()
    expect(dbUser?.role).toBe("ADMIN")
    expect(dbUser?.active).toBe(true)
    expect(dbUser?.mustChangePassword).toBe(false)
  })

  it("creates a real RECRUITER user in the database", async () => {
    const session = await harness.sessionAs("RECRUITER")
    const prisma = getTestPrisma()

    expect(session.user.role).toBe("RECRUITER")

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    })
    expect(dbUser).not.toBeNull()
    expect(dbUser?.role).toBe("RECRUITER")
  })

  it("creates a real VIEWER user in the database", async () => {
    const session = await harness.sessionAs("VIEWER")
    const prisma = getTestPrisma()

    expect(session.user.role).toBe("VIEWER")

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    })
    expect(dbUser).not.toBeNull()
    expect(dbUser?.role).toBe("VIEWER")
  })

  it("reuses cached user within same test if DB not reset", async () => {
    const session1 = await harness.sessionAs("ADMIN")
    const session2 = await harness.sessionAs("ADMIN")

    expect(session1.user.id).toBe(session2.user.id)
  })

  it("creates fresh user after cache clear", async () => {
    const session1 = await harness.sessionAs("ADMIN")
    harness.clearCache()
    const session2 = await harness.sessionAs("ADMIN")

    // Different user IDs because cache was cleared and DB was reset
    expect(session1.user.id).not.toBe(session2.user.id)
  })

  it("session has valid expiry in the future", async () => {
    const session = await harness.sessionAs("RECRUITER")
    const expires = new Date(session.expires)

    expect(expires.getTime()).toBeGreaterThan(Date.now())
  })

  it("user has bcrypt-hashed password", async () => {
    const session = await harness.sessionAs("ADMIN")
    const prisma = getTestPrisma()

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    // bcrypt hashes start with $2a$ or $2b$
    expect(dbUser?.passwordHash).toMatch(/^\$2[ab]\$/)
  })

  it("getUser returns cached user after sessionAs", async () => {
    await harness.sessionAs("VIEWER")
    const user = harness.getUser("VIEWER")

    expect(user).toBeDefined()
    expect(user?.role).toBe("VIEWER")
  })

  it("provides test password for credential-based login tests", () => {
    expect(harness.testPassword).toBeTruthy()
    expect(harness.testPassword.length).toBeGreaterThanOrEqual(8)
  })
})
