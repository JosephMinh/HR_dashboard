/**
 * E2E Tests: Admin User Management — Resend Invite, Reset Password, Deactivate, Edit Role
 *
 * Covers the gaps identified in hr-kfwh.23.1 and the risk matrix (P0-1):
 * - Admin resend invite: issues fresh email, invalidates prior token
 * - Admin reset password: triggers reset email for active users
 * - Admin deactivate user: user shows Inactive, cannot log in
 * - Admin edit user role: role change persists in table and DB
 * - Inactive user filter: visibility across active/inactive/all filters
 */

import type { APIRequestContext } from "@playwright/test"
import { hash } from "bcryptjs"

import { test, expect } from "./fixtures"
import { createLoggedPage } from "./utils/logger"
import { getTestPassword, performLogin } from "./utils/auth"

const STRONG_PASSWORD = "NewSecureP@ss123!"
const OUTBOX_PATH = "/api/test/email-outbox"

type CapturedEmail = {
  to: string
  from: string
  subject: string
  html: string
  text: string | null
  sentAt: string
}

async function fetchEmailForRecipient(
  request: APIRequestContext,
  recipient: string,
): Promise<CapturedEmail> {
  const path = `${OUTBOX_PATH}?recipient=${encodeURIComponent(recipient)}`

  await expect
    .poll(
      async () => {
        const response = await request.get(path)
        if (!response.ok()) return 0
        const data = (await response.json()) as { emails: CapturedEmail[] }
        return data.emails.length
      },
      {
        message: `waiting for email for ${recipient}`,
        timeout: 15_000,
      },
    )
    .toBeGreaterThan(0)

  const response = await request.get(path)
  const data = (await response.json()) as { emails: CapturedEmail[] }
  return data.emails[data.emails.length - 1]!
}

async function clearEmailOutbox(request: APIRequestContext): Promise<void> {
  const response = await request.delete(OUTBOX_PATH)
  expect(response.ok()).toBeTruthy()
}

function extractSetPasswordUrl(email: CapturedEmail): string {
  const content = `${email.text ?? ""}\n${email.html}`
  const match = content.match(
    /(https?:\/\/[^\s"'<>]+\/set-password\?token=[A-Za-z0-9_-]+|\/set-password\?token=[A-Za-z0-9_-]+)/,
  )
  if (!match) {
    throw new Error("Could not find a set-password link in the captured email")
  }
  return match[0]
}

function toAbsoluteUrl(url: string, origin: string): string {
  return url.startsWith("http") ? url : `${origin}${url}`
}

// ---------------------------------------------------------------------------
// Resend Invite
// ---------------------------------------------------------------------------

test.describe("Admin Resend Invite", () => {
  test("resend invite sends a fresh email and invalidates the prior token", async ({
    adminPage,
    browser,
    prisma,
    request,
    logger,
  }) => {
    const testEmail = `e2e-resend-${Date.now()}@hrtest.local`
    const testName = "E2E Resend Invite User"

    await clearEmailOutbox(request)

    // Step 1: Admin creates user → invite email sent
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", testName)
    await adminPage.fill("#create-email", testEmail)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /^create user$/i }).click()

    await expect(
      adminPage.getByText("User created. An onboarding invite email has been sent."),
    ).toBeVisible({ timeout: 10_000 })

    // Capture first invite URL
    const firstInvite = await fetchEmailForRecipient(request, testEmail)
    const firstSetupUrl = extractSetPasswordUrl(firstInvite)

    // Clear outbox before resend
    await clearEmailOutbox(request)

    // Step 2: Find user row — should show "Pending Setup"
    const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
    await expect(userRow).toBeVisible({ timeout: 10_000 })
    await expect(userRow.getByText("Pending Setup")).toBeVisible()

    // Step 3: Click "Resend Invite" and confirm
    await userRow.getByRole("button", { name: /resend invite/i }).click()

    const dialog = adminPage.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("Resend invite?")).toBeVisible()
    await dialog.getByRole("button", { name: /^resend invite$/i }).click()
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })

    // Step 4: Verify success banner
    await expect(
      adminPage.getByText("Onboarding invite resent successfully."),
    ).toBeVisible({ timeout: 10_000 })

    // Step 5: Verify new email arrived
    const secondInvite = await fetchEmailForRecipient(request, testEmail)
    expect(secondInvite.to).toBe(testEmail)
    const secondSetupUrl = extractSetPasswordUrl(secondInvite)
    // Different token URL (resend issues a fresh token)
    expect(secondSetupUrl).not.toBe(firstSetupUrl)

    const origin = new URL(adminPage.url()).origin

    const ctx = await browser.newContext()
    const newUserPage = createLoggedPage(await ctx.newPage(), logger)

    try {
      // Step 6: Old link must be invalid (token replaced by resend)
      await newUserPage.goto(toAbsoluteUrl(firstSetupUrl, origin), {
        waitUntil: "domcontentloaded",
      })
      await expect(
        newUserPage.getByText(/invalid link|link expired|already used/i),
      ).toBeVisible({ timeout: 10_000 })

      // Step 7: New link must work — user sets password successfully
      await newUserPage.goto(toAbsoluteUrl(secondSetupUrl, origin), {
        waitUntil: "domcontentloaded",
      })
      await expect(newUserPage.getByText("Set Your Password")).toBeVisible({
        timeout: 10_000,
      })
      await newUserPage.fill("#newPassword", STRONG_PASSWORD)
      await newUserPage.fill("#confirmPassword", STRONG_PASSWORD)
      await newUserPage.getByRole("button", { name: /^set password$/i }).click()

      await expect(newUserPage.getByText("Password Set Successfully")).toBeVisible({
        timeout: 10_000,
      })

      // Verify DB: mustChangePassword cleared
      const user = await prisma.user.findUnique({ where: { email: testEmail } })
      expect(user?.mustChangePassword).toBe(false)
    } finally {
      await ctx.close()
      await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
    }
  })
})

