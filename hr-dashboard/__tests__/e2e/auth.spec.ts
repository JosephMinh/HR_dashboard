/**
 * E2E Tests: Authentication Flows
 *
 * Tests login, logout, session management, and role-based access.
 */

import { test, expect } from "./fixtures"
import { TEST_USERS } from "./utils/auth"

test.describe("Login Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Start from login page
    await page.goto("/login")
    await page.waitForLoadState("networkidle")
  })

  test("successful login redirects to dashboard", async ({ page }) => {
    const user = TEST_USERS.RECRUITER

    // Fill in credentials
    await page.fill("#email", user.email)
    await page.fill("#password", user.password)

    // Submit form
    await page.click('button[type="submit"]')

    // Should redirect to dashboard
    await page.waitForURL("/", { timeout: 10000 })

    // Should see user info in top bar
    await expect(page.getByText(user.name)).toBeVisible()
    await expect(page.getByText(user.role)).toBeVisible()
  })

  test("invalid email shows error", async ({ page }) => {
    await page.fill("#email", "nonexistent@example.com")
    await page.fill("#password", "password123")
    await page.click('button[type="submit"]')

    // Should show error message
    await expect(page.getByText("Invalid email or password")).toBeVisible()

    // Should stay on login page
    expect(page.url()).toContain("/login")
  })

  test("invalid password shows error", async ({ page }) => {
    const user = TEST_USERS.RECRUITER

    await page.fill("#email", user.email)
    await page.fill("#password", "wrongpassword")
    await page.click('button[type="submit"]')

    // Should show error message
    await expect(page.getByText("Invalid email or password")).toBeVisible()

    // Should stay on login page
    expect(page.url()).toContain("/login")
  })

  test("empty fields prevent submission", async ({ page }) => {
    // Try to submit empty form
    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    // Form should have validation, still on login page
    expect(page.url()).toContain("/login")

    // Email field should be required
    const emailInput = page.locator("#email")
    await expect(emailInput).toHaveAttribute("required", "")
  })

  test("loading state shows during login", async ({ page }) => {
    const user = TEST_USERS.RECRUITER

    await page.fill("#email", user.email)
    await page.fill("#password", user.password)

    // Start login
    const submitPromise = page.click('button[type="submit"]')

    // Check for loading state (button should show "Signing in...")
    await expect(page.getByText("Signing in...")).toBeVisible()

    // Wait for login to complete
    await submitPromise
    await page.waitForURL("/", { timeout: 10000 })
  })

  test("redirect to callbackUrl after login", async ({ page }) => {
    const user = TEST_USERS.RECRUITER

    // Go to login with callback
    await page.goto("/login?callbackUrl=/jobs")
    await page.waitForLoadState("networkidle")

    // Login
    await page.fill("#email", user.email)
    await page.fill("#password", user.password)
    await page.click('button[type="submit"]')

    // Should redirect to /jobs
    await page.waitForURL("/jobs", { timeout: 10000 })
  })
})

test.describe("Session Management", () => {
  test("session persists after page refresh", async ({ recruiterPage: page }) => {
    // Go to dashboard
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Verify logged in
    await expect(page.getByText(TEST_USERS.RECRUITER.name)).toBeVisible()

    // Refresh the page
    await page.reload()
    await page.waitForLoadState("networkidle")

    // Should still be logged in
    await expect(page.getByText(TEST_USERS.RECRUITER.name)).toBeVisible()
  })

  test("protected routes redirect to login when not authenticated", async ({ page }) => {
    // Try to access protected routes without authentication
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/)
  })

  test("accessing /jobs without auth redirects to login", async ({ page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")
    await expect(page).toHaveURL(/\/login/)
  })

  test("accessing /candidates without auth redirects to login", async ({ page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe("Logout Flow", () => {
  test("logout clears session and redirects to login", async ({ recruiterPage: page }) => {
    // Go to dashboard
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Verify logged in
    await expect(page.getByText(TEST_USERS.RECRUITER.name)).toBeVisible()

    // Open user menu
    await page.click('[class*="DropdownMenuTrigger"]')

    // Click logout
    await page.click('text=Logout')

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 })

    // Try to access protected route
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Should be redirected to login again
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe("Role-based Access", () => {
  test("ADMIN sees full navigation", async ({ adminPage: page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Should see Dashboard, Jobs, Candidates links
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Jobs" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Candidates" })).toBeVisible()

    // Should see ADMIN badge
    await expect(page.getByText("ADMIN")).toBeVisible()
  })

  test("RECRUITER can access job creation", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Should see RECRUITER badge
    await expect(page.getByText("RECRUITER")).toBeVisible()

    // Should see create button (recruiters can create)
    await expect(page.getByRole("link", { name: /new job/i }).or(
      page.getByRole("button", { name: /create/i })
    )).toBeVisible()
  })

  test("RECRUITER can access candidate creation", async ({ recruiterPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    // Should see create button
    await expect(page.getByRole("link", { name: /new candidate/i }).or(
      page.getByRole("button", { name: /create/i })
    )).toBeVisible()
  })

  test("VIEWER cannot see create buttons", async ({ viewerPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Should see VIEWER badge
    await expect(page.getByText("VIEWER")).toBeVisible()

    // Should NOT see create button
    await expect(page.getByRole("link", { name: /new job/i })).not.toBeVisible()
    await expect(page.getByRole("button", { name: /create/i })).not.toBeVisible()
  })

  test("VIEWER cannot create jobs via direct URL", async ({ viewerPage: page }) => {
    // Try to access create job page directly
    await page.goto("/jobs/new")
    await page.waitForLoadState("networkidle")

    // Should be redirected or see error (depending on implementation)
    // Could redirect to /jobs or show an error
    const url = page.url()
    const hasError = await page.getByText(/unauthorized|forbidden|not allowed/i).isVisible().catch(() => false)

    expect(url.includes("/jobs/new") && !hasError).toBeFalsy()
  })
})

test.describe("Navigation", () => {
  test("can navigate between pages when authenticated", async ({ recruiterPage: page }) => {
    // Start at dashboard
    await page.goto("/")
    await page.waitForLoadState("networkidle")

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
