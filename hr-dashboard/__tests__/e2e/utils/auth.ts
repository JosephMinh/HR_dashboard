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

function getTestPassword(): string {
  const password = process.env.E2E_TEST_PASSWORD ?? process.env.TEST_PASSWORD
  if (!password) {
    throw new Error("E2E_TEST_PASSWORD or TEST_PASSWORD must be set for Playwright auth.")
  }

  return password
}

// Default test users - should match seeded database
export const TEST_USERS: Record<UserRole, TestUser> = {
  ADMIN: {
    email: "admin@hrtest.local",
    password: getTestPassword(),
    name: "Test Admin",
    role: "ADMIN",
  },
  RECRUITER: {
    email: "recruiter@hrtest.local",
    password: getTestPassword(),
    name: "Test Recruiter",
    role: "RECRUITER",
  },
  VIEWER: {
    email: "viewer@hrtest.local",
    password: getTestPassword(),
    name: "Test Viewer",
    role: "VIEWER",
  },
}

export { getTestPassword }

// Storage paths for authenticated sessions
const AUTH_STORAGE_DIR = path.join(process.cwd(), ".playwright", "auth")

function getOriginStorageSlug(baseUrl: string): string {
  const origin = new URL(baseUrl).origin
  return origin.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()
}

function sanitizeStorageNamespace(namespace: string): string {
  return namespace
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

function getStoragePath(
  role: UserRole,
  baseUrl: string,
  storageNamespace?: string,
): string {
  const namespaceSuffix = storageNamespace
    ? `-${sanitizeStorageNamespace(storageNamespace)}`
    : ""
  return path.join(
    AUTH_STORAGE_DIR,
    `${role.toLowerCase()}-${getOriginStorageSlug(baseUrl)}${namespaceSuffix}-storage.json`,
  )
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
function hasValidStorage(
  role: UserRole,
  baseUrl: string,
  maxAgeMs = 3600000,
  storageNamespace?: string,
): boolean {
  const storagePath = getStoragePath(role, baseUrl, storageNamespace)
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

  const maxAttempts = 4
  const totalRetryBudgetMs = 25000
  const startedAt = Date.now()

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const remainingBudgetMs = totalRetryBudgetMs - (Date.now() - startedAt)
      if (remainingBudgetMs <= 0) {
        break
      }

      // Navigate to login page. The dev server can briefly refuse connections
      // while booting, so treat navigation readiness as retryable.
      await page.goto(`${baseUrl}/login`, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(10000, remainingBudgetMs),
      })

      // The credentials form is client-driven. Give the page a short chance to
      // settle so the next-auth signIn() handler is wired before we submit.
      await page.waitForLoadState("networkidle", {
        timeout: Math.min(5000, remainingBudgetMs),
      }).catch(() => undefined)

      const postLoadBudgetMs = totalRetryBudgetMs - (Date.now() - startedAt)
      if (postLoadBudgetMs <= 0) {
        break
      }

      const emailInput = page.getByLabel("Email")
      const passwordInput = page.getByLabel("Password")
      const submitButton = page.getByRole("button", { name: /^sign in$/i })

      const fieldTimeoutMs = Math.min(8000, postLoadBudgetMs)
      await emailInput.waitFor({ state: "visible", timeout: fieldTimeoutMs })
      await passwordInput.waitFor({ state: "visible", timeout: fieldTimeoutMs })

      // Let the client form hydrate before submitting. If we click too early,
      // the browser performs a native GET submit to /login? instead of the
      // React onSubmit handler calling next-auth signIn().
      await emailInput.fill(user.email)
      await passwordInput.fill(user.password)
      await emailInput.blur()
      await passwordInput.blur()
      await submitButton.waitFor({ state: "visible" })

      await page.waitForFunction(
        ([email, password]) => {
          const emailField = document.querySelector<HTMLInputElement>("#email")
          const passwordField = document.querySelector<HTMLInputElement>("#password")
          return emailField?.value === email && passwordField?.value === password
        },
        [user.email, user.password],
      )

      await submitButton.click()

      const submitBudgetMs = totalRetryBudgetMs - (Date.now() - startedAt)
      if (submitBudgetMs <= 0) {
        break
      }

      await page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: Math.min(12000, submitBudgetMs),
      })
      console.log(`[AUTH] Login successful for ${user.role}`)
      return
    } catch {
      const loginError = page.locator("#login-error")
      const hasError = await loginError.isVisible().catch(() => false)
      const errorText = hasError ? (await loginError.textContent())?.trim() : null

      const remainingBudgetMs = totalRetryBudgetMs - (Date.now() - startedAt)
      if (attempt < maxAttempts && remainingBudgetMs > 0 && !page.isClosed()) {
        console.warn(
          `[AUTH] Login attempt ${attempt} failed for ${user.email}${errorText ? `: ${errorText}` : ""}; retrying...`,
        )
        await page.waitForTimeout(Math.min(750, remainingBudgetMs))
        continue
      }

      throw new Error(
        `[AUTH] Login failed for ${user.email}${errorText ? `: ${errorText}` : ": stayed on /login"}`,
      )
    }
  }

  throw new Error(
    `[AUTH] Login failed for ${user.email}: exhausted ${totalRetryBudgetMs}ms retry budget`,
  )
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
    storageNamespace?: string
  },
): Promise<BrowserContext> {
  ensureAuthStorageDir()
  const storagePath = getStoragePath(role, baseUrl, options?.storageNamespace)
  const user = TEST_USERS[role]

  // Check if we have valid cached storage
  if (
    !options?.forceLogin &&
    hasValidStorage(role, baseUrl, options?.maxStorageAgeMs, options?.storageNamespace)
  ) {
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
  options?: {
    forceLogin?: boolean
    maxStorageAgeMs?: number
    storageNamespace?: string
  },
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await getAuthenticatedContext(browser, role, baseUrl, options)
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
export function clearRoleStorage(
  role: UserRole,
  baseUrl?: string,
  storageNamespace?: string,
): void {
  if (baseUrl) {
    const storagePath = getStoragePath(role, baseUrl, storageNamespace)
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath)
      console.log(
        `[AUTH] Cleared storage for ${role} (${baseUrl}${storageNamespace ? `, ${storageNamespace}` : ""})`,
      )
    }
    return
  }

  if (!fs.existsSync(AUTH_STORAGE_DIR)) {
    return
  }

  const prefix = `${role.toLowerCase()}-`
  for (const file of fs.readdirSync(AUTH_STORAGE_DIR)) {
    if (file.startsWith(prefix)) {
      fs.unlinkSync(path.join(AUTH_STORAGE_DIR, file))
      console.log(`[AUTH] Cleared storage for ${role}: ${file}`)
    }
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