// ---------------------------------------------------------------------------
// Reset Password
// ---------------------------------------------------------------------------

test.describe("Admin Reset Password", () => {
  test("admin triggers password reset email and user can follow link to set new password", async ({
    adminPage,
    browser,
    prisma,
    request,
    logger,
  }) => {
    const password = getTestPassword()
    const passwordHash = await hash(password, 10)
    const testEmail = `e2e-reset-pw-${Date.now()}@hrtest.local`
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Reset PW User",
        email: testEmail,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: false,
      },
    })

    await clearEmailOutbox(request)

    try {
      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })

      // Find user row
      const userRow = adminPage.locator("tr", { hasText: "E2E Reset PW User" })
      await expect(userRow).toBeVisible()

      // Click "Reset PW" button and confirm
      await userRow.getByRole("button", { name: /reset pw/i }).click()

      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText("Reset password?")).toBeVisible()
      await dialog.getByRole("button", { name: /^reset password$/i }).click()
      await expect(dialog).not.toBeVisible({ timeout: 5_000 })

      // Verify success banner
      await expect(
        adminPage.getByText("Password reset email sent successfully."),
      ).toBeVisible({ timeout: 10_000 })

      // Verify reset email was sent
      const resetEmail = await fetchEmailForRecipient(request, testEmail)
      expect(resetEmail.to).toBe(testEmail)

      // Email must contain a set-password link
      const setupUrl = extractSetPasswordUrl(resetEmail)
      expect(setupUrl).toContain("/set-password")

      // Verify a valid (non-expired, unused) token was created in DB
      const token = await prisma.setPasswordToken.findFirst({
        where: { userId: testUser.id, usedAt: null },
        orderBy: { createdAt: "desc" },
      })
      expect(token).not.toBeNull()
      expect(token?.expiresAt.getTime()).toBeGreaterThan(Date.now())

      // Step: user follows reset link and sets a new password
      const origin = new URL(adminPage.url()).origin
      const ctx = await browser.newContext()
      const resetPage = createLoggedPage(await ctx.newPage(), logger)

      try {
        await resetPage.goto(toAbsoluteUrl(setupUrl, origin), {
          waitUntil: "domcontentloaded",
        })
        await expect(resetPage.getByText("Set Your Password")).toBeVisible({
          timeout: 10_000,
        })

        await resetPage.fill("#newPassword", STRONG_PASSWORD)
        await resetPage.fill("#confirmPassword", STRONG_PASSWORD)
        await resetPage.getByRole("button", { name: /^set password$/i }).click()

        await expect(resetPage.getByText("Password Set Successfully")).toBeVisible({
          timeout: 10_000,
        })

        // User can now log in with new password
        await resetPage.getByRole("link", { name: /^sign in$/i }).click()
        await resetPage.waitForURL(/\/login/, { timeout: 10_000 })
        await resetPage.fill("#email", testEmail)
        await resetPage.fill("#password", STRONG_PASSWORD)
        await resetPage.getByRole("button", { name: /^sign in$/i }).click()

        await resetPage.waitForURL((url) => !url.pathname.includes("/login"), {
          timeout: 15_000,
        })
        await expect(resetPage).not.toHaveURL(/\/login/)
      } finally {
        await ctx.close()
      }
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })
})

// ---------------------------------------------------------------------------
// Deactivate User
// ---------------------------------------------------------------------------

