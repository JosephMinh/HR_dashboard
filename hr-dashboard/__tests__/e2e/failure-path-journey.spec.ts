/**
 * E2E Journey: Failure-Path Matrix
 *
 * Covers failure conditions that must be handled gracefully by the UI and API:
 *
 * - Session expiry: cleared cookies redirect to /login on next navigation
 * - Authorization loss: role-downgraded user sees access-denied on admin page
 * - API boundary enforcement: VIEWER session correctly refused for mutations
 * - User creation: duplicate email and invalid email format show actionable errors
 * - Resource not found: non-existent job/candidate URLs show graceful error state
 *
 * Focus: each test verifies that errors are visible, actionable, and do not
 * leave the app in a broken or ambiguous state.
 *
 * bead: hr-kfwh.23.3
 */

import { test, expect } from "./fixtures"
import { hash } from "bcryptjs"
import { createLoggedPage } from "./utils/logger"
import { performLogin, TEST_USERS } from "./utils/auth"

const BCRYPT_ROUNDS = 10

// ---------------------------------------------------------------------------
// Session and Auth Failures
// ---------------------------------------------------------------------------

test.describe("Session and Auth Failures", () => {
  test("cleared session cookies redirect to login on next navigation", async ({
    browser,
    logger,
  }) => {
    // Establish a real authenticated session in a fresh context
    const context = await browser.newContext()
    const page = createLoggedPage(await context.newPage(), logger)

    try {
      const user = TEST_USERS.RECRUITER
      const appOrigin = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000"

      await performLogin(page, user, appOrigin)

      // Verify the session is active
      await page.goto(`${appOrigin}/`, { waitUntil: "domcontentloaded" })
      await expect(
        page.getByRole("button", { name: /open user menu/i }),
      ).toBeVisible({ timeout: 10_000 })

      // Simulate session expiry by clearing all cookies (e.g. token purged from storage)
      await context.clearCookies()

      // Navigate to a protected route — Next.js middleware should redirect to /login
      await page.goto(`${appOrigin}/jobs`, { waitUntil: "domcontentloaded" })
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    } finally {
      await context.close()
    }
  })

  test("viewer navigating to admin-only page sees access-denied UI", async ({
    viewerPage,
  }) => {
    await viewerPage.goto("/admin/users", { waitUntil: "domcontentloaded" })

    // Should show access denied message, not a blank page or an error boundary
    await expect(
      viewerPage.getByText(/access denied|permission|only administrators/i),
    ).toBeVisible({ timeout: 10_000 })

    // User should not see the user management table
    await expect(viewerPage.getByText("User Management")).not.toBeVisible()
  })

  test("admin demotes another admin mid-session — demoted user sees access denied on admin page", async ({
    adminPage,
    browser,
    prisma,
    logger,
  }) => {
    // Create a second admin user that we will demote
    const demotedEmail = `e2e-demote-${Date.now()}@hrtest.local`
    const demotedPassword = "DemoteMe1!"
    const passwordHash = await hash(demotedPassword, BCRYPT_ROUNDS)

    const demotedUser = await prisma.user.create({
      data: {
        name: "E2E Demote Admin",
        email: demotedEmail,
        passwordHash,
        role: "ADMIN",
        active: true,
        mustChangePassword: false,
      },
    })

    const demotedCtx = await browser.newContext()
    const demotedPage = createLoggedPage(await demotedCtx.newPage(), logger)

    try {
      // adminPage hasn't navigated yet (starts at about:blank), so derive the
      // origin from the environment rather than from page.url().
      const appOrigin = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000"

      // Demoted admin logs in and verifies they can access the admin page
      await performLogin(
        demotedPage,
        {
          email: demotedEmail,
          password: demotedPassword,
          name: "E2E Demote Admin",
          role: "ADMIN",
        },
        appOrigin,
      )
      await demotedPage.goto(`${appOrigin}/admin/users`, {
        waitUntil: "domcontentloaded",
      })
      await expect(demotedPage.getByText("User Management")).toBeVisible({
        timeout: 10_000,
      })

      // Admin A demotes the user to VIEWER via the edit dialog
      await adminPage.goto(`${appOrigin}/admin/users`, {
        waitUntil: "domcontentloaded",
      })
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })

      const userRow = adminPage.locator("tr", { hasText: demotedEmail })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      await userRow.getByRole("button", { name: "Edit" }).click()
      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await dialog.getByLabel("Role").selectOption("VIEWER")
      await dialog.getByRole("button", { name: "Save Changes" }).click()
      await expect(dialog).not.toBeVisible({ timeout: 8_000 })

      // DB confirms role change
      const dbUser = await prisma.user.findUnique({
        where: { id: demotedUser.id },
        select: { role: true },
      })
      expect(dbUser?.role).toBe("VIEWER")

      // Demoted user navigates to admin page — must see access denied
      // (auth() refreshes role from DB on the next server request)
      await demotedPage.goto(`${appOrigin}/admin/users`, {
        waitUntil: "domcontentloaded",
      })
      await expect(
        demotedPage.getByText(/access denied|only administrators/i),
      ).toBeVisible({ timeout: 10_000 })
    } finally {
      await demotedCtx.close()
      await prisma.user.delete({ where: { id: demotedUser.id } }).catch(() => {})
    }
  })
})

