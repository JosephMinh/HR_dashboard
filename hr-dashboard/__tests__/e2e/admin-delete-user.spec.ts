/**
 * E2E Tests: Admin Delete User
 *
 * Tests the delete user flow on the admin users page:
 * - Confirmation dialog appears with user details
 * - Successful deletion refreshes the user list
 * - Delete button is hidden for the current admin user
 */

import { test, expect } from "./fixtures"
import { hash } from "bcryptjs"
import { getTestPassword, performLogin } from "./utils/auth"

const USERS_URL = "/admin/users"

test.describe("Admin Delete User", () => {
  test("delete button is not shown for the current admin user", async ({
    adminPage,
  }) => {
    await adminPage.goto(USERS_URL, { waitUntil: "domcontentloaded" })

    // Wait for the user table to load
    await adminPage.waitForSelector("table tbody tr", { state: "visible" })

    // Find the row with "(you)" marker — that's the current admin
    const selfRow = adminPage.locator("tr", { hasText: "(you)" })
    await expect(selfRow).toBeVisible()

    // There should be no delete button in the self-row
    const deleteBtn = selfRow.locator('button[aria-label^="Delete user"]')
    await expect(deleteBtn).toHaveCount(0)
  })

  test("can delete a user via confirmation dialog", async ({
    adminPage,
    prisma,
  }) => {
    // Create a disposable test user directly in the DB
    const passwordHash = await hash(getTestPassword(), 10)
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Delete Target",
        email: `e2e-delete-${Date.now()}@hrtest.local`,
        passwordHash,
        role: "VIEWER",
        active: true,
      },
    })

    try {
      await adminPage.goto(USERS_URL, { waitUntil: "domcontentloaded" })

      // Wait for the user table to load
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })

      // Find the row for the test user
      const userRow = adminPage.locator("tr", {
        hasText: "E2E Delete Target",
      })
      await expect(userRow).toBeVisible()

      // Click the delete button for this user
      const deleteBtn = userRow.locator(
        'button[aria-label="Delete user E2E Delete Target"]'
      )
      await expect(deleteBtn).toBeVisible()
      await deleteBtn.click()

      // Confirmation dialog should appear with the user's details
      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      // Verify dialog title and message mention the user
      await expect(dialog.getByText("Delete user?")).toBeVisible()
      await expect(
        dialog.getByText(/E2E Delete Target/)
      ).toBeVisible()
      await expect(dialog.getByText(testUser.email)).toBeVisible()

      // Verify both action buttons are present
      await expect(
        dialog.getByRole("button", { name: "Delete" })
      ).toBeVisible()
      await expect(
        dialog.getByRole("button", { name: "Keep user" })
      ).toBeVisible()

      // Click the Delete confirm button
      await dialog.getByRole("button", { name: "Delete" }).click()

      // Dialog should close
      await expect(dialog).not.toBeVisible({ timeout: 10000 })

      // The user should no longer appear in the list
      await expect(userRow).not.toBeVisible({ timeout: 10000 })

      const deletedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      })
      expect(deletedUser).toBeNull()
    } finally {
      // Cleanup: ensure user is removed even if test fails mid-way
      await prisma.user
        .delete({ where: { id: testUser.id } })
        .catch(() => {})
    }
  })

  test("deleting a user revokes their existing session and blocks future login", async ({
    adminPage,
    browser,
    prisma,
  }) => {
    const password = getTestPassword()
    const passwordHash = await hash(password, 10)
    const deletedUserEmail = `e2e-revoke-${Date.now()}@hrtest.local`
    const deletedUser = await prisma.user.create({
      data: {
        name: "E2E Revoked User",
        email: deletedUserEmail,
        passwordHash,
        role: "VIEWER",
        active: true,
      },
    })

    const deletedUserContext = await browser.newContext()
    const deletedUserPage = await deletedUserContext.newPage()

    try {
      await adminPage.goto(USERS_URL, { waitUntil: "domcontentloaded" })
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })
      const appOrigin = new URL(adminPage.url()).origin

      await performLogin(
        deletedUserPage,
        {
          email: deletedUserEmail,
          password,
          name: "E2E Revoked User",
          role: "VIEWER",
        },
        appOrigin
      )
      await deletedUserPage.goto(`${appOrigin}/`, { waitUntil: "domcontentloaded" })
      await expect(
        deletedUserPage.getByRole("button", { name: /open user menu/i })
      ).toContainText("E2E Revoked User")

      const userRow = adminPage.locator("tr", {
        hasText: "E2E Revoked User",
      })
      await expect(userRow).toBeVisible()

      await userRow
        .locator('button[aria-label="Delete user E2E Revoked User"]')
        .click()

      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await dialog.getByRole("button", { name: "Delete" }).click()
      await expect(dialog).not.toBeVisible({ timeout: 10000 })
      await expect(userRow).not.toBeVisible({ timeout: 10000 })

      expect(
        await prisma.user.findUnique({ where: { id: deletedUser.id } })
      ).toBeNull()

      await deletedUserPage.goto(`${appOrigin}/`, { waitUntil: "domcontentloaded" })
      await expect(deletedUserPage).toHaveURL(/\/login/)

      await deletedUserPage.fill("#email", deletedUserEmail)
      await deletedUserPage.fill("#password", password)
      await deletedUserPage.click('button[type="submit"]')
      await expect(deletedUserPage.getByText("Invalid email or password")).toBeVisible()
      await expect(deletedUserPage).toHaveURL(/\/login/)
    } finally {
      await deletedUserContext.close()
      await prisma.user
        .delete({ where: { id: deletedUser.id } })
        .catch(() => {})
    }
  })

  test("cancel keeps the user in the list", async ({
    adminPage,
    prisma,
  }) => {
    // Create a disposable test user
    const passwordHash = await hash(getTestPassword(), 10)
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Cancel Delete",
        email: `e2e-cancel-del-${Date.now()}@hrtest.local`,
        passwordHash,
        role: "VIEWER",
        active: true,
      },
    })

    try {
      await adminPage.goto(USERS_URL, { waitUntil: "domcontentloaded" })
      await adminPage.waitForSelector("table tbody tr", { state: "visible" })

      const userRow = adminPage.locator("tr", {
        hasText: "E2E Cancel Delete",
      })
      await expect(userRow).toBeVisible()

      // Open the delete confirmation
      const deleteBtn = userRow.locator(
        'button[aria-label="Delete user E2E Cancel Delete"]'
      )
      await deleteBtn.click()

      const dialog = adminPage.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()

      // Click cancel
      await dialog.getByRole("button", { name: "Keep user" }).click()

      // Dialog should close
      await expect(dialog).not.toBeVisible()

      // User should still be in the list
      await expect(userRow).toBeVisible()
    } finally {
      await prisma.user
        .delete({ where: { id: testUser.id } })
        .catch(() => {})
    }
  })
})