test.describe("Admin Deactivate User", () => {
  test("deactivated user shows Inactive badge and cannot log in", async ({
    adminPage,
    browser,
    prisma,
    logger,
  }) => {
    const password = getTestPassword()
    const passwordHash = await hash(password, 10)
    const testEmail = `e2e-deactivate-${Date.now()}@hrtest.local`
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Deactivate User",
        email: testEmail,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: false,
      },
    })

    try {
      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })

      const userRow = adminPage.locator("tr", { hasText: "E2E Deactivate User" })
      await expect(userRow).toBeVisible()

      // Verify initial "Active" badge
      await expect(userRow.getByText("Active")).toBeVisible()

      // Open Edit dialog
      await userRow.getByRole("button", { name: /^edit$/i }).click()

      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText("Edit User")).toBeVisible()

      // Uncheck the Active checkbox
      const activeCheckbox = dialog.getByLabel("Active")
      await expect(activeCheckbox).toBeChecked()
      await activeCheckbox.uncheck()
      await expect(activeCheckbox).not.toBeChecked()

      // Save changes
      await dialog.getByRole("button", { name: /^save changes$/i }).click()
      await expect(dialog).not.toBeVisible({ timeout: 5_000 })

      // Reload and switch to Inactive filter to find the user
      await adminPage.reload({ waitUntil: "domcontentloaded" })
      await adminPage.selectOption("select", "false") // Inactive filter
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })

      const inactiveRow = adminPage.locator("tr", { hasText: "E2E Deactivate User" })
      await expect(inactiveRow).toBeVisible({ timeout: 10_000 })
      await expect(inactiveRow.getByText("Inactive")).toBeVisible()

      // Verify DB state
      const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } })
      expect(updatedUser?.active).toBe(false)

      // Deactivated user cannot log in
      const origin = new URL(adminPage.url()).origin
      const guestCtx = await browser.newContext()
      const guestPage = createLoggedPage(await guestCtx.newPage(), logger)

      try {
        await performLogin(
          guestPage,
          { email: testEmail, password, name: "E2E Deactivate User", role: "VIEWER" },
          origin,
        ).catch(() => {
          // Expected: login should fail for inactive user
        })

        // Either stays on /login or shows error — verify we're not past login
        const url = new URL(guestPage.url())
        const isOnLogin =
          url.pathname.includes("/login") ||
          (await guestPage.getByText("Invalid email or password").isVisible())

        expect(isOnLogin).toBe(true)
      } finally {
        await guestCtx.close()
      }
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })

  test("inactive users do not appear in active filter but appear in all/inactive filters", async ({
    adminPage,
    prisma,
  }) => {
    const passwordHash = await hash(getTestPassword(), 10)
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Inactive Visibility",
        email: `e2e-inactive-vis-${Date.now()}@hrtest.local`,
        passwordHash,
        role: "VIEWER",
        active: false,
      },
    })

    try {
      // Default filter = Active — inactive user must NOT appear
      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })

      const userRow = adminPage.locator("tr", { hasText: "E2E Inactive Visibility" })
      await expect(userRow).not.toBeVisible()

      // Switch to All — user appears
      await adminPage.selectOption("select", "all")
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })
      await expect(userRow).toBeVisible()
      await expect(userRow.getByText("Inactive")).toBeVisible()

      // Switch to Inactive — user still appears
      await adminPage.selectOption("select", "false")
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })
      await expect(userRow).toBeVisible()
      await expect(userRow.getByText("Inactive")).toBeVisible()
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })
})

// ---------------------------------------------------------------------------
// Edit User Role
// ---------------------------------------------------------------------------

test.describe("Admin Edit User Role", () => {
  test("admin can promote a VIEWER to RECRUITER via the edit dialog", async ({
    adminPage,
    prisma,
  }) => {
    const passwordHash = await hash(getTestPassword(), 10)
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Role Change",
        email: `e2e-role-change-${Date.now()}@hrtest.local`,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: false,
      },
    })

    try {
      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })

      const userRow = adminPage.locator("tr", { hasText: "E2E Role Change" })
      await expect(userRow).toBeVisible()
      await expect(userRow.getByText("VIEWER")).toBeVisible()

      // Open edit dialog
      await userRow.getByRole("button", { name: /^edit$/i }).click()

      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText("Edit User")).toBeVisible()

      // Change role to RECRUITER
      const roleSelect = dialog.locator(`select#edit-role-${testUser.id}`)
      await roleSelect.selectOption("RECRUITER")

      // Save
      await dialog.getByRole("button", { name: /^save changes$/i }).click()
      await expect(dialog).not.toBeVisible({ timeout: 5_000 })

      // Reload and verify role change
      await adminPage.reload({ waitUntil: "domcontentloaded" })
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })

      const updatedRow = adminPage.locator("tr", { hasText: "E2E Role Change" })
      await expect(updatedRow).toBeVisible({ timeout: 10_000 })
      await expect(updatedRow.getByText("RECRUITER")).toBeVisible()

      // Verify in DB
      const updated = await prisma.user.findUnique({ where: { id: testUser.id } })
      expect(updated?.role).toBe("RECRUITER")
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })

  test("admin cannot change their own role", async ({ adminPage, prisma }) => {
    // Find the current admin user's own row (has the "(you)" marker)
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await adminPage.waitForSelector("table tbody tr", { state: "visible" })

    const selfRow = adminPage.locator("tr", { hasText: "(you)" })
    await expect(selfRow).toBeVisible()

    // Open edit dialog for self
    await selfRow.getByRole("button", { name: /^edit$/i }).click()

    const dialog = adminPage.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Role select must be disabled for self
    const roleSelect = dialog.locator("select").filter({ hasText: /ADMIN|RECRUITER|VIEWER/ })
    await expect(roleSelect).toBeDisabled()

    // Close dialog
    await adminPage.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible({ timeout: 3_000 })
  })
})
