/**
 * E2E Test Fixtures
 *
 * Provides reusable test fixtures including:
 * - Pre-authenticated pages for each role
 * - Logging utilities
 * - Database utilities
 */

import { test as base, type Page, type BrowserContext } from "@playwright/test"
import { createE2ELogger, createLoggedPage, E2ETestLogger, setupNetworkLogging, setupConsoleCapture } from "../utils/logger"
import { getAuthenticatedContext, type UserRole, TEST_USERS, performLogin } from "../utils/auth"
import { getE2EPrisma } from "../utils/database"
import type { PrismaClient } from "@/generated/prisma/client"

const playwrightPort = Number(process.env.PLAYWRIGHT_PORT ?? "3000")
const playwrightBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${playwrightPort}`

// Extend the base test with custom fixtures
export type TestFixtures = {
  // Authenticated pages for each role
  adminPage: Page
  recruiterPage: Page
  viewerPage: Page

  // Current page with logger
  pageWithLogger: { page: Page; logger: E2ETestLogger }

  // Auth utilities
  loginAs: (page: Page, role: UserRole) => Promise<void>

  // Database access
  prisma: PrismaClient

  // Logger for current test
  logger: E2ETestLogger
}

export type WorkerFixtures = {
  // Authenticated contexts (shared per worker)
  adminContext: BrowserContext
  recruiterContext: BrowserContext
  viewerContext: BrowserContext
}

/**
 * Extended test with E2E fixtures
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  page: async ({ page, logger }, use) => {
    setupConsoleCapture(page, logger)
    setupNetworkLogging(page, logger)
    await use(createLoggedPage(page, logger))
  },

  // Worker-scoped authenticated contexts
  adminContext: [
    async ({ browser }, use) => {
      const context = await getAuthenticatedContext(browser, "ADMIN", playwrightBaseUrl)
      await use(context)
      await context.close()
    },
    { scope: "worker" },
  ],

  recruiterContext: [
    async ({ browser }, use) => {
      const context = await getAuthenticatedContext(browser, "RECRUITER", playwrightBaseUrl)
      await use(context)
      await context.close()
    },
    { scope: "worker" },
  ],

  viewerContext: [
    async ({ browser }, use) => {
      const context = await getAuthenticatedContext(browser, "VIEWER", playwrightBaseUrl)
      await use(context)
      await context.close()
    },
    { scope: "worker" },
  ],

  // Test-scoped authenticated pages
  adminPage: async ({ adminContext, logger }, use) => {
    const rawPage = await adminContext.newPage()
    setupConsoleCapture(rawPage, logger)
    setupNetworkLogging(rawPage, logger)
    await use(createLoggedPage(rawPage, logger))
    await rawPage.close()
  },

  recruiterPage: async ({ recruiterContext, logger }, use) => {
    const rawPage = await recruiterContext.newPage()
    setupConsoleCapture(rawPage, logger)
    setupNetworkLogging(rawPage, logger)
    await use(createLoggedPage(rawPage, logger))
    await rawPage.close()
  },

  viewerPage: async ({ viewerContext, logger }, use) => {
    const rawPage = await viewerContext.newPage()
    setupConsoleCapture(rawPage, logger)
    setupNetworkLogging(rawPage, logger)
    await use(createLoggedPage(rawPage, logger))
    await rawPage.close()
  },

  // Logger for the current test
  logger: async ({}, use, testInfo) => {
    const logger = createE2ELogger(testInfo.title, testInfo)
    await use(logger)
    logger.finish()

    // Attach execution artifacts for failed/timed-out tests so they are
    // discoverable in the HTML report, JSON report, and CI artifact store.
    const didFail =
      testInfo.status === "failed" ||
      testInfo.status === "timedOut" ||
      (testInfo.status !== testInfo.expectedStatus && testInfo.status !== "skipped")
    if (didFail) {
      const logText = logger.getFullLogText()
      await testInfo.attach("execution-log", {
        contentType: "text/plain",
        body: Buffer.from(logText),
      })

      const consoleEntries = logger.getConsoleEntries()
      if (consoleEntries.length > 0) {
        await testInfo.attach("browser-console", {
          contentType: "text/plain",
          body: Buffer.from(logger.getConsoleText()),
        })
      }
    }
  },

  // Page with logger attached
  pageWithLogger: async ({ page, logger }, use) => {
    await use({ page, logger })
  },

  // Login utility
  loginAs: async ({ baseURL }, use) => {
    const login = async (page: Page, role: UserRole) => {
      const user = TEST_USERS[role]
      await performLogin(page, user, baseURL ?? playwrightBaseUrl)
    }
    await use(login)
  },

  // Prisma client
  prisma: async ({}, use) => {
    const prisma = getE2EPrisma()
    await use(prisma)
  },
})

/**
 * Re-export expect for convenience
 */
export { expect } from "@playwright/test"

/**
 * Custom assertions
 */
export async function expectToBeOnPage(page: Page, path: string): Promise<void> {
  const url = new URL(page.url())
  if (!url.pathname.includes(path)) {
    throw new Error(`Expected to be on page containing "${path}" but was on "${url.pathname}"`)
  }
}

export async function expectToBeLoggedIn(page: Page): Promise<void> {
  // Check for logout button or user menu
  const logoutButton = page.locator('button:has-text("Logout"), [data-testid="user-menu"]')
  const isVisible = await logoutButton.isVisible({ timeout: 5000 }).catch(() => false)
  if (!isVisible) {
    throw new Error("Expected to be logged in but no logout button or user menu found")
  }
}

export async function expectToBeLoggedOut(page: Page): Promise<void> {
  // Should be on login page
  await page.waitForURL((url) => url.pathname.includes("/login"), { timeout: 5000 })
}
