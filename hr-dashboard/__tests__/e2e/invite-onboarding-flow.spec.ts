/**
 * E2E Tests: Invite Email Onboarding Flow
 *
 * Tests the full invite-based onboarding lifecycle:
 * 1. Admin creates a new user → invite status banner shown (no temp password)
 * 2. Setup URL extracted from admin UI banner
 * 3. New user opens /set-password → sets password → logs in
 * 4. Verifies mustChangePassword is cleared
 * 5. Verifies invalid/expired/used token error surfaces
 *
 * Bead: hr-y396.4
 */

import { hash } from "bcryptjs"
import { test, expect } from "./fixtures"

const STRONG_PASSWORD = "NewSecureP@ss123!"

test.describe("Invite Email Onboarding Flow", () => {
  test("full flow: admin creates user → captures setup URL → set password → login", async ({
    adminPage,
    browser,
    prisma,
  }) => {
    const testEmail = `e2e-invite-${Date.now()}@hrtest.local`

    // Step 1: Admin creates a user
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await expect(adminPage.getByText("User Management")).toBeVisible()

    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", "E2E Invite User")
    await adminPage.fill("#create-email", testEmail)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /create user/i }).click()

    // Step 2: Verify invite status banner — no temp password
    // The banner should appear with an email-sent confirmation
    const banner = adminPage.locator('[class*="rounded-md"][class*="border"]').filter({
      hasText: /invite|created/i,
    })
    await expect(banner).toBeVisible({ timeout: 10000 })

    // Verify NO temp password is shown (no "shown only once" text)
    await expect(adminPage.getByText("shown only once")).not.toBeVisible()

    // Step 3: Capture the setup URL from the banner's code element
    const setupUrlEl = banner.locator("code")
    await expect(setupUrlEl).toBeVisible({ timeout: 5000 })
    const setupUrl = await setupUrlEl.textContent()
    expect(setupUrl).toBeTruthy()
    expect(setupUrl).toContain("/set-password?token=")

    // Extract just the path portion for navigation
    const urlObj = new URL(setupUrl!, "http://localhost")
    const setPasswordPath = urlObj.pathname + urlObj.search

    // Step 4: Verify the user exists with mustChangePassword=true
    const createdUser = await prisma.user.findUnique({
      where: { email: testEmail },
      select: { id: true, mustChangePassword: true, active: true },
    })
    expect(createdUser).not.toBeNull()
    expect(createdUser!.mustChangePassword).toBe(true)
    expect(createdUser!.active).toBe(true)

    // Step 5: New user opens set-password page
    const newUserContext = await browser.newContext()
    const newUserPage = await newUserContext.newPage()

    await newUserPage.goto(setPasswordPath, { waitUntil: "domcontentloaded" })

    // Should see "Set Your Password" branding
    await expect(newUserPage.getByText("Set Your Password")).toBeVisible({ timeout: 10000 })

    // Should see "Create your password" form
    await expect(newUserPage.getByText("Create your password")).toBeVisible()

    // Step 6: Fill in and submit password
    await newUserPage.fill("#newPassword", STRONG_PASSWORD)
    await newUserPage.fill("#confirmPassword", STRONG_PASSWORD)

    const submitButton = newUserPage.getByRole("button", { name: /set password/i })
    await expect(submitButton).toBeEnabled({ timeout: 5000 })
    await submitButton.click()

    // Should see success confirmation
    await expect(newUserPage.getByText("Password Set Successfully")).toBeVisible({ timeout: 10000 })
    await expect(newUserPage.getByText("Sign in")).toBeVisible()

    // Step 7: Navigate to login and sign in
    await newUserPage.click("text=Sign in")
    await newUserPage.waitForURL(/\/login/, { timeout: 10000 })

    await newUserPage.fill("#email", testEmail)
    await newUserPage.fill("#password", STRONG_PASSWORD)
    await newUserPage.click('button[type="submit"]')

    // Should redirect to dashboard (not gated to password change)
    await newUserPage.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 })

    // Step 8: Verify mustChangePassword is cleared in DB
    const updatedUser = await prisma.user.findUnique({
      where: { email: testEmail },
      select: { mustChangePassword: true },
    })
    expect(updatedUser!.mustChangePassword).toBe(false)

    await newUserContext.close()

    // Cleanup
    await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
  })

  test("admin sees Pending Setup badge for new user", async ({ adminPage, prisma }) => {
    const testEmail = `e2e-pending-${Date.now()}@hrtest.local`

    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", "E2E Pending User")
    await adminPage.fill("#create-email", testEmail)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /create user/i }).click()

    // Wait for the banner to appear (user created)
    await expect(adminPage.locator("code").first()).toBeVisible({ timeout: 10000 })

    // Dismiss the banner
    await adminPage.locator('button[aria-label="Dismiss"]').click()

    // The new user row should show "Pending Setup" badge
    const userRow = adminPage.getByRole("row").filter({ hasText: testEmail })
    await expect(userRow.getByText("Pending Setup")).toBeVisible()

    // Cleanup
    await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
  })
})

