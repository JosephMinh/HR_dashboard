import type { APIRequestContext } from "@playwright/test"
import { hash } from "bcryptjs"

import { test, expect } from "./fixtures"
import { createLoggedPage } from "./utils/logger"

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

async function fetchInviteEmail(
  request: APIRequestContext,
  recipient: string,
): Promise<CapturedEmail> {
  const path = `${OUTBOX_PATH}?recipient=${encodeURIComponent(recipient)}`

  await expect
    .poll(
      async () => {
        const response = await request.get(path)
        if (!response.ok()) {
          return 0
        }

        const data = (await response.json()) as { emails: CapturedEmail[] }
        return data.emails.length
      },
      {
        message: `waiting for invite email for ${recipient}`,
        timeout: 10_000,
      },
    )
    .toBeGreaterThan(0)

  const response = await request.get(path)
  expect(response.ok()).toBeTruthy()

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

test.describe("Invite Email Onboarding Flow", () => {
  test("admin creates user, invite email drives setup, and login is ungated", async ({
    adminPage,
    browser,
    prisma,
    request,
    logger,
  }) => {
    const testEmail = `e2e-invite-${Date.now()}@hrtest.local`
    const testName = "E2E Invite User"

    await clearEmailOutbox(request)

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
    await expect(
      adminPage.getByText(/temporary password|shown only once/i),
    ).not.toBeVisible()

    const pendingRow = adminPage.getByRole("row").filter({ hasText: testEmail })
    await expect(pendingRow).toBeVisible({ timeout: 10_000 })
    await expect(pendingRow.getByText("Pending Setup")).toBeVisible()

    const inviteEmail = await fetchInviteEmail(request, testEmail)
    expect(inviteEmail.to).toBe(testEmail)
    expect(inviteEmail.subject).toBe("You're invited to HR Dashboard")

    const setupUrl = extractSetPasswordUrl(inviteEmail)
    const newUserContext = await browser.newContext()
    const newUserPage = createLoggedPage(await newUserContext.newPage(), logger)

    try {
      await newUserPage.goto(setupUrl, { waitUntil: "domcontentloaded" })
      await expect(newUserPage.getByText("Set Your Password")).toBeVisible({
        timeout: 10_000,
      })
      await expect(newUserPage.getByText("Create your password")).toBeVisible()

      await newUserPage.fill("#newPassword", STRONG_PASSWORD)
      await newUserPage.fill("#confirmPassword", STRONG_PASSWORD)
      await newUserPage.getByRole("button", { name: /^set password$/i }).click()

      await expect(
        newUserPage.getByText("Password Set Successfully"),
      ).toBeVisible({ timeout: 10_000 })
      await newUserPage.getByRole("link", { name: /^sign in$/i }).click()
      await newUserPage.waitForURL(/\/login/, { timeout: 10_000 })

      await newUserPage.fill("#email", testEmail)
      await newUserPage.fill("#password", STRONG_PASSWORD)
      await newUserPage.getByRole("button", { name: /^sign in$/i }).click()

      await newUserPage.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 15_000,
      })
      await expect(newUserPage).not.toHaveURL(/\/settings\/password/)

      await newUserPage.goto("/jobs", { waitUntil: "domcontentloaded" })
      await expect(newUserPage).toHaveURL(/\/jobs/)

      const updatedUser = await prisma.user.findUnique({
        where: { email: testEmail },
        select: { mustChangePassword: true },
      })
      expect(updatedUser?.mustChangePassword).toBe(false)

      await adminPage.reload({ waitUntil: "domcontentloaded" })
      const completedRow = adminPage.getByRole("row").filter({ hasText: testEmail })
      await expect(completedRow).toBeVisible({ timeout: 10_000 })
      await expect(completedRow.getByText("Pending Setup")).toHaveCount(0)
    } finally {
      await newUserContext.close()
      await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
    }
  })
})