// ---------------------------------------------------------------------------
// API Authorization Boundary
// ---------------------------------------------------------------------------

test.describe("API Authorization Boundary", () => {
  test("VIEWER session is rejected for job creation mutation (403)", async ({
    viewerPage,
  }) => {
    // VIEWER makes a POST to /api/jobs directly using the browser's cookie jar
    const response = await viewerPage.evaluate(async () => {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Unauthorized Job",
          department: "Engineering",
          location: "Remote",
        }),
      })
      return {
        status: res.status,
        body: (await res.json()) as { error?: string },
      }
    })

    expect(response.status).toBe(403)
    expect(response.body.error).toMatch(/forbidden|unauthorized/i)
  })

  test("VIEWER session is rejected for candidate creation mutation (403)", async ({
    viewerPage,
  }) => {
    const response = await viewerPage.evaluate(async () => {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Unauthorized Candidate",
          email: "unauth@test.invalid",
        }),
      })
      return {
        status: res.status,
        body: (await res.json()) as { error?: string },
      }
    })

    expect(response.status).toBe(403)
    expect(response.body.error).toMatch(/forbidden|unauthorized/i)
  })

  test("unauthenticated request to protected API returns 401", async ({
    page,
  }) => {
    // `page` fixture is unauthenticated — it gets logged in via fixture only if loginAs is called
    // Navigate to a non-redirect page first so we have a page context
    await page.goto("/login", { waitUntil: "domcontentloaded" })

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/jobs", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })
      return {
        status: res.status,
        body: (await res.json()) as { error?: string },
      }
    })

    expect(response.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// User Creation Validation Failures
// ---------------------------------------------------------------------------

test.describe("User Creation Validation Failures", () => {
  test("duplicate email shows actionable error in the create user dialog", async ({
    adminPage,
    prisma,
  }) => {
    const existingEmail = `e2e-dup-${Date.now()}@hrtest.local`
    const passwordHash = await hash("ExistingPass1!", BCRYPT_ROUNDS)

    const existingUser = await prisma.user.create({
      data: {
        name: "E2E Existing User",
        email: existingEmail,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: false,
      },
    })

    try {
      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      await expect(adminPage.getByText("User Management")).toBeVisible()

      // Attempt to create a user with the same email
      await adminPage.getByRole("button", { name: /new user/i }).click()
      await adminPage.fill("#create-name", "E2E Duplicate Attempt")
      await adminPage.fill("#create-email", existingEmail)
      await adminPage.selectOption("#create-role", "VIEWER")
      await adminPage.getByRole("button", { name: /^create user$/i }).click()

      // Dialog should remain open with an error message (not a new user created)
      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(
        dialog.getByText(/already exists|duplicate|in use/i),
      ).toBeVisible({ timeout: 10_000 })

      // No new user created: still only one user with this email
      const count = await prisma.user.count({ where: { email: existingEmail } })
      expect(count).toBe(1)
    } finally {
      if (await adminPage.locator('[role="dialog"]').isVisible()) {
        await adminPage.keyboard.press("Escape")
      }
      await prisma.user.delete({ where: { id: existingUser.id } }).catch(() => {})
    }
  })

  test("last-admin delete guard: cannot delete the last active admin", async ({
    adminPage,
    prisma,
  }) => {
    // Identify the seeded test admin so we can temporarily make them the sole admin
    const testAdmin = await prisma.user.findUniqueOrThrow({
      where: { email: TEST_USERS.ADMIN.email },
      select: { id: true },
    })

    // Create a target admin we will try to delete after ensuring they are the sole admin
    const targetEmail = `e2e-last-admin-${Date.now()}@hrtest.local`
    const passwordHash = await hash("LastAdmin1!", BCRYPT_ROUNDS)
    const targetAdmin = await prisma.user.create({
      data: {
        name: "E2E Last Admin Target",
        email: targetEmail,
        passwordHash,
        role: "ADMIN",
        active: true,
        mustChangePassword: false,
      },
    })

    try {
      // Temporarily demote the seeded test admin to VIEWER directly in the DB
      // (bypassing the API self-role-change guard).
      // This makes the target admin the ONLY active admin.
      await prisma.user.update({
        where: { id: testAdmin.id },
        data: { role: "VIEWER" },
      })

      // Now the admin session cookie still has ADMIN role in the JWT,
      // so the request will pass canManageUsers() but hit the last-admin guard.
      // Use a relative path — adminPage.request resolves it against the configured baseURL.
      const response = await adminPage.request.delete(
        `/api/users/${targetAdmin.id}`,
      )

      // Must be rejected with 400 and a clear last-admin error
      expect(response.status()).toBe(400)
      const body = (await response.json()) as { error?: string }
      expect(body.error).toMatch(/last admin/i)
    } finally {
      // Restore test admin's role no matter what
      await prisma.user.update({
        where: { id: testAdmin.id },
        data: { role: "ADMIN" },
      })
      await prisma.user.delete({ where: { id: targetAdmin.id } }).catch(() => {})
    }
  })
})

// ---------------------------------------------------------------------------
// Resource Not Found
// ---------------------------------------------------------------------------

test.describe("Resource Not Found", () => {
  test("navigating to a non-existent job shows an error or redirects", async ({
    recruiterPage,
  }) => {
    const fakeId = "00000000-0000-0000-0000-000000000000"
    await recruiterPage.goto(`/jobs/${fakeId}`, { waitUntil: "domcontentloaded" })

    // Should show a 404/not-found state, not a blank page or unhandled crash
    const hasError = await Promise.race([
      recruiterPage
        .getByText(/not found|does not exist|couldn't find|no job/i)
        .isVisible({ timeout: 8_000 })
        .catch(() => false),
      recruiterPage
        .waitForURL(/\/jobs$|\/404/, { timeout: 8_000 })
        .then(() => true)
        .catch(() => false),
    ])

    expect(hasError).toBe(true)
  })

  test("navigating to a non-existent candidate shows an error or redirects", async ({
    recruiterPage,
  }) => {
    const fakeId = "00000000-0000-0000-0000-000000000000"
    await recruiterPage.goto(`/candidates/${fakeId}`, {
      waitUntil: "domcontentloaded",
    })

    const hasError = await Promise.race([
      recruiterPage
        .getByText(/not found|does not exist|couldn't find|no candidate/i)
        .isVisible({ timeout: 8_000 })
        .catch(() => false),
      recruiterPage
        .waitForURL(/\/candidates$|\/404/, { timeout: 8_000 })
        .then(() => true)
        .catch(() => false),
    ])

    expect(hasError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Set-Password Token Failure States
// ---------------------------------------------------------------------------

test.describe("Set-Password Token Failures", () => {
  test("malformed token shows Invalid Link with recoverable UI", async ({
    page,
  }) => {
    await page.goto("/set-password?token=not-a-valid-base64url-token", {
      waitUntil: "domcontentloaded",
    })

    // Should display a clear error state — not a blank page or stack trace
    await expect(page.getByText("Invalid Link")).toBeVisible({ timeout: 10_000 })

    // Should offer a path to recovery (e.g. contact admin or go to login)
    const hasRecoveryPath = await page
      .getByRole("link", { name: /sign in|login|contact/i })
      .isVisible({ timeout: 5_000 })
      .catch(() => false)
    expect(hasRecoveryPath).toBe(true)
  })

  test("missing token parameter shows Missing Token with clear guidance", async ({
    page,
  }) => {
    await page.goto("/set-password", { waitUntil: "domcontentloaded" })

    await expect(page.getByText("Missing Token")).toBeVisible({ timeout: 10_000 })

    // Page should not be blank or show a framework error
    await expect(page.getByText(/no setup token|missing token/i)).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Email Delivery Failure Paths
// ---------------------------------------------------------------------------
//
// Uses /api/test/runtime-failures (enabled when VITEST=true on the dev server)
// to inject real SMTP failure responses into the live email module.
// Each test clears the interceptor in afterEach to avoid cross-test pollution.

const RUNTIME_FAILURES_PATH = "/api/test/runtime-failures"
const OUTBOX_PATH = "/api/test/email-outbox"

test.describe("Email Delivery Failure Paths", { tag: "@failure-email" }, () => {
  test.afterEach(async ({ request }) => {
    await request.delete(RUNTIME_FAILURES_PATH)
    await request.delete(OUTBOX_PATH)
  })

  test("invite email SMTP reject shows warning banner with manual setup link", async ({
    adminPage,
    request,
    prisma,
  }) => {
    const testEmail = `fp-invite-reject-${Date.now()}@hrtest.local`

    // Clear any prior state
    await request.delete(OUTBOX_PATH)

    // Inject SMTP reject for emails to this address
    const injectResp = await request.post(RUNTIME_FAILURES_PATH, {
      data: { email: { mode: "reject", match: { to: testEmail } } },
    })
    expect(injectResp.ok()).toBeTruthy()

    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await expect(adminPage.getByText("User Management")).toBeVisible({ timeout: 10_000 })

    try {
      await adminPage.getByRole("button", { name: /new user/i }).click()
      await adminPage.fill("#create-name", "Failure Email User")
      await adminPage.fill("#create-email", testEmail)
      await adminPage.selectOption("#create-role", "VIEWER")
      await adminPage.getByRole("button", { name: /^create user$/i }).click()

      // Warning banner — NOT the success message
      await expect(
        adminPage.getByText(/invite email could not be sent/i),
      ).toBeVisible({ timeout: 10_000 })
      await expect(
        adminPage.getByText(/share the setup link manually/i),
      ).toBeVisible()

      // Setup URL is shown so the admin can distribute it manually
      await expect(adminPage.getByText(/set-password\?token=/i)).toBeVisible()

      // Success variant must NOT appear
      await expect(
        adminPage.getByText("An onboarding invite email has been sent"),
      ).not.toBeVisible()

      // User was still created in DB despite email failure
      const user = await prisma.user.findUnique({ where: { email: testEmail } })
      expect(user).not.toBeNull()
      expect(user?.mustChangePassword).toBe(true)
    } finally {
      // Always clean up the test user, even if an assertion above failed.
      await prisma.user.deleteMany({ where: { email: testEmail } }).catch(() => {})
    }
  })

  test("password reset email reject shows warning banner", async ({
    adminPage,
    request,
    prisma,
  }) => {
    const testEmail = `fp-pwreset-${Date.now()}@hrtest.local`
    const user = await prisma.user.create({
      data: {
        name: "PW Reset Failure User",
        email: testEmail,
        passwordHash: "$2b$04$U9K6Mqrf/1gb.VYeVdNl3eLsDDw8g.qjknF4zR5smRVa9JCuBDmBm",
        role: "VIEWER",
        active: true,
        mustChangePassword: false,
      },
    })

    try {
      const injectResp = await request.post(RUNTIME_FAILURES_PATH, {
        data: { email: { mode: "reject", match: { to: testEmail } } },
      })
      expect(injectResp.ok()).toBeTruthy()

      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      await expect(adminPage.getByText("User Management")).toBeVisible({ timeout: 10_000 })

      const searchInput = adminPage.locator('input[placeholder*="Search"]')
      await searchInput.fill(testEmail)

      const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
      await expect(userRow).toBeVisible({ timeout: 5_000 })

      await userRow.getByRole("button", { name: /reset pw/i }).click()
      await adminPage.getByRole("dialog").getByRole("button", { name: /^reset password$/i }).click()

      // Warning banner (email could not be delivered)
      await expect(
        adminPage.getByText(/could not be sent|email.*failed/i),
      ).toBeVisible({ timeout: 10_000 })
    } finally {
      await prisma.user.delete({ where: { id: user.id } })
    }
  })

  test("resend invite email timeout shows warning banner", async ({
    adminPage,
    request,
    prisma,
  }) => {
    const testEmail = `fp-resend-${Date.now()}@hrtest.local`
    const user = await prisma.user.create({
      data: {
        name: "Resend Failure User",
        email: testEmail,
        passwordHash: "$2b$04$U9K6Mqrf/1gb.VYeVdNl3eLsDDw8g.qjknF4zR5smRVa9JCuBDmBm",
        role: "VIEWER",
        active: true,
        mustChangePassword: true, // Pending Setup — shows Resend button
      },
    })

    try {
      const injectResp = await request.post(RUNTIME_FAILURES_PATH, {
        data: { email: { mode: "timeout", match: { to: testEmail } } },
      })
      expect(injectResp.ok()).toBeTruthy()

      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      await expect(adminPage.getByText("User Management")).toBeVisible({ timeout: 10_000 })

      const searchInput = adminPage.locator('input[placeholder*="Search"]')
      await searchInput.fill(testEmail)

      const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
      await expect(userRow).toBeVisible({ timeout: 5_000 })

      // Resend Invite button appears for Pending Setup users
      const resendBtn = userRow.getByRole("button", { name: /resend/i })
      await expect(resendBtn).toBeVisible({ timeout: 5_000 })
      await resendBtn.click()

      // Confirm the dialog
      const confirmBtn = adminPage.getByRole("dialog").getByRole("button", { name: /resend/i })
      await confirmBtn.click()

      // Warning that the invite could not be sent
      await expect(
        adminPage.getByText(/could not be sent|invite.*failed/i),
      ).toBeVisible({ timeout: 10_000 })
    } finally {
      await prisma.user.delete({ where: { id: user.id } })
    }
  })
})

// ---------------------------------------------------------------------------
// Storage Upload Failure Paths
// ---------------------------------------------------------------------------
//
// Uses page.route() to intercept /api/upload/resume at the browser level.
// This gives per-test isolation without touching shared server-side state.

test.describe("Storage Upload Failure Paths", { tag: "@failure-storage" }, () => {
  test("storage 503 shows 'temporarily unavailable' error in upload component", async ({
    recruiterPage,
    prisma,
  }) => {
    const candidate = await prisma.candidate.findFirst()
    if (!candidate) {
      test.skip()
      return
    }

    await recruiterPage.route("**/api/upload/resume", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Resume storage is temporarily unavailable" }),
      })
    })

    await recruiterPage.goto(`/candidates/${candidate.id}`, {
      waitUntil: "domcontentloaded",
    })
    await recruiterPage.waitForLoadState("networkidle")

    const fileInput = recruiterPage.locator('input[type="file"]').first()
    if ((await fileInput.count()) === 0) {
      test.skip()
      return
    }

    await fileInput.setInputFiles({
      name: "test-resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test content"),
    })

    // Error alert must appear — upload cannot silently fail
    await expect(
      recruiterPage.locator('[role="alert"]').filter({
        hasText: /temporarily unavailable/i,
      }),
    ).toBeVisible({ timeout: 10_000 })

    // Must also offer a recovery action (retry or choose another file)
    await expect(
      recruiterPage.getByRole("button", { name: /retry|choose another/i }),
    ).toBeVisible({ timeout: 5_000 })
  })

  test("storage 500 shows upload-failure error in upload component", async ({
    recruiterPage,
    prisma,
  }) => {
    const candidate = await prisma.candidate.findFirst()
    if (!candidate) {
      test.skip()
      return
    }

    await recruiterPage.route("**/api/upload/resume", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Failed to generate upload URL" }),
      })
    })

    await recruiterPage.goto(`/candidates/${candidate.id}`, {
      waitUntil: "domcontentloaded",
    })
    await recruiterPage.waitForLoadState("networkidle")

    const fileInput = recruiterPage.locator('input[type="file"]').first()
    if ((await fileInput.count()) === 0) {
      test.skip()
      return
    }

    await fileInput.setInputFiles({
      name: "test-resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test content"),
    })

    // Error alert must appear
    await expect(
      recruiterPage.locator('[role="alert"]').filter({
        hasText: /failed.*upload|generate upload URL/i,
      }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test("oversized file (>10MB) is rejected client-side without calling API", async ({
    recruiterPage,
    prisma,
  }) => {
    const candidate = await prisma.candidate.findFirst()
    if (!candidate) {
      test.skip()
      return
    }

    let uploadApiCalled = false
    await recruiterPage.route("**/api/upload/resume", async (route) => {
      uploadApiCalled = true
      await route.continue()
    })

    await recruiterPage.goto(`/candidates/${candidate.id}`, {
      waitUntil: "domcontentloaded",
    })
    await recruiterPage.waitForLoadState("networkidle")

    const fileInput = recruiterPage.locator('input[type="file"]').first()
    if ((await fileInput.count()) === 0) {
      test.skip()
      return
    }

    // Create a buffer just over the 10MB limit
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024, 65) // 11MB of 'A'
    await fileInput.setInputFiles({
      name: "oversized.pdf",
      mimeType: "application/pdf",
      buffer: oversizedBuffer,
    })

    // Client-side error — no network call made
    await expect(
      recruiterPage.locator('[role="alert"]').filter({
        hasText: /exceeds|10MB|size/i,
      }),
    ).toBeVisible({ timeout: 5_000 })

    expect(uploadApiCalled).toBe(false)
  })

  test("invalid file type (.exe) is rejected client-side without calling API", async ({
    recruiterPage,
    prisma,
  }) => {
    const candidate = await prisma.candidate.findFirst()
    if (!candidate) {
      test.skip()
      return
    }

    let uploadApiCalled = false
    await recruiterPage.route("**/api/upload/resume", async (route) => {
      uploadApiCalled = true
      await route.continue()
    })

    await recruiterPage.goto(`/candidates/${candidate.id}`, {
      waitUntil: "domcontentloaded",
    })
    await recruiterPage.waitForLoadState("networkidle")

    const fileInput = recruiterPage.locator('input[type="file"]').first()
    if ((await fileInput.count()) === 0) {
      test.skip()
      return
    }

    await fileInput.setInputFiles({
      name: "malware.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("MZ binary"),
    })

    // Client-side type validation error
    await expect(
      recruiterPage.locator('[role="alert"]').filter({
        hasText: /invalid file type|accepted.*pdf/i,
      }),
    ).toBeVisible({ timeout: 5_000 })

    expect(uploadApiCalled).toBe(false)
  })

  test("rate-limited upload (429) surfaces an error — not a silent failure", async ({
    recruiterPage,
    prisma,
  }) => {
    const candidate = await prisma.candidate.findFirst()
    if (!candidate) {
      test.skip()
      return
    }

    await recruiterPage.route("**/api/upload/resume", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Too many requests",
          scope: "upload",
          retryAfterSeconds: 60,
        }),
        headers: { "Retry-After": "60" },
      })
    })

    await recruiterPage.goto(`/candidates/${candidate.id}`, {
      waitUntil: "domcontentloaded",
    })
    await recruiterPage.waitForLoadState("networkidle")

    const fileInput = recruiterPage.locator('input[type="file"]').first()
    if ((await fileInput.count()) === 0) {
      test.skip()
      return
    }

    await fileInput.setInputFiles({
      name: "test-resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test"),
    })

    // Error must surface — 429 must not be silently swallowed
    await expect(
      recruiterPage.locator('[role="alert"]'),
    ).toBeVisible({ timeout: 10_000 })
  })
})
