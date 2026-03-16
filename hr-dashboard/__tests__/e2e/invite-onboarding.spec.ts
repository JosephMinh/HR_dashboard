/**
 * E2E Tests: Invite Email Onboarding Flow
 *
 * Tests the full invite-based onboarding lifecycle:
 * 1. Admin creates a new user from /admin/users
 * 2. Admin sees email-delivery confirmation (no temp password)
 * 3. Invite setup URL is captured from the API response
 * 4. Invited user opens /set-password?token=..., sets a password, logs in
 * 5. Verify mustChangePassword is cleared after password setup
 * 6. Verify invalid/expired token states render correct error pages
 *
 * Bead: hr-y396.4
 */

import { test, expect } from "./fixtures"

const STRONG_PASSWORD = "E2E-Onboard!ng42"

test.describe("Invite Onboarding Flow", () => {
  test("admin creates user, captures invite link, user sets password and logs in", async ({
    adminPage,
    browser,
    prisma,
  }) => {
    const uniqueEmail = `e2e-invite-${Date.now()}@hrtest.local`
    const userName = "E2E Invite User"

    // ── Step 1: Admin creates a new user via the UI ──
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await expect(adminPage.getByText("User Management")).toBeVisible()

    // Intercept the POST /api/users response to capture the invite URL
    const responsePromise = adminPage.waitForResponse(
      (res) =>
        res.url().includes("/api/users") &&
        res.request().method() === "POST" &&
        !res.url().includes("/resend-invite")
    )

    // Click New User and fill the form
    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", userName)
    await adminPage.fill("#create-email", uniqueEmail)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /create user/i }).click()

    // Capture the API response
    const response = await responsePromise
    expect(response.status()).toBe(201)
    const responseBody = await response.json()

    // ── Step 2: Verify invite status — no temp password shown ──
    expect(responseBody.invite).toBeDefined()
    expect(responseBody.invite.status).toBe("sent")
    expect(responseBody.invite.setupUrl).toBeTruthy()
    const setupUrl: string = responseBody.invite.setupUrl

    // Verify the UI shows email-sent confirmation (not a temp password)
    await expect(
      adminPage.getByText(/invite.*sent|onboarding.*email/i)
    ).toBeVisible({ timeout: 10000 })

    // If a <code> element is visible, it should contain the setup URL, not a temp password
    const codeEl = adminPage.locator("code").first()
    const codeVisible = await codeEl.isVisible().catch(() => false)
    if (codeVisible) {
      const codeText = await codeEl.textContent()
      expect(codeText).toContain("/set-password")
    }

    // Verify the new user appears in the table
    await expect(adminPage.getByText(uniqueEmail)).toBeVisible({ timeout: 10000 })

    // ── Step 3: Invited user opens the set-password page ──
    const newUserContext = await browser.newContext()
    const newUserPage = await newUserContext.newPage()

    try {
      // Extract the path from the full URL for navigation
      const parsedUrl = new URL(setupUrl)
      await newUserPage.goto(parsedUrl.pathname + parsedUrl.search, {
        waitUntil: "domcontentloaded",
      })

      // Should show the password form (token is valid)
      await expect(
        newUserPage.getByText("Create your password")
      ).toBeVisible({ timeout: 15000 })

      // Verify masked email is shown
      await expect(newUserPage.getByText(/Setting password for/)).toBeVisible()

      // ── Step 4: Set a valid password ──
      await newUserPage.fill("#newPassword", STRONG_PASSWORD)
      await newUserPage.fill("#confirmPassword", STRONG_PASSWORD)

      // Wait for the submit button to be enabled (all policy requirements met)
      const submitButton = newUserPage.getByRole("button", {
        name: /set password/i,
      })
      await expect(submitButton).toBeEnabled({ timeout: 5000 })
      await submitButton.click()

      // Should show success message
      await expect(
        newUserPage.getByText("Password Set Successfully")
      ).toBeVisible({ timeout: 15000 })

      // ── Step 5: Navigate to login and sign in ──
      await newUserPage.getByRole("link", { name: /sign in/i }).click()
      await newUserPage.waitForURL(/\/login/, { timeout: 10000 })

      await newUserPage.fill(
        'input[name="email"], input[type="email"]',
        uniqueEmail
      )
      await newUserPage.fill(
        'input[name="password"], input[type="password"]',
        STRONG_PASSWORD
      )
      await newUserPage.click('button[type="submit"]')

      // Should redirect away from login (mustChangePassword is cleared via token flow)
      await newUserPage.waitForURL(
        (url) => !url.pathname.includes("/login"),
        { timeout: 15000 }
      )

      // Verify user can access the dashboard
      await expect(newUserPage.getByText("Dashboard")).toBeVisible({
        timeout: 10000,
      })

      // ── Step 6: Verify mustChangePassword is cleared — user can navigate freely ──
      await newUserPage.goto("/jobs", { waitUntil: "domcontentloaded" })
      await expect(newUserPage).toHaveURL(/\/jobs/)

      // Not gated to /settings/password
      await newUserPage.goto("/", { waitUntil: "domcontentloaded" })
      await expect(newUserPage).not.toHaveURL(/\/settings\/password/)
    } finally {
      await newUserContext.close()

      // Cleanup: remove the test user
      await prisma.user
        .delete({ where: { email: uniqueEmail } })
        .catch(() => {})
    }
  })
})

