/**
 * Full-stack onboarding and admin user management journey suite.
 *
 * Covers the complete lifecycle:
 *  - Admin creates user → invite email → user sets password → login ungated
 *  - Admin resend invite → fresh token sent, old token invalidated
 *  - Admin reset password → reset email → user sets new password → login works
 *  - Admin deactivate / reactivate user via Edit dialog
 *  - Delete confirmation dialog: cancel preserves user, confirm removes user
 *
 * Bead: hr-kfwh.23.1
 */

import type { APIRequestContext } from "@playwright/test"
import { hash } from "bcryptjs"

import { test, expect } from "./fixtures"
import { createLoggedPage } from "./utils/logger"

const STRONG_PASSWORD = "JourneyTestP@ss99!"
const OUTBOX_PATH = "/api/test/email-outbox"

// ---------------------------------------------------------------------------
// Email helpers (local to this suite)
// ---------------------------------------------------------------------------

type CapturedEmail = {
  to: string
  subject: string
  html: string
  text: string | null
}

async function fetchLatestEmail(
  request: APIRequestContext,
  recipient: string,
  timeoutMs = 10_000,
): Promise<CapturedEmail> {
  const path = `${OUTBOX_PATH}?recipient=${encodeURIComponent(recipient)}`

  await expect
    .poll(
      async () => {
        const res = await request.get(path)
        if (!res.ok()) return 0
        const data = (await res.json()) as { emails: CapturedEmail[] }
        return data.emails.length
      },
      { message: `waiting for email for ${recipient}`, timeout: timeoutMs },
    )
    .toBeGreaterThan(0)

  const res = await request.get(path)
  expect(res.ok()).toBeTruthy()
  const data = (await res.json()) as { emails: CapturedEmail[] }
  return data.emails[data.emails.length - 1]!
}

async function countEmails(
  request: APIRequestContext,
  recipient: string,
): Promise<number> {
  const res = await request.get(
    `${OUTBOX_PATH}?recipient=${encodeURIComponent(recipient)}`,
  )
  if (!res.ok()) return 0
  const data = (await res.json()) as { emails: CapturedEmail[] }
  return data.emails.length
}

async function clearEmailOutbox(request: APIRequestContext): Promise<void> {
  const res = await request.delete(OUTBOX_PATH)
  expect(res.ok()).toBeTruthy()
}

