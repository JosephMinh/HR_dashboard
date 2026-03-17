/**
 * E2E Journey: Admin User Management
 *
 * Covers the complete admin user lifecycle including:
 * - Resend invite (new token works, old token invalidated)
 * - Admin-triggered password reset via email
 * - Edit user name and role
 * - Deactivate and reactivate users
 * - Self-protection UI guards (disabled controls for current user)
 *
 * These tests require the test email outbox (/api/test/email-outbox) and a
 * running Next.js app server against the test database.
 *
 * bead: hr-kfwh.23.1
 */

import type { APIRequestContext } from "@playwright/test"
import { hash } from "bcryptjs"
import { test, expect } from "./fixtures"
import { createLoggedPage } from "./utils/logger"
import { performLogin } from "./utils/auth"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTBOX_PATH = "/api/test/email-outbox"
const USERS_URL = "/admin/users"
const STRONG_PASSWORD = "JourneyP@ss99!"
const BCRYPT_ROUNDS = 10

// ---------------------------------------------------------------------------
// Email helpers (mirrors invite-onboarding-flow.spec.ts but self-contained)
// ---------------------------------------------------------------------------

type CapturedEmail = {
  to: string
  from: string
  subject: string
  html: string
  text: string | null
  sentAt: string
}

async function clearEmailOutbox(request: APIRequestContext): Promise<void> {
  const res = await request.delete(OUTBOX_PATH)
  expect(res.ok()).toBeTruthy()
}

async function fetchLatestEmail(
  request: APIRequestContext,
  recipient: string,
): Promise<CapturedEmail> {
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `${OUTBOX_PATH}?recipient=${encodeURIComponent(recipient)}`,
        )
        if (!res.ok()) return 0
        const data = (await res.json()) as { emails: CapturedEmail[] }
        return data.emails.length
      },
      { message: `waiting for email to ${recipient}`, timeout: 12_000 },
    )
    .toBeGreaterThan(0)

  const res = await request.get(
    `${OUTBOX_PATH}?recipient=${encodeURIComponent(recipient)}`,
  )
  const data = (await res.json()) as { emails: CapturedEmail[] }
  return data.emails[data.emails.length - 1]!
}