test.describe("Set-Password Error States", () => {
  test("shows error for missing token parameter", async ({ page }) => {
    await page.goto("/set-password", { waitUntil: "domcontentloaded" })

    await expect(page.getByText("Missing Token")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/no setup token/i)).toBeVisible()
  })

  test("shows error for invalid token", async ({ page }) => {
    await page.goto("/set-password?token=invalid-token-abc123", { waitUntil: "domcontentloaded" })

    await expect(page.getByText("Invalid Link")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/not valid/i)).toBeVisible()
  })

  test("shows error for already-used token", async ({ adminPage, browser, prisma }) => {
    const testEmail = `e2e-used-token-${Date.now()}@hrtest.local`

    // Create user via admin UI
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", "E2E Used Token")
    await adminPage.fill("#create-email", testEmail)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /create user/i }).click()

    // Capture setup URL
    const banner = adminPage.locator('[class*="rounded-md"][class*="border"]').filter({
      hasText: /invite|created/i,
    })
    const setupUrlEl = banner.locator("code")
    await expect(setupUrlEl).toBeVisible({ timeout: 10000 })
    const setupUrl = await setupUrlEl.textContent()
    const urlObj = new URL(setupUrl!, "http://localhost")
    const setPasswordPath = urlObj.pathname + urlObj.search

    // First use: set the password successfully
    const ctx1 = await browser.newContext()
    const page1 = await ctx1.newPage()
    await page1.goto(setPasswordPath, { waitUntil: "domcontentloaded" })
    await expect(page1.getByText("Create your password")).toBeVisible({ timeout: 10000 })
    await page1.fill("#newPassword", STRONG_PASSWORD)
    await page1.fill("#confirmPassword", STRONG_PASSWORD)
    await page1.getByRole("button", { name: /set password/i }).click()
    await expect(page1.getByText("Password Set Successfully")).toBeVisible({ timeout: 10000 })
    await ctx1.close()

    // Second use: same token should show "Already Used"
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await page2.goto(setPasswordPath, { waitUntil: "domcontentloaded" })
    await expect(page2.getByText("Already Used")).toBeVisible({ timeout: 10000 })
    await expect(page2.getByText(/already been used/i)).toBeVisible()
    await ctx2.close()

    // Cleanup
    await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
  })

  test("shows error for expired token", async ({ prisma, page }) => {
    // Create a user with an expired token directly in the DB
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

    // Create an expired token directly (must use base64url to match TOKEN_PATTERN)
    const crypto = await import("node:crypto")
    const rawToken = crypto.randomBytes(32).toString("base64url")
    const secret = process.env.AUTH_SECRET || "test-secret-key-for-testing-only-do-not-use-in-production"
    const tokenHash = crypto.createHmac("sha256", secret)
      .update(rawToken)
      .digest("hex")

    await prisma.setPasswordToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired 1 hour ago
      },
    })

    await page.goto(`/set-password?token=${rawToken}`, { waitUntil: "domcontentloaded" })
    await expect(page.getByText("Link Expired")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/expired/i)).toBeVisible()

    // Cleanup
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
  })
})