test.describe("Resend Invite Flow", () => {
  test("admin can resend invite, old token is invalidated, and new token allows setup", async ({
    adminPage,
    browser,
    prisma,
    request,
    logger,
  }) => {
    const testEmail = `e2e-resend-${Date.now()}@hrtest.local`
    const testName = "E2E Resend Invite"

    await clearEmailOutbox(request)

    // Step 1: Create user via admin UI — first invite is sent
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

    // Capture the original invite URL before resending
    const originalEmail = await fetchInviteEmail(request, testEmail)
    const originalSetupUrl = extractSetPasswordUrl(originalEmail)

    // Clear outbox so we can detect the resent email cleanly
    await clearEmailOutbox(request)

    // Step 2: Find the user row and click "Resend Invite"
    const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
    await expect(userRow).toBeVisible({ timeout: 10_000 })
    await expect(userRow.getByText("Pending Setup")).toBeVisible()
    await expect(userRow.getByRole("button", { name: /resend invite/i })).toBeVisible()
    await userRow.getByRole("button", { name: /resend invite/i }).click()

    // Confirmation dialog appears
    const dialog = adminPage.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("Resend invite?")).toBeVisible()
    await expect(dialog.getByText(testName)).toBeVisible()

    // Confirm the resend
    await dialog.getByRole("button", { name: /^resend invite$/i }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })

    // Success banner appears
    await expect(
      adminPage.getByText("Onboarding invite resent successfully."),
    ).toBeVisible({ timeout: 10_000 })

    // Step 3: New invite email arrives
    const newEmail = await fetchInviteEmail(request, testEmail)
    const newSetupUrl = extractSetPasswordUrl(newEmail)
    expect(newSetupUrl).not.toBe(originalSetupUrl) // token changed

    // Step 4: Original setup URL now shows "Already Used" (token was invalidated)
    const ctx1 = await browser.newContext()
    const oldTokenPage = createLoggedPage(await ctx1.newPage(), logger)
    try {
      await oldTokenPage.goto(originalSetupUrl, { waitUntil: "domcontentloaded" })
      await expect(oldTokenPage.getByText("Already Used")).toBeVisible({ timeout: 10_000 })
    } finally {
      await ctx1.close()
    }

    // Step 5: New setup URL works — user can set password and log in
    const ctx2 = await browser.newContext()
    const newUserPage = createLoggedPage(await ctx2.newPage(), logger)
    try {
      await newUserPage.goto(newSetupUrl, { waitUntil: "domcontentloaded" })
      await expect(newUserPage.getByText("Set Your Password")).toBeVisible({ timeout: 10_000 })
      await newUserPage.fill("#newPassword", STRONG_PASSWORD)
      await newUserPage.fill("#confirmPassword", STRONG_PASSWORD)
      await newUserPage.getByRole("button", { name: /^set password$/i }).click()
      await expect(newUserPage.getByText("Password Set Successfully")).toBeVisible({ timeout: 10_000 })

      // DB: mustChangePassword is false after setup
      const user = await prisma.user.findUnique({
        where: { email: testEmail },
        select: { mustChangePassword: true },
      })
      expect(user?.mustChangePassword).toBe(false)
    } finally {
      await ctx2.close()
      await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
    }
  })
})

test.describe("Admin Reset Password Flow", () => {
  test("admin can reset a user's password, old password stops working, and reset link sets a new password", async ({
    adminPage,
    browser,
    prisma,
    request,
    logger,
  }) => {
    const testEmail = `e2e-reset-pw-${Date.now()}@hrtest.local`
    const originalPassword = STRONG_PASSWORD
    const newPassword = "UpdatedP@ss456!"
    const passwordHash = (await import("bcryptjs").then((m) => m.hash(originalPassword, 4)))

    // Seed a fully-onboarded user (no pending setup)
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

      // Find the user row
      const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
      await expect(userRow).toBeVisible({ timeout: 10_000 })

      // "Reset PW" button is visible for active non-pending-setup users
      await expect(userRow.getByRole("button", { name: /reset pw/i })).toBeVisible()
      await userRow.getByRole("button", { name: /reset pw/i }).click()

      // Confirmation dialog
      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText("Reset password?")).toBeVisible()
      await expect(dialog.getByText("E2E Reset PW User")).toBeVisible()

      await dialog.getByRole("button", { name: /^reset password$/i }).click()
      await expect(dialog).not.toBeVisible({ timeout: 10_000 })

      // Success banner
      await expect(
        adminPage.getByText("Password reset email sent successfully."),
      ).toBeVisible({ timeout: 10_000 })

      // DB: mustChangePassword is now true (password was blanked)
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
        select: { mustChangePassword: true },
      })
      expect(updatedUser?.mustChangePassword).toBe(true)

      // Reset email arrives in outbox
      const resetEmail = await fetchInviteEmail(request, testEmail)
      expect(resetEmail.to).toBe(testEmail)
      const resetUrl = extractSetPasswordUrl(resetEmail)
      expect(resetUrl).toContain("/set-password?token=")

      // Old password no longer works
      const ctx1 = await browser.newContext()
      const loginPage = createLoggedPage(await ctx1.newPage(), logger)
      try {
        await loginPage.goto("/login", { waitUntil: "domcontentloaded" })
        await loginPage.fill("#email", testEmail)
        await loginPage.fill("#password", originalPassword)
        await loginPage.click('button[type="submit"]')
        await expect(loginPage.getByText(/invalid email or password/i)).toBeVisible({ timeout: 10_000 })
      } finally {
        await ctx1.close()
      }

      // Reset link allows setting a new password
      const ctx2 = await browser.newContext()
      const resetPage = createLoggedPage(await ctx2.newPage(), logger)
      try {
        await resetPage.goto(resetUrl, { waitUntil: "domcontentloaded" })
        await expect(resetPage.getByText("Set Your Password")).toBeVisible({ timeout: 10_000 })
        await resetPage.fill("#newPassword", newPassword)
        await resetPage.fill("#confirmPassword", newPassword)
        await resetPage.getByRole("button", { name: /^set password$/i }).click()
        await expect(resetPage.getByText("Password Set Successfully")).toBeVisible({ timeout: 10_000 })

        // New password works for login
        await resetPage.getByRole("link", { name: /^sign in$/i }).click()
        await resetPage.waitForURL(/\/login/, { timeout: 10_000 })
        await resetPage.fill("#email", testEmail)
        await resetPage.fill("#password", newPassword)
        await resetPage.getByRole("button", { name: /^sign in$/i }).click()
        await resetPage.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 })
        await expect(resetPage).not.toHaveURL(/\/settings\/password/)
      } finally {
        await ctx2.close()
      }
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })
})

