/**
 * E2E Tests: Authentication Flows
 *
 * Tests login, logout, session management, and role-based access.
 */

import type { Page } from "@playwright/test"
import { test, expect } from "./fixtures"
import { TEST_USERS } from "./utils/auth"

async function goto(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" })
}

async function gotoLogin(page: Page, path = "/login"): Promise<void> {
  await goto(page, path)
  await page.waitForSelector("#email", { state: "visible" })
}

async function prepareLogin(page: Page, email: string, password: string): Promise<void> {
  await page.waitForLoadState("networkidle")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.waitForFunction(
    ([expectedEmail, expectedPassword]) => {
      const emailField = document.querySelector<HTMLInputElement>("#email")
      const passwordField = document.querySelector<HTMLInputElement>("#password")
      return emailField?.value === expectedEmail && passwordField?.value === expectedPassword
    },
    [email, password],
  )
}

test.describe("Login Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Start from login page
    await gotoLogin(page)
  })

  test("successful login redirects to dashboard", async ({ page }) => {
    const user = TEST_USERS.RECRUITER

    await prepareLogin(page, user.email, user.password)

    // Submit form
    await page.getByRole("button", { name: /^sign in$/i }).click()

    // Should redirect to dashboard
    await page.waitForURL("/", { timeout: 10000 })

    // Should see user info in top bar
    const userMenuTrigger = page.getByRole("button", { name: /open user menu/i })
    await expect(userMenuTrigger).toContainText(user.name)
    await expect(userMenuTrigger).toContainText(user.role)
  })

  test("invalid email shows error", async ({ page }) => {
    await prepareLogin(page, "nonexistent@example.com", "password123")
    await page.getByRole("button", { name: /^sign in$/i }).click()

    // Should show error message
    await expect(page.getByText("Invalid email or password")).toBeVisible()

    // Should stay on login page
    expect(page.url()).toContain("/login")
  })

  test("invalid password shows error", async ({ page }) => {
    const user = TEST_USERS.RECRUITER

    await prepareLogin(page, user.email, "wrongpassword")
    await page.getByRole("button", { name: /^sign in$/i }).click()

    // Should show error message
    await expect(page.getByText("Invalid email or password")).toBeVisible()

    // Should stay on login page
    expect(page.url()).toContain("/login")
  })

  test("empty fields prevent submission", async ({ page }) => {
    // Try to submit empty form
    await page.waitForLoadState("networkidle")
    const submitButton = page.getByRole("button", { name: /^sign in$/i })
    await submitButton.click()

    // Form should have validation, still on login page
    expect(page.url()).toContain("/login")

    // Email field should be required
    const emailInput = page.locator("#email")
    await expect(emailInput).toHaveAttribute("required", "")
  })

  test("loading state shows during login", async ({ page }) => {
    const user = TEST_USERS.RECRUITER

    await prepareLogin(page, user.email, user.password)

    // Start login
    const submitPromise = page.getByRole("button", { name: /^sign in$/i }).click()

    // Check for loading state (button should show "Signing in...")
    await expect(page.getByText("Signing in...")).toBeVisible()

    // Wait for login to complete
    await submitPromise
    await page.waitForURL("/", { timeout: 10000 })
  })

  test("redirect to callbackUrl after login", async ({ page }) => {
    const user = TEST_USERS.RECRUITER

    // Go to login with callback
    await gotoLogin(page, "/login?callbackUrl=/jobs")

    // Login
    await prepareLogin(page, user.email, user.password)
    await page.getByRole("button", { name: /^sign in$/i }).click()

    // Should redirect to /jobs
    await page.waitForURL("/jobs", { timeout: 10000 })
  })
})