function extractSetPasswordUrl(email: CapturedEmail): string {
  const content = `${email.text ?? ""}\n${email.html}`
  const match = content.match(
    /(https?:\/\/[^\s"'<>]+\/set-password\?token=[A-Za-z0-9_-]+|\/set-password\?token=[A-Za-z0-9_-]+)/,
  )
  if (!match) {
    throw new Error(`No set-password link found in email to ${email.to}`)
  }
  return match[0]
}

// ---------------------------------------------------------------------------
// Admin creates + navigates to users page helper
// ---------------------------------------------------------------------------

async function openUsersPage(adminPage: ReturnType<typeof createLoggedPage>) {
  await adminPage.goto(USERS_URL, { waitUntil: "domcontentloaded" })
  await expect(adminPage.getByText("User Management")).toBeVisible()
  await adminPage.waitForSelector("table tbody tr", { state: "visible" })
}

async function findUserRow(
  adminPage: ReturnType<typeof createLoggedPage>,
  nameOrEmail: string,
) {
  return adminPage.locator("tr", { hasText: nameOrEmail })
}

// ---------------------------------------------------------------------------
// Resend Invite
// ---------------------------------------------------------------------------

test.describe("Resend Invite", () => {
  test("admin resends invite — new token works, old token is invalidated", async ({
    adminPage,
    browser,
    prisma,
    request,
    logger,
  }) => {
    const testEmail = `e2e-resend-${Date.now()}@hrtest.local`

    await clearEmailOutbox(request)

    // Step 1: Admin creates user via UI → first invite email (token A)
    await openUsersPage(adminPage)
    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", "E2E Resend User")
    await adminPage.fill("#create-email", testEmail)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /^create user$/i }).click()
    await expect(
      adminPage.getByText("User created. An onboarding invite email has been sent."),
    ).toBeVisible({ timeout: 10_000 })

    // Capture first invite URL
    const firstEmail = await fetchLatestEmail(request, testEmail)
    const firstUrl = extractSetPasswordUrl(firstEmail)

    // Step 2: Admin resends invite — triggers new token (token B), invalidates token A
    await clearEmailOutbox(request)
    await adminPage.reload({ waitUntil: "domcontentloaded" })
    const userRow = adminPage.locator("tr", { hasText: testEmail })
    await expect(userRow).toBeVisible({ timeout: 10_000 })
    await expect(userRow.getByText("Pending Setup")).toBeVisible()

    // The "Resend Invite" button is a ghost button with Mail icon
    const resendBtn = userRow.getByRole("button", { name: /resend invite/i })
    await expect(resendBtn).toBeVisible()
    await resendBtn.click()

    // Confirmation dialog
    const dialog = adminPage.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/resend.*invite/i)).toBeVisible()
    await dialog.getByRole("button", { name: /resend invite/i }).click()
    await expect(dialog).not.toBeVisible({ timeout: 8_000 })

    // Success banner
    await expect(
      adminPage.getByText("Onboarding invite resent successfully."),
    ).toBeVisible({ timeout: 10_000 })

    // Capture second invite URL
    const secondEmail = await fetchLatestEmail(request, testEmail)
    const secondUrl = extractSetPasswordUrl(secondEmail)

    // Token B should be different from token A
    expect(secondUrl).not.toBe(firstUrl)

    const newUserCtx = await browser.newContext()
    const newUserPage = createLoggedPage(await newUserCtx.newPage(), logger)

    try {
      // Step 3: Old token A is now invalid
      await newUserPage.goto(firstUrl, { waitUntil: "domcontentloaded" })
      await expect(newUserPage.getByText("Invalid Link")).toBeVisible({
        timeout: 10_000,
      })

      // Step 4: New token B works — user sets password and logs in
      await newUserPage.goto(secondUrl, { waitUntil: "domcontentloaded" })
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
      const dbUser = await prisma.user.findUnique({
        where: { email: testEmail },
        select: { mustChangePassword: true },
      })
      expect(dbUser?.mustChangePassword).toBe(false)
    } finally {
      await newUserCtx.close()
      await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
    }
  })

  test("cancel on resend invite dialog keeps invite status unchanged", async ({
    adminPage,
    prisma,
  }) => {
    const passwordHash = await hash("InitialPassword1!", BCRYPT_ROUNDS)
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Resend Cancel",
        email: `e2e-resend-cancel-${Date.now()}@hrtest.local`,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: true,
      },
    })

    try {
      await openUsersPage(adminPage)
      const userRow = adminPage.locator("tr", { hasText: testUser.email })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      // Click Resend Invite
      await userRow.getByRole("button", { name: /resend invite/i }).click()
      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      // Cancel
      await dialog.getByRole("button", { name: /cancel/i }).click()
      await expect(dialog).not.toBeVisible({ timeout: 5_000 })

      // No status banner
      await expect(
        adminPage.getByText("Onboarding invite resent successfully."),
      ).not.toBeVisible()

      // User still shows Pending Setup
      await expect(userRow.getByText("Pending Setup")).toBeVisible()

      // DB: mustChangePassword unchanged
      const dbUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { mustChangePassword: true },
      })
      expect(dbUser?.mustChangePassword).toBe(true)
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })
})

// ---------------------------------------------------------------------------
// Admin Reset Password
// ---------------------------------------------------------------------------