function extractSetPasswordUrl(email: CapturedEmail): string {
  const content = `${email.text ?? ""}\n${email.html}`
  const match = content.match(
    /(https?:\/\/[^\s"'<>]+\/set-password\?token=[A-Za-z0-9_-]+|\/set-password\?token=[A-Za-z0-9_-]+)/,
  )
  if (!match) {
    throw new Error("Could not find a set-password link in the email")
  }
  return match[0]
}

// ---------------------------------------------------------------------------
// Suite: Resend Invite Flow
// ---------------------------------------------------------------------------

test.describe("Admin Resend Invite Flow", () => {
  test("resend invite issues fresh token, UI shows success banner, and user can complete onboarding via new link", async ({
    adminPage,
    browser,
    prisma,
    request,
    logger,
  }) => {
    const testEmail = `e2e-resend-${Date.now()}@hrtest.local`
    const testName = "E2E Resend User"

    await clearEmailOutbox(request)

    // Step 1: Admin creates the user
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await expect(adminPage.getByText("User Management")).toBeVisible()

    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", testName)
    await adminPage.fill("#create-email", testEmail)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /^create user$/i }).click()

    await expect(
      adminPage.getByText("User created. An onboarding invite email has been sent."),
    ).toBeVisible({ timeout: 10_000 })

    // Verify "Pending Setup" badge appears in the row
    const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
    await expect(userRow).toBeVisible({ timeout: 10_000 })
    await expect(userRow.getByText("Pending Setup")).toBeVisible()

    // Capture the first invite email URL (for later invalidation check)
    const firstEmail = await fetchLatestEmail(request, testEmail)
    expect(firstEmail.subject).toBe("You're invited to HR Dashboard")
    const firstSetupUrl = extractSetPasswordUrl(firstEmail)

    // Step 2: Admin clicks "Resend Invite"
    await clearEmailOutbox(request)

    await userRow.getByRole("button", { name: /resend invite/i }).click()

    // Confirmation dialog appears
    await expect(adminPage.getByText("Resend invite?")).toBeVisible({
      timeout: 5_000,
    })
    await expect(
      adminPage.getByText(/fresh setup link and invalidate any previous ones/i),
    ).toBeVisible()

    // Confirm the resend
    await adminPage.getByRole("button", { name: /^resend invite$/i }).click()

    // Success banner appears
    await expect(
      adminPage.getByText("Onboarding invite resent successfully."),
    ).toBeVisible({ timeout: 10_000 })

    // Step 3: A fresh email arrives in the outbox
    const secondEmail = await fetchLatestEmail(request, testEmail)
    expect(secondEmail.subject).toBe("You're invited to HR Dashboard")
    const secondSetupUrl = extractSetPasswordUrl(secondEmail)
    expect(secondSetupUrl).not.toBe(firstSetupUrl)

    // Step 4: The old (first) token is now invalid
    const ctx1 = await browser.newContext()
    const page1 = createLoggedPage(await ctx1.newPage(), logger)
    try {
      await page1.goto(firstSetupUrl, { waitUntil: "domcontentloaded" })
      // Should show one of: Already Used, Invalid Link, or Link Expired
      await expect(
        page1.getByText(/already used|invalid link|link expired/i),
      ).toBeVisible({ timeout: 10_000 })
    } finally {
      await ctx1.close()
    }

    // Step 5: New token completes onboarding successfully
    const ctx2 = await browser.newContext()
    const page2 = createLoggedPage(await ctx2.newPage(), logger)
    try {
      await page2.goto(secondSetupUrl, { waitUntil: "domcontentloaded" })
      await expect(page2.getByText("Set Your Password")).toBeVisible({
        timeout: 10_000,
      })

      await page2.fill("#newPassword", STRONG_PASSWORD)
      await page2.fill("#confirmPassword", STRONG_PASSWORD)
      await page2.getByRole("button", { name: /^set password$/i }).click()

      await expect(page2.getByText("Password Set Successfully")).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await ctx2.close()
    }

    // Step 6: DB reflects completed onboarding
    const dbUser = await prisma.user.findUnique({
      where: { email: testEmail },
      select: { mustChangePassword: true },
    })
    expect(dbUser?.mustChangePassword).toBe(false)

    // Step 7: Admin UI no longer shows "Pending Setup"
    await adminPage.reload({ waitUntil: "domcontentloaded" })
    const completedRow = adminPage.getByRole("row").filter({ hasText: testEmail })
    await expect(completedRow).toBeVisible({ timeout: 10_000 })
    await expect(completedRow.getByText("Pending Setup")).toHaveCount(0)

    // Cleanup
    await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
  })

  test("resend invite cancel leaves prior invite intact", async ({
    adminPage,
    prisma,
    request,
  }) => {
    const testEmail = `e2e-resend-cancel-${Date.now()}@hrtest.local`

    await clearEmailOutbox(request)

    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", "E2E Resend Cancel")
    await adminPage.fill("#create-email", testEmail)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /^create user$/i }).click()
    await expect(
      adminPage.getByText("User created. An onboarding invite email has been sent."),
    ).toBeVisible({ timeout: 10_000 })

    // Record email count before attempted resend
    const countBefore = await countEmails(request, testEmail)

    const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
    await userRow.getByRole("button", { name: /resend invite/i }).click()
    await expect(adminPage.getByText("Resend invite?")).toBeVisible()

    // Cancel the dialog
    await adminPage.getByRole("button", { name: /^cancel$/i }).click()

    // Dialog should be gone
    await expect(adminPage.getByText("Resend invite?")).not.toBeVisible()

    // No additional email was sent
    const countAfter = await countEmails(request, testEmail)
    expect(countAfter).toBe(countBefore)

    // User still shows Pending Setup
    await expect(userRow.getByText("Pending Setup")).toBeVisible()

    // Cleanup
    await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
  })
})

