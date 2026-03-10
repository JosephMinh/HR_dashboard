/**
 * E2E Authentication Utilities
 *
 * Provides pre-authenticated browser contexts for different user roles.
 * Handles session storage and reuse between tests.
 */

import { type Page, type BrowserContext, type Browser } from "@playwright/test"
import path from "node:path"
import fs from "node:fs"

export type UserRole = "ADMIN" | "RECRUITER" | "VIEWER"

export interface TestUser {
  email: string
  password: string
  name: string
  role: UserRole
}

// Default test users - should match seeded database
export const TEST_USERS: Record<UserRole, TestUser> = {
  ADMIN: {
    email: "admin@hrtest.local",
    password: "testpassword123",
    name: "Test Admin",
    role: "ADMIN",
  },
  RECRUITER: {
    email: "recruiter@hrtest.local",
    password: "testpassword123",
    name: "Test Recruiter",
    role: "RECRUITER",
  },
  VIEWER: {
    email: "viewer@hrtest.local",
    password: "testpassword123",
    name: "Test Viewer",
    role: "VIEWER",
  },
}

// Storage paths for authenticated sessions
const AUTH_STORAGE_DIR = path.join(process.cwd(), ".playwright", "auth")

function getStoragePath(role: UserRole): string {
  return path.join(AUTH_STORAGE_DIR, `${role.toLowerCase()}-storage.json`)
}

/**
 * Ensure auth storage directory exists
 */
function ensureAuthStorageDir(): void {
  if (!fs.existsSync(AUTH_STORAGE_DIR)) {
    fs.mkdirSync(AUTH_STORAGE_DIR, { recursive: true })
  }
}

/**
 * Check if authenticated storage exists and is recent
 */
function hasValidStorage(role: UserRole, maxAgeMs = 3600000): boolean {
  const storagePath = getStoragePath(role)
  if (!fs.existsSync(storagePath)) {
    return false
  }

  const stats = fs.statSync(storagePath)
  const ageMs = Date.now() - stats.mtimeMs
  return ageMs < maxAgeMs
}

/**
 * Perform login and save storage state
 */
export async function performLogin(
  page: Page,
  user: TestUser,
  baseUrl: string,
): Promise<void> {
  console.log(`[AUTH] Logging in as ${user.role}: ${user.email}`)

  // Navigate to login page
  await page.goto(`${baseUrl}/login`)
  await page.waitForLoadState("networkidle")

  // Fill in credentials
  await page.fill('input[name="email"], input[type="email"]', user.email)
  await page.fill('input[name="password"], input[type="password"]', user.password)

  // Submit form
  await page.click('button[type="submit"]')

  // Wait for redirect to dashboard
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 10000,
  })

  console.log(`[AUTH] Login successful for ${user.role}`)
}

/**
 * Get an authenticated browser context for a specific role
 */
export async function getAuthenticatedContext(
  browser: Browser,
  role: UserRole,
  baseUrl: string,
  options?: {
    forceLogin?: boolean
    maxStorageAgeMs?: number
  },
): Promise<BrowserContext> {
  ensureAuthStorageDir()
  const storagePath = getStoragePath(role)
  const user = TEST_USERS[role]

  // Check if we have valid cached storage
  if (!options?.forceLogin && hasValidStorage(role, options?.maxStorageAgeMs)) {
    console.log(`[AUTH] Using cached storage for ${role}`)
    return browser.newContext({ storageState: storagePath })
  }

  // Create new context and perform login
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await performLogin(page, user, baseUrl)

    // Save storage state
    await context.storageState({ path: storagePath })
    console.log(`[AUTH] Saved storage state for ${role}`)
  } finally {
    await page.close()
  }

  // Return a fresh context with the saved storage
  await context.close()
  return browser.newContext({ storageState: storagePath })
}

/**
 * Create authenticated page for a role
 */
export async function createAuthenticatedPage(
  browser: Browser,
  role: UserRole,
  baseUrl: string,
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await getAuthenticatedContext(browser, role, baseUrl)
  const page = await context.newPage()
  return { page, context }
}

/**
 * Clear all cached auth storage
 */
export function clearAuthStorage(): void {
  if (fs.existsSync(AUTH_STORAGE_DIR)) {
    const files = fs.readdirSync(AUTH_STORAGE_DIR)
    for (const file of files) {
      fs.unlinkSync(path.join(AUTH_STORAGE_DIR, file))
    }
    console.log("[AUTH] Cleared all cached storage")
  }
}

/**
 * Clear specific role's auth storage
 */
export function clearRoleStorage(role: UserRole): void {
  const storagePath = getStoragePath(role)
  if (fs.existsSync(storagePath)) {
    fs.unlinkSync(storagePath)
    console.log(`[AUTH] Cleared storage for ${role}`)
  }
}

/**
 * Assert current user has expected role
 */
export async function assertUserRole(page: Page, expectedRole: UserRole): Promise<void> {
  // Look for role indicator in the UI or session storage
  // This depends on how your app exposes the user's role
  const userElement = await page.locator('[data-testid="user-role"]').textContent()
  if (userElement && !userElement.includes(expectedRole)) {
    throw new Error(`Expected role ${expectedRole} but found ${userElement}`)
  }
}

/**
 * Logout the current user
 */
export async function logout(page: Page): Promise<void> {
  // Click logout button or navigate to logout
  const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout")')
  if (await logoutButton.isVisible()) {
    await logoutButton.click()
    await page.waitForURL((url) => url.pathname.includes("/login"))
    console.log("[AUTH] Logged out successfully")
  }
}