test.describe("Admin Reset Password", () => {
  test("admin triggers password reset, user sets new password via email link", async ({
    adminPage,
    browser,
    prisma,
    request,
    logger,
  }) => {
    const testEmail = `e2e-resetpw-${Date.now()}@hrtest.local`
    const originalPassword = "OriginalPass1!"
    const newPassword = "ResetNewPass2@"
    const passwordHash = await hash(originalPassword, BCRYPT_ROUNDS)

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

    try {
      await clearEmailOutbox(request)
      await openUsersPage(adminPage)

      const userRow = adminPage.locator("tr", { hasText: testEmail })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      // "Reset PW" button is only shown for active users
      const resetBtn = userRow.getByRole("button", { name: /reset pw/i })
      await expect(resetBtn).toBeVisible()
      await resetBtn.click()

      // Confirmation dialog
      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText(/reset password/i)).toBeVisible()
      await dialog.getByRole("button", { name: /reset password/i }).click()
      await expect(dialog).not.toBeVisible({ timeout: 8_000 })

      // Success banner
      await expect(
        adminPage.getByText("Password reset email sent successfully."),
      ).toBeVisible({ timeout: 10_000 })

      // Capture the reset email
      const resetEmail = await fetchLatestEmail(request, testEmail)
      expect(resetEmail.subject).toMatch(/password/i)
      const resetUrl = extractSetPasswordUrl(resetEmail)

      // User navigates to reset link and sets a new password
      const userCtx = await browser.newContext()
      const userPage = createLoggedPage(await userCtx.newPage(), logger)

      try {
        await userPage.goto(resetUrl, { waitUntil: "domcontentloaded" })
        await expect(userPage.getByText("Set Your Password")).toBeVisible({
          timeout: 10_000,
        })

        await userPage.fill("#newPassword", newPassword)
        await userPage.fill("#confirmPassword", newPassword)
        await userPage.getByRole("button", { name: /^set password$/i }).click()
        await expect(
          userPage.getByText("Password Set Successfully"),
        ).toBeVisible({ timeout: 10_000 })

        // User can log in with the new password
        const appOrigin = new URL(adminPage.url()).origin
        await userPage.goto(`${appOrigin}/login`, {
          waitUntil: "domcontentloaded",
        })
        await userPage.fill("#email", testEmail)
        await userPage.fill("#password", newPassword)
        await userPage.getByRole("button", { name: /^sign in$/i }).click()
        await userPage.waitForURL(
          (url) => !url.pathname.includes("/login"),
          { timeout: 15_000 },
        )
        await expect(userPage).not.toHaveURL(/\/login/)

        // Original password no longer works
        const loginCtx = await browser.newContext()
        const loginPage = createLoggedPage(await loginCtx.newPage(), logger)
        try {
          await loginPage.goto(`${appOrigin}/login`, {
            waitUntil: "domcontentloaded",
          })
          await loginPage.fill("#email", testEmail)
          await loginPage.fill("#password", originalPassword)
          await loginPage.getByRole("button", { name: /^sign in$/i }).click()
          await expect(
            loginPage.getByText("Invalid email or password"),
          ).toBeVisible({ timeout: 10_000 })
        } finally {
          await loginCtx.close()
        }
      } finally {
        await userCtx.close()
      }
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })
})

// ---------------------------------------------------------------------------
// Edit User
// ---------------------------------------------------------------------------