// ---------------------------------------------------------------------------
// Suite: Admin Reset Password Flow
// ---------------------------------------------------------------------------

test.describe("Admin Reset Password Flow", () => {
  test("admin resets password → reset email sent → user sets new password → logs in", async ({
    adminPage,
    browser,
    prisma,
    request,
    logger,
  }) => {
    const testEmail = `e2e-reset-pw-${Date.now()}@hrtest.local`
    const testName = "E2E Reset PW User"
    const initialPassword = STRONG_PASSWORD
    const newPassword = "ResetNewP@ss77!"

    // Create user directly in DB — already onboarded (mustChangePassword=false)
    const passwordHash = await hash(initialPassword, 10)
    const createdUser = await prisma.user.create({
      data: {
        name: testName,
        email: testEmail,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: false,
      },
    })

    await clearEmailOutbox(request)

    try {
      // Step 1: Admin navigates to user management and finds the user
      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      await expect(adminPage.getByText("User Management")).toBeVisible()

      const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      // "Pending Setup" badge should NOT be present (user has completed onboarding)
      await expect(userRow.getByText("Pending Setup")).toHaveCount(0)

      // Step 2: Click "Reset PW"
      await userRow.getByRole("button", { name: /reset pw/i }).click()

      // Confirmation dialog
      await expect(adminPage.getByText("Reset password?")).toBeVisible({
        timeout: 5_000,
      })
      await expect(
        adminPage.getByText(/password reset email will be sent/i),
      ).toBeVisible()

      // Confirm reset
      await adminPage.getByRole("button", { name: /^reset password$/i }).click()

      // Success banner
      await expect(
        adminPage.getByText("Password reset email sent successfully."),
      ).toBeVisible({ timeout: 10_000 })

      // Step 3: Reset email arrives
      const resetEmail = await fetchLatestEmail(request, testEmail)
      expect(resetEmail.subject).toBe("Reset your HR Dashboard password")
      const resetUrl = extractSetPasswordUrl(resetEmail)

      // Step 4: User follows reset link and sets new password
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

        await expect(userPage.getByText("Password Set Successfully")).toBeVisible({
          timeout: 10_000,
        })

        // Step 5: User logs in with new password
        await userPage.getByRole("link", { name: /^sign in$/i }).click()
        await userPage.waitForURL(/\/login/, { timeout: 10_000 })

        await userPage.fill("#email", testEmail)
        await userPage.fill("#password", newPassword)
        await userPage.getByRole("button", { name: /^sign in$/i }).click()

        await userPage.waitForURL((url) => !url.pathname.includes("/login"), {
          timeout: 15_000,
        })
        // Login should not require a password change
        await expect(userPage).not.toHaveURL(/\/settings\/password/)
      } finally {
        await userCtx.close()
      }

      // Step 6: DB reflects mustChangePassword=false (password was reset and then completed)
      const dbUser = await prisma.user.findUnique({
        where: { id: createdUser.id },
        select: { mustChangePassword: true },
      })
      expect(dbUser?.mustChangePassword).toBe(false)
    } finally {
      await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => {})
    }
  })

  test("reset PW cancel dismisses dialog without sending email", async ({
    adminPage,
    prisma,
    request,
  }) => {
    const testEmail = `e2e-reset-cancel-${Date.now()}@hrtest.local`
    const passwordHash = await hash(STRONG_PASSWORD, 10)
    const createdUser = await prisma.user.create({
      data: {
        name: "E2E Reset Cancel",
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
      const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      await userRow.getByRole("button", { name: /reset pw/i }).click()
      await expect(adminPage.getByText("Reset password?")).toBeVisible()

      await adminPage.getByRole("button", { name: /^cancel$/i }).click()

      // Dialog dismissed
      await expect(adminPage.getByText("Reset password?")).not.toBeVisible()

      // No email sent
      const emailCount = await countEmails(request, testEmail)
      expect(emailCount).toBe(0)
    } finally {
      await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => {})
    }
  })
})