test.describe("Session Management", () => {
  test("session persists after page refresh", async ({ page, loginAs }) => {
    await loginAs(page, "RECRUITER")
    await goto(page, "/")

    // Verify logged in
    await expect(page.getByText(TEST_USERS.RECRUITER.name)).toBeVisible()

    // Refresh the page
    await page.reload()
    await page.waitForLoadState("domcontentloaded")

    // Should still be logged in
    await expect(page.getByText(TEST_USERS.RECRUITER.name)).toBeVisible()
  })

  test("protected routes redirect to login when not authenticated", async ({ page }) => {
    // Try to access protected routes without authentication
    await goto(page, "/")

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/)
  })

  test("accessing /jobs without auth redirects to login", async ({ page }) => {
    await goto(page, "/jobs")
    await expect(page).toHaveURL(/\/login/)
  })

  test("accessing /candidates without auth redirects to login", async ({ page }) => {
    await goto(page, "/candidates")
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe("Logout Flow", () => {
  test("logout clears session and redirects to login", async ({ page, loginAs }) => {
    await loginAs(page, "RECRUITER")
    await goto(page, "/")

    // Verify logged in
    await expect(page.getByText(TEST_USERS.RECRUITER.name)).toBeVisible()

    // Open user menu
    await page.getByRole("button", { name: /open user menu/i }).click()

    // Click logout
    await page.getByRole("menuitem", { name: /logout/i }).click()

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 })

    // Try to access protected route
    await goto(page, "/")

    // Should be redirected to login again
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe("Role-based Access", () => {
  test("ADMIN sees full navigation", async ({ page, loginAs }) => {
    await loginAs(page, "ADMIN")
    await goto(page, "/")

    // Should see Dashboard, Jobs, Candidates links
    await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Jobs", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Candidates", exact: true })).toBeVisible()

    // Should see ADMIN badge
    await expect(page.getByRole("button", { name: /open user menu/i })).toContainText("ADMIN")
  })

  test("RECRUITER can access job creation", async ({ page, loginAs }) => {
    await loginAs(page, "RECRUITER")
    await goto(page, "/jobs")

    // Should see RECRUITER badge
    await expect(page.getByRole("button", { name: /open user menu/i })).toContainText("RECRUITER")

    // Should see create button (recruiters can create)
    await expect(page.getByRole("link", { name: /new job/i }).or(
      page.getByRole("button", { name: /create/i })
    )).toBeVisible()
  })

  test("RECRUITER can access candidate creation", async ({ page, loginAs }) => {
    await loginAs(page, "RECRUITER")
    await goto(page, "/candidates")

    // Should see create button
    await expect(page.getByRole("link", { name: /new candidate/i }).or(
      page.getByRole("button", { name: /create/i })
    )).toBeVisible()
  })

  test("VIEWER cannot see create buttons", async ({ page, loginAs }) => {
    await loginAs(page, "VIEWER")
    await goto(page, "/jobs")

    // Should see VIEWER badge
    await expect(page.getByRole("button", { name: /open user menu/i })).toContainText("VIEWER")

    // Should NOT see create button
    await expect(page.getByRole("link", { name: /new job/i })).not.toBeVisible()
    await expect(page.getByRole("button", { name: /create/i })).not.toBeVisible()
  })

  test("VIEWER cannot create jobs via direct URL", async ({ page, loginAs }) => {
    await loginAs(page, "VIEWER")
    // Try to access create job page directly
    await goto(page, "/jobs/new")

    // Should not remain on the create page.
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 10000 })
      .not.toBe("/jobs/new")
  })
})

test.describe("Navigation", () => {
  test("can navigate between pages when authenticated", async ({ page, loginAs }) => {
    await loginAs(page, "RECRUITER")
    // Start at dashboard
    await goto(page, "/")

    // Navigate to Jobs
    await page.click('a[href="/jobs"]')
    await expect(page).toHaveURL("/jobs")

    // Navigate to Candidates
    await page.click('a[href="/candidates"]')
    await expect(page).toHaveURL("/candidates")

    // Navigate back to Dashboard
    await page.click('a[href="/"]')
    await expect(page).toHaveURL("/")
  })
})