test.describe("Set-Password Error States", () => {
  test("shows error for missing token parameter", async ({ page }) => {
    await page.goto("/set-password", { waitUntil: "domcontentloaded" })

    await expect(page.getByText("Missing Token")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/no setup token/i)).toBeVisible()
  })

  test("shows error for invalid token", async ({ page }) => {
    await page.goto("/set-password?token=invalid-token-abc123", {
      waitUntil: "domcontentloaded",
    })

    await expect(page.getByText("Invalid Link")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/not valid/i)).toBeVisible()
  })

  test("shows error for already-used token", async ({
    adminPage,
    browser,
    prisma,
    request,
    logger,
  }) => {
    const testEmail = `e2e-used-token-${Date.now()}@hrtest.local`

    await clearEmailOutbox(request)

    // Create user via admin UI
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", "E2E Used Token")
    await adminPage.fill("#create-email", testEmail)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /^create user$/i }).click()

    // Capture setup URL from test outbox
    const inviteEmail = await fetchInviteEmail(request, testEmail)
    const setupUrl = extractSetPasswordUrl(inviteEmail)

    // First use: set the password successfully
    const ctx1 = await browser.newContext()
    const page1 = createLoggedPage(await ctx1.newPage(), logger)
    try {
      await page1.goto(setupUrl, { waitUntil: "domcontentloaded" })
      await expect(page1.getByText("Create your password")).toBeVisible({
        timeout: 10_000,
      })
      await page1.fill("#newPassword", STRONG_PASSWORD)
      await page1.fill("#confirmPassword", STRONG_PASSWORD)
      await page1.getByRole("button", { name: /^set password$/i }).click()
      await expect(page1.getByText("Password Set Successfully")).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await ctx1.close()
    }

    // Second use: same token should show "Already Used"
    const ctx2 = await browser.newContext()
    const page2 = createLoggedPage(await ctx2.newPage(), logger)
    try {
      await page2.goto(setupUrl, { waitUntil: "domcontentloaded" })
      await expect(page2.getByText("Already Used")).toBeVisible({
        timeout: 10_000,
      })
      await expect(page2.getByText(/already been used/i)).toBeVisible()
    } finally {
      await ctx2.close()
      await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
    }
  })

  test("shows error for expired token", async ({ prisma, page }) => {
    const testEmail = `e2e-expired-${Date.now()}@hrtest.local`
    const passwordHash = await hash("placeholder-never-used", 10)

    const user = await prisma.user.create({
      data: {
        name: "E2E Expired Token",
        email: testEmail,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: true,
      },
    })

    try {
      // Create an expired token directly (must use base64url to match TOKEN_PATTERN)
      const crypto = await import("node:crypto")
      const rawToken = crypto.randomBytes(32).toString("base64url")
      const secret =
        process.env.AUTH_SECRET ||
        "test-secret-key-for-testing-only-do-not-use-in-production"
      const tokenHash = crypto
        .createHmac("sha256", secret)
        .update(rawToken)
        .digest("hex")

      await prisma.setPasswordToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired 1 hour ago
        },
      })

      await page.goto(`/set-password?token=${rawToken}`, {
        waitUntil: "domcontentloaded",
      })
      await expect(page.getByText("Link Expired")).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(/expired/i)).toBeVisible()
    } finally {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
    }
  })
})
