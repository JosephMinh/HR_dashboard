/**
 * E2E Tests: Temp-Password Lifecycle & Navigation
 *
 * Tests the full admin-provisioned user lifecycle:
 * 1. Admin creates user → temp password generated
 * 2. New user logs in with temp password → gated to /settings/password
 * 3. New user changes password → can access dashboard
 *
 * Also tests navigation visibility for different roles.
 */

import { test, expect } from "./fixtures"
import { getE2EPrisma } from "./utils/database"

const STRONG_PASSWORD = "NewSecureP@ss123"

test.describe("Temp-Password Full Lifecycle", () => {
  test("admin creates user, user logs in with temp password, changes it, and accesses dashboard", async ({
    adminPage,
    browser,
  }) => {
    // Step 1: Admin creates a user via the UI
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await expect(adminPage.getByText("User Management")).toBeVisible()

    // Click New User button
    await adminPage.getByRole("button", { name: /new user/i }).click()

    // Fill in the create user form
    await adminPage.fill("#create-name", "E2E Temp User")
    await adminPage.fill("#create-email", `e2e-temp-${Date.now()}@hrtest.local`)
    await adminPage.selectOption("#create-role", "VIEWER")

    // Submit
    await adminPage.getByRole("button", { name: /create user/i }).click()

    // Wait for temp password to appear
    const tempPasswordEl = adminPage.locator("code").first()
    await expect(tempPasswordEl).toBeVisible({ timeout: 10000 })
    const tempPassword = await tempPasswordEl.textContent()
    expect(tempPassword).toBeTruthy()
    expect(tempPassword!.length).toBeGreaterThanOrEqual(12)

    // Verify "shown only once" warning
    await expect(adminPage.getByText("shown only once")).toBeVisible()

    // Get the email from the user table
    const emailCell = adminPage.getByText(/e2e-temp-.*@hrtest\.local/)
    const userEmail = await emailCell.textContent()
    expect(userEmail).toBeTruthy()

    // Step 2: New user logs in with temp password
    const newUserContext = await browser.newContext()
    const newUserPage = await newUserContext.newPage()

    await newUserPage.goto("/login", { waitUntil: "domcontentloaded" })
    await newUserPage.waitForSelector("#email", { state: "visible" })

    await newUserPage.fill("#email", userEmail!)
    await newUserPage.fill("#password", tempPassword!)
    await newUserPage.click('button[type="submit"]')

    // Should be redirected to /settings/password (gated)
    await newUserPage.waitForURL(/\/settings\/password/, { timeout: 15000 })

    // Verify must-change banner is visible
    await expect(
      newUserPage.getByText("You must change your password")
    ).toBeVisible()

    // Step 3: Verify gating - try to navigate away
    await newUserPage.goto("/jobs", { waitUntil: "domcontentloaded" })
    // Should be redirected back to /settings/password
    await expect(newUserPage).toHaveURL(/\/settings\/password/)

    await newUserPage.goto("/", { waitUntil: "domcontentloaded" })
    await expect(newUserPage).toHaveURL(/\/settings\/password/)

    // Step 4: Change password
    await newUserPage.goto("/settings/password", { waitUntil: "domcontentloaded" })

    await newUserPage.fill("#currentPassword", tempPassword!)
    await newUserPage.fill("#newPassword", STRONG_PASSWORD)
    await newUserPage.fill("#confirmPassword", STRONG_PASSWORD)

    // Wait for all requirements to be met
    const submitButton = newUserPage.getByRole("button", { name: /change password/i })
    await expect(submitButton).toBeEnabled({ timeout: 5000 })

    await submitButton.click()

    // Should redirect to dashboard after password change
    await newUserPage.waitForURL("/", { timeout: 15000 })

    // Verify user can now access the dashboard
    await expect(newUserPage.getByText("Dashboard")).toBeVisible()

    // Verify user can navigate freely
    await newUserPage.goto("/jobs", { waitUntil: "domcontentloaded" })
    await expect(newUserPage).toHaveURL("/jobs")

    await newUserContext.close()
  })
})