test.describe("Edit User", () => {
  test("admin can update a user's display name", async ({ adminPage, prisma }) => {
    const passwordHash = await hash("EditNamePass1!", BCRYPT_ROUNDS)
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Edit Name Before",
        email: `e2e-edit-name-${Date.now()}@hrtest.local`,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: false,
      },
    })

    try {
      await openUsersPage(adminPage)
      const userRow = adminPage.locator("tr", { hasText: testUser.email })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      // Open edit dialog
      await userRow.getByRole("button", { name: "Edit" }).click()
      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText("Edit User")).toBeVisible()

      // Change name
      const nameInput = dialog.getByLabel("Name")
      await nameInput.clear()
      await nameInput.fill("E2E Edit Name After")

      await dialog.getByRole("button", { name: "Save Changes" }).click()
      await expect(dialog).not.toBeVisible({ timeout: 8_000 })

      // Row reflects updated name
      await expect(
        adminPage.locator("tr", { hasText: "E2E Edit Name After" }),
      ).toBeVisible({ timeout: 10_000 })

      // DB reflects updated name
      const dbUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { name: true },
      })
      expect(dbUser?.name).toBe("E2E Edit Name After")
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })

  test("admin can promote a user to a higher role", async ({ adminPage, prisma }) => {
    const passwordHash = await hash("PromotePass1!", BCRYPT_ROUNDS)
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Promote User",
        email: `e2e-promote-${Date.now()}@hrtest.local`,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: false,
      },
    })

    try {
      await openUsersPage(adminPage)
      const userRow = adminPage.locator("tr", { hasText: testUser.email })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      // Open edit dialog
      await userRow.getByRole("button", { name: "Edit" }).click()
      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      // Change role to RECRUITER
      await dialog.getByLabel("Role").selectOption("RECRUITER")
      await dialog.getByRole("button", { name: "Save Changes" }).click()
      await expect(dialog).not.toBeVisible({ timeout: 8_000 })

      // Row badge reflects new role
      const updatedRow = adminPage.locator("tr", { hasText: testUser.email })
      await expect(updatedRow.getByText("RECRUITER")).toBeVisible({ timeout: 10_000 })

      // DB reflects new role
      const dbUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { role: true },
      })
      expect(dbUser?.role).toBe("RECRUITER")
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })
})

// ---------------------------------------------------------------------------
// Deactivate and Reactivate
// ---------------------------------------------------------------------------

test.describe("Deactivate and Reactivate", () => {
  test("admin deactivates a user — Inactive badge shown, login blocked", async ({
    adminPage,
    browser,
    prisma,
    logger,
  }) => {
    const testEmail = `e2e-deactivate-${Date.now()}@hrtest.local`
    const password = "DeactivateMe1!"
    const passwordHash = await hash(password, BCRYPT_ROUNDS)

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
      await openUsersPage(adminPage)
      const userRow = adminPage.locator("tr", { hasText: testEmail })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      // Open edit dialog and uncheck Active
      await userRow.getByRole("button", { name: "Edit" }).click()
      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      const activeCheckbox = dialog.getByLabel("Active")
      await expect(activeCheckbox).toBeChecked()
      await activeCheckbox.uncheck()
      await expect(activeCheckbox).not.toBeChecked()

      await dialog.getByRole("button", { name: "Save Changes" }).click()
      await expect(dialog).not.toBeVisible({ timeout: 8_000 })

      // The row should now show "Inactive" (requires switching filter)
      // Switch filter to "All" to see inactive users
      await adminPage.locator("select").selectOption("all")
      await adminPage.waitForTimeout(500) // brief wait for re-fetch

      const inactiveRow = adminPage.locator("tr", { hasText: testEmail })
      await expect(inactiveRow).toBeVisible({ timeout: 10_000 })
      await expect(inactiveRow.getByText("Inactive")).toBeVisible({ timeout: 10_000 })

      // DB confirms deactivation
      const dbUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { active: true },
      })
      expect(dbUser?.active).toBe(false)

      // Login attempt with deactivated user fails
      const appOrigin = new URL(adminPage.url()).origin
      const loginCtx = await browser.newContext()
      const loginPage = createLoggedPage(await loginCtx.newPage(), logger)
      try {
        await loginPage.goto(`${appOrigin}/login`, {
          waitUntil: "domcontentloaded",
        })
        await loginPage.fill("#email", testEmail)
        await loginPage.fill("#password", password)
        await loginPage.getByRole("button", { name: /^sign in$/i }).click()
        await expect(
          loginPage.getByText("Invalid email or password"),
        ).toBeVisible({ timeout: 10_000 })
        await expect(loginPage).toHaveURL(/\/login/)
      } finally {
        await loginCtx.close()
      }
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })

  test("admin reactivates an inactive user — user can log in again", async ({
    adminPage,
    browser,
    prisma,
    logger,
  }) => {
    const testEmail = `e2e-reactivate-${Date.now()}@hrtest.local`
    const password = "Reactivate1!"
    const passwordHash = await hash(password, BCRYPT_ROUNDS)

    // Create user as inactive directly
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Reactivate User",
        email: testEmail,
        passwordHash,
        role: "VIEWER",
        active: false,
        mustChangePassword: false,
      },
    })

    try {
      await openUsersPage(adminPage)

      // Switch to Inactive filter to find the user
      await adminPage.locator("select").selectOption("false")
      await adminPage.waitForTimeout(500)

      const userRow = adminPage.locator("tr", { hasText: testEmail })
      await expect(userRow).toBeVisible({ timeout: 10_000 })
      await expect(userRow.getByText("Inactive")).toBeVisible()

      // Open edit dialog and check Active
      await userRow.getByRole("button", { name: "Edit" }).click()
      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      const activeCheckbox = dialog.getByLabel("Active")
      await expect(activeCheckbox).not.toBeChecked()
      await activeCheckbox.check()
      await expect(activeCheckbox).toBeChecked()

      await dialog.getByRole("button", { name: "Save Changes" }).click()
      await expect(dialog).not.toBeVisible({ timeout: 8_000 })

      // Switch to Active filter — user should appear with Active badge
      await adminPage.locator("select").selectOption("true")
      await adminPage.waitForTimeout(500)

      const activeRow = adminPage.locator("tr", { hasText: testEmail })
      await expect(activeRow).toBeVisible({ timeout: 10_000 })
      await expect(activeRow.getByText("Active")).toBeVisible()

      // DB confirms reactivation
      const dbUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { active: true },
      })
      expect(dbUser?.active).toBe(true)

      // User can now log in
      const appOrigin = new URL(adminPage.url()).origin
      const loginCtx = await browser.newContext()
      const loginPage = createLoggedPage(await loginCtx.newPage(), logger)
      try {
        await performLogin(
          loginPage,
          { email: testEmail, password, name: "E2E Reactivate User", role: "VIEWER" },
          appOrigin,
        )
        await loginPage.waitForURL(
          (url) => !url.pathname.includes("/login"),
          { timeout: 15_000 },
        )
        await expect(loginPage).not.toHaveURL(/\/login/)
      } finally {
        await loginCtx.close()
      }
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })
})