// ---------------------------------------------------------------------------
// Suite: Deactivate / Reactivate User
// ---------------------------------------------------------------------------

test.describe("Admin Deactivate and Reactivate User", () => {
  test("deactivating a user hides resend-invite and reset-pw buttons; reactivating restores them", async ({
    adminPage,
    prisma,
  }) => {
    const testEmail = `e2e-deactivate-${Date.now()}@hrtest.local`
    const passwordHash = await hash(STRONG_PASSWORD, 10)
    const createdUser = await prisma.user.create({
      data: {
        name: "E2E Deactivate User",
        email: testEmail,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: true,
      },
    })

    try {
      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      // Active user with mustChangePassword shows both action buttons
      await expect(userRow.getByText("Active")).toBeVisible()
      await expect(userRow.getByText("Pending Setup")).toBeVisible()
      await expect(
        userRow.getByRole("button", { name: /resend invite/i }),
      ).toBeVisible()
      await expect(
        userRow.getByRole("button", { name: /reset pw/i }),
      ).toBeVisible()

      // Step 1: Deactivate via Edit dialog
      await userRow.getByRole("button", { name: /^edit$/i }).click()
      await expect(adminPage.getByText("Edit User")).toBeVisible()

      // Uncheck the Active checkbox
      const activeCheckbox = adminPage.getByLabel(/^active$/i)
      await expect(activeCheckbox).toBeChecked()
      await activeCheckbox.uncheck()
      await expect(activeCheckbox).not.toBeChecked()

      await adminPage.getByRole("button", { name: /^save changes$/i }).click()

      // Dialog closes
      await expect(adminPage.getByText("Edit User")).not.toBeVisible()

      // Step 2: Row now shows "Inactive"
      await expect(userRow.getByText("Inactive")).toBeVisible({ timeout: 10_000 })
      await expect(userRow.getByText("Active")).toHaveCount(0)

      // Action buttons that require active status are gone
      await expect(
        userRow.getByRole("button", { name: /resend invite/i }),
      ).toHaveCount(0)
      await expect(
        userRow.getByRole("button", { name: /reset pw/i }),
      ).toHaveCount(0)

      // DB reflects deactivation
      const dbUser = await prisma.user.findUnique({
        where: { id: createdUser.id },
        select: { active: true },
      })
      expect(dbUser?.active).toBe(false)

      // Step 3: Reactivate via Edit dialog
      await userRow.getByRole("button", { name: /^edit$/i }).click()
      await expect(adminPage.getByText("Edit User")).toBeVisible()

      const activeCheckboxAgain = adminPage.getByLabel(/^active$/i)
      await activeCheckboxAgain.check()
      await adminPage.getByRole("button", { name: /^save changes$/i }).click()

      await expect(adminPage.getByText("Edit User")).not.toBeVisible()

      // Step 4: Row shows "Active" again and buttons are restored
      await expect(userRow.getByText("Active")).toBeVisible({ timeout: 10_000 })
      await expect(
        userRow.getByRole("button", { name: /resend invite/i }),
      ).toBeVisible()
      await expect(
        userRow.getByRole("button", { name: /reset pw/i }),
      ).toBeVisible()

      // DB reflects reactivation
      const dbUserAfter = await prisma.user.findUnique({
        where: { id: createdUser.id },
        select: { active: true },
      })
      expect(dbUserAfter?.active).toBe(true)
    } finally {
      await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => {})
    }
  })

  test("inactive user cannot log in", async ({ browser, prisma, logger }) => {
    const testEmail = `e2e-inactive-login-${Date.now()}@hrtest.local`
    const passwordHash = await hash(STRONG_PASSWORD, 10)
    const createdUser = await prisma.user.create({
      data: {
        name: "E2E Inactive Login",
        email: testEmail,
        passwordHash,
        role: "VIEWER",
        active: false,
        mustChangePassword: false,
      },
    })

    try {
      const ctx = await browser.newContext()
      const page = createLoggedPage(await ctx.newPage(), logger)
      try {
        await page.goto("/login", { waitUntil: "domcontentloaded" })
        await page.fill("#email", testEmail)
        await page.fill("#password", STRONG_PASSWORD)
        await page.getByRole("button", { name: /^sign in$/i }).click()

        // Should stay on login page or show an error
        await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
      } finally {
        await ctx.close()
      }
    } finally {
      await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => {})
    }
  })
})