test.describe("Navigation Visibility", () => {
  test("admin sees Users link in sidebar", async ({ adminPage }) => {
    await adminPage.goto("/", { waitUntil: "domcontentloaded" })

    // Admin should see the Admin > Users link
    await expect(adminPage.getByRole("link", { name: "Users" })).toBeVisible()
  })

  test("recruiter does NOT see Users link in sidebar", async ({ recruiterPage }) => {
    await recruiterPage.goto("/", { waitUntil: "domcontentloaded" })

    // Recruiter should NOT see Admin > Users link
    await expect(recruiterPage.getByRole("link", { name: "Users" })).not.toBeVisible()
  })

  test("viewer does NOT see Users link in sidebar", async ({ viewerPage }) => {
    await viewerPage.goto("/", { waitUntil: "domcontentloaded" })

    // Viewer should NOT see Admin > Users link
    await expect(viewerPage.getByRole("link", { name: "Users" })).not.toBeVisible()
  })

  test("all roles see Profile and Change Password in user menu", async ({
    adminPage,
    recruiterPage,
    viewerPage,
  }) => {
    for (const [role, page] of [
      ["ADMIN", adminPage],
      ["RECRUITER", recruiterPage],
      ["VIEWER", viewerPage],
    ] as const) {
      await page.goto("/", { waitUntil: "domcontentloaded" })

      // Open user menu
      await page.getByRole("button", { name: /open user menu/i }).click()

      // Should see Profile and Change Password menu items
      await expect(page.getByRole("menuitem", { name: /profile/i })).toBeVisible()
      await expect(page.getByRole("menuitem", { name: /change password/i })).toBeVisible()

      // Close the menu by pressing Escape
      await page.keyboard.press("Escape")
    }
  })
})

test.describe("Admin Users Page Access", () => {
  test("admin can access /admin/users", async ({ adminPage }) => {
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await expect(adminPage.getByText("User Management")).toBeVisible()
  })

  test("non-admin is blocked from /admin/users", async ({ viewerPage }) => {
    await viewerPage.goto("/admin/users", { waitUntil: "domcontentloaded" })

    // Should see access denied or be redirected
    await expect(
      viewerPage.getByText(/access denied|permission|forbidden/i)
    ).toBeVisible({ timeout: 10000 })
  })
})

test.describe("Settings Pages Smoke Tests", () => {
  test("/settings/profile loads with name and email", async ({ recruiterPage }) => {
    await recruiterPage.goto("/settings/profile", { waitUntil: "domcontentloaded" })

    // Should show the profile form
    await expect(recruiterPage.getByText("Profile Settings")).toBeVisible()
    await expect(recruiterPage.getByLabel("Name")).toBeVisible()
    await expect(recruiterPage.getByLabel("Email")).toBeVisible()

    // Email should be disabled (read-only)
    await expect(recruiterPage.getByLabel("Email")).toBeDisabled()
  })

  test("/settings/password shows policy hints", async ({ recruiterPage }) => {
    await recruiterPage.goto("/settings/password", { waitUntil: "domcontentloaded" })

    await expect(recruiterPage.getByText("Change Password")).toBeVisible()

    // Type into new password to trigger hints
    await recruiterPage.fill("#newPassword", "a")

    // Should show policy requirement hints
    await expect(recruiterPage.getByText(/at least 12 characters/i)).toBeVisible()
    await expect(recruiterPage.getByText(/uppercase/i)).toBeVisible()
    await expect(recruiterPage.getByText(/number/i)).toBeVisible()
    await expect(recruiterPage.getByText(/symbol/i)).toBeVisible()
  })

  test("/settings/password shows confirm mismatch", async ({ recruiterPage }) => {
    await recruiterPage.goto("/settings/password", { waitUntil: "domcontentloaded" })

    await recruiterPage.fill("#newPassword", STRONG_PASSWORD)
    await recruiterPage.fill("#confirmPassword", "DifferentPassword123!")

    await expect(recruiterPage.getByText("Passwords do not match")).toBeVisible()
  })
})

test.describe("Admin Users Table", () => {
  test("admin users page shows user table with search and filter", async ({ adminPage }) => {
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })

    // Should show table headers
    await expect(adminPage.getByText("Name", { exact: true }).first()).toBeVisible()
    await expect(adminPage.getByText("Email", { exact: true }).first()).toBeVisible()
    await expect(adminPage.getByText("Role", { exact: true }).first()).toBeVisible()

    // Should show search input
    await expect(adminPage.getByPlaceholder(/search/i)).toBeVisible()

    // Should show active/inactive filter
    const filterSelect = adminPage.locator("select")
    await expect(filterSelect).toBeVisible()
  })
})