// ---------------------------------------------------------------------------
// Self-Protection Guards (UI)
// ---------------------------------------------------------------------------

test.describe("Self-Protection Guards", () => {
  test("admin cannot deactivate themselves — Active checkbox is disabled in edit dialog", async ({
    adminPage,
  }) => {
    await openUsersPage(adminPage)

    // Find the current admin's row (marked with "(you)")
    const selfRow = adminPage.locator("tr", { hasText: "(you)" })
    await expect(selfRow).toBeVisible()

    // Open edit dialog
    await selfRow.getByRole("button", { name: "Edit" }).click()
    const dialog = adminPage.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Active checkbox must be disabled
    const activeCheckbox = dialog.getByLabel("Active")
    await expect(activeCheckbox).toBeDisabled()

    // Close dialog
    await adminPage.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  })

  test("admin cannot change their own role — Role selector is disabled in edit dialog", async ({
    adminPage,
  }) => {
    await openUsersPage(adminPage)

    // Find the current admin's row
    const selfRow = adminPage.locator("tr", { hasText: "(you)" })
    await expect(selfRow).toBeVisible()

    // Open edit dialog
    await selfRow.getByRole("button", { name: "Edit" }).click()
    const dialog = adminPage.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Role selector must be disabled
    const roleSelect = dialog.getByLabel("Role")
    await expect(roleSelect).toBeDisabled()

    // Hint text visible
    await expect(
      dialog.getByText("You cannot change your own role."),
    ).toBeVisible()

    // Close dialog
    await adminPage.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  })

  test("admin delete button is not shown for their own row", async ({
    adminPage,
  }) => {
    await openUsersPage(adminPage)

    const selfRow = adminPage.locator("tr", { hasText: "(you)" })
    await expect(selfRow).toBeVisible()

    // No delete button in self row
    const deleteBtn = selfRow.locator('button[aria-label^="Delete user"]')
    await expect(deleteBtn).toHaveCount(0)
  })
})
