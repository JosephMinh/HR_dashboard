/**
 * Visual Regression Tests for Layout Spacing
 *
 * Verifies layout changes don't break any pages and documents the "after" state.
 * Run `npx playwright test layout-spacing --update-snapshots` to generate baseline.
 */

import { test, expect } from "./fixtures"

test.describe("Layout Spacing - Desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("job detail page layout", async ({ recruiterPage: page, prisma }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    await expect(page).toHaveScreenshot("job-detail-desktop.png", {
      fullPage: false,
      maxDiffPixels: 100,
    })
  })

  test("jobs list page layout", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    await expect(page).toHaveScreenshot("jobs-list-desktop.png", {
      fullPage: false,
      maxDiffPixels: 100,
    })
  })

  test("candidates list page layout", async ({ recruiterPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    await expect(page).toHaveScreenshot("candidates-list-desktop.png", {
      fullPage: false,
      maxDiffPixels: 100,
    })
  })

  test("dashboard page layout", async ({ recruiterPage: page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    await expect(page).toHaveScreenshot("dashboard-desktop.png", {
      fullPage: false,
      maxDiffPixels: 100,
    })
  })
})

test.describe("Layout Spacing - Mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } }) // iPhone X

  test("job detail page layout mobile", async ({ recruiterPage: page, prisma }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    await expect(page).toHaveScreenshot("job-detail-mobile.png", {
      fullPage: false,
      maxDiffPixels: 100,
    })
  })

  test("dashboard page layout mobile", async ({ recruiterPage: page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    await expect(page).toHaveScreenshot("dashboard-mobile.png", {
      fullPage: false,
      maxDiffPixels: 100,
    })
  })
})

test.describe("Layout Measurements", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("job page content starts within expected range", async ({
    recruiterPage: page,
    prisma,
  }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    // Get first heading element
    const title = page.locator("h1").first()
    await expect(title).toBeVisible()

    const box = await title.boundingBox()
    expect(box).not.toBeNull()

    // Content should start within reasonable range from top
    // TopBar (64px) + reduced padding (20px) + some margin = ~84-120px
    expect(box!.y).toBeGreaterThan(70)
    expect(box!.y).toBeLessThan(130)
  })

  test("spacing is consistent across main pages", async ({
    recruiterPage: page,
    prisma,
  }) => {
    const job = await prisma.job.findFirst()
    const pages = job ? [`/jobs/${job.id}`, "/candidates", "/"] : ["/candidates", "/"]
    const contentStarts: number[] = []

    for (const path of pages) {
      await page.goto(path)
      await page.waitForLoadState("networkidle")

      const firstHeading = page.locator("h1, h2").first()
      await firstHeading.waitFor({ state: "visible", timeout: 5000 })
      const box = await firstHeading.boundingBox()
      if (box) {
        contentStarts.push(box.y)
      }
    }

    if (contentStarts.length >= 2) {
      // All pages should have similar content start position (within 30px)
      const max = Math.max(...contentStarts)
      const min = Math.min(...contentStarts)
      expect(max - min).toBeLessThan(30)
    }
  })

  test("AppShell padding is reduced", async ({ recruiterPage: page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Find the main content area inside AppShell
    const main = page.locator("main").first()
    await expect(main).toBeVisible()

    // Check computed padding values
    const paddingTop = await main.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).paddingTop, 10)
    })

    // After fix: py-4 lg:py-5 = 16px to 20px on desktop (was 32px)
    expect(paddingTop).toBeLessThanOrEqual(24)
  })
})