test.describe("Set-Password Token Error States", () => {
  test("shows Missing Token when no token parameter is provided", async ({
    page,
  }) => {
    await page.goto("/set-password", { waitUntil: "domcontentloaded" })

    await expect(page.getByText("Missing Token")).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText(/no setup token was provided/i)).toBeVisible()
  })

  test("shows Invalid Link for a bogus token", async ({ page }) => {
    // Use a token that looks plausible (>32 chars, alphanumeric) but doesn't exist
    const bogusToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA123"
    await page.goto(`/set-password?token=${bogusToken}`, {
      waitUntil: "domcontentloaded",
    })

    await expect(page.getByText("Invalid Link")).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByText(/not valid/i)).toBeVisible()
  })

  test("shows Link Expired for an expired token", async ({
    adminPage,
    page,
    prisma,
  }) => {
    // Create a real user + token via the admin API, then expire the token in the DB
    const email = `e2e-expired-${Date.now()}@hrtest.local`

    const responsePromise = adminPage.waitForResponse(
      (res) =>
        res.url().includes("/api/users") &&
        res.request().method() === "POST" &&
        !res.url().includes("/resend-invite")
    )

    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", "E2E Expired Token")
    await adminPage.fill("#create-email", email)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /create user/i }).click()

    const response = await responsePromise
    const body = await response.json()
    const setupUrl: string = body.invite.setupUrl

    // Find the token record and expire it
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    await prisma.setPasswordToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })

    try {
      const parsedUrl = new URL(setupUrl)
      await page.goto(parsedUrl.pathname + parsedUrl.search, {
        waitUntil: "domcontentloaded",
      })

      await expect(page.getByText("Link Expired")).toBeVisible({
        timeout: 10000,
      })
      await expect(page.getByText(/expired/i)).toBeVisible()
    } finally {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
    }
  })

  test("shows Already Used for a consumed token", async ({
    adminPage,
    page,
    prisma,
  }) => {
    // Create a real user + token via the admin API, then mark the token as used
    const email = `e2e-used-${Date.now()}@hrtest.local`

    const responsePromise = adminPage.waitForResponse(
      (res) =>
        res.url().includes("/api/users") &&
        res.request().method() === "POST" &&
        !res.url().includes("/resend-invite")
    )

    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", "E2E Used Token")
    await adminPage.fill("#create-email", email)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /create user/i }).click()

    const response = await responsePromise
    const body = await response.json()
    const setupUrl: string = body.invite.setupUrl

    // Find the token record and mark it as used
    const user = await prisma.user.findUniqueOrThrow({ where: { email } })
    await prisma.setPasswordToken.updateMany({
      where: { userId: user.id },
      data: { usedAt: new Date() },
    })

    try {
      const parsedUrl = new URL(setupUrl)
      await page.goto(parsedUrl.pathname + parsedUrl.search, {
        waitUntil: "domcontentloaded",
      })

      await expect(page.getByText("Already Used")).toBeVisible({
        timeout: 10000,
      })
      await expect(page.getByText(/already been used/i)).toBeVisible()

      // Should offer a link to login
      await expect(
        page.getByRole("link", { name: /login/i })
      ).toBeVisible()
    } finally {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
    }
  })
})