// ---------------------------------------------------------------------------
// Suite: Delete User Safeguards
// ---------------------------------------------------------------------------

test.describe("Admin Delete User Safeguards", () => {
  test("cancel on delete confirmation preserves the user", async ({
    adminPage,
    prisma,
  }) => {
    const testEmail = `e2e-delete-cancel-${Date.now()}@hrtest.local`
    const passwordHash = await hash(STRONG_PASSWORD, 10)
    const createdUser = await prisma.user.create({
      data: {
        name: "E2E Delete Cancel",
        email: testEmail,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: false,
      },
    })

    try {
      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      // Open delete confirmation
      await userRow
        .getByRole("button", { name: /delete user/i })
        .click()

      await expect(adminPage.getByText("Delete user?")).toBeVisible()
      await expect(
        adminPage.getByText(/permanently delete/i),
      ).toBeVisible()

      // Cancel
      await adminPage.getByRole("button", { name: /^keep user$/i }).click()

      // Dialog dismissed; user still visible in table
      await expect(adminPage.getByText("Delete user?")).not.toBeVisible()
      await expect(userRow).toBeVisible()

      // DB: user still exists
      const dbUser = await prisma.user.findUnique({
        where: { id: createdUser.id },
      })
      expect(dbUser).not.toBeNull()
    } finally {
      await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => {})
    }
  })

  test("confirming delete removes the user from the list and DB", async ({
    adminPage,
    prisma,
  }) => {
    const testEmail = `e2e-delete-confirm-${Date.now()}@hrtest.local`
    const passwordHash = await hash(STRONG_PASSWORD, 10)
    const createdUser = await prisma.user.create({
      data: {
        name: "E2E Delete Confirm",
        email: testEmail,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: false,
      },
    })

    // If the test fails partway through, attempt cleanup
    let shouldCleanup = true
    try {
      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      // Open delete confirmation
      await userRow
        .getByRole("button", { name: /delete user/i })
        .click()

      await expect(adminPage.getByText("Delete user?")).toBeVisible()

      // Confirm delete
      await adminPage.getByRole("button", { name: /^delete$/i }).click()

      // Row is removed from the list
      await expect(userRow).toHaveCount(0, { timeout: 10_000 })

      // DB: user no longer exists
      const dbUser = await prisma.user.findUnique({
        where: { id: createdUser.id },
      })
      expect(dbUser).toBeNull()

      shouldCleanup = false
    } finally {
      if (shouldCleanup) {
        await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => {})
      }
    }
  })

  test("admin cannot see a delete button for their own account", async ({
    adminPage,
    prisma,
  }) => {
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })

    // The "(you)" suffix is rendered next to the current user's name
    const selfRow = adminPage.getByRole("row").filter({ hasText: "(you)" })
    await expect(selfRow).toBeVisible({ timeout: 10_000 })

    // No delete button for the self row
    await expect(
      selfRow.getByRole("button", { name: /delete user/i }),
    ).toHaveCount(0)
  })
})
