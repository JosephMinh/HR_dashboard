/**
 * E2E Tests: Stage Dropdown Positioning
 *
 * Tests for verifying the stage dropdown properly handles viewport positioning
 * and is always accessible regardless of where the candidate row is located.
 */

import { test, expect } from "./fixtures"

test.describe("Stage Dropdown Positioning", () => {
  test("dropdown is fully visible when near bottom of viewport", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Click on first job to go to detail page
    const jobLink = page.locator("table tbody tr a").first()
    await jobLink.click()
    await page.waitForLoadState("networkidle")

    // Check if there are candidates
    const candidateRows = page.locator('[data-testid="candidate-row"]')
    const rowCount = await candidateRows.count()

    if (rowCount === 0) {
      test.skip()
      return
    }

    // Get the last candidate row
    const lastRow = candidateRows.last()

    // Scroll so the last row is visible
    await lastRow.scrollIntoViewIfNeeded()

    // Click the stage dropdown trigger
    const trigger = lastRow.locator('[data-testid="stage-dropdown-trigger"]')
    const triggerCount = await trigger.count()

    if (triggerCount === 0) {
      // Viewer role may not see the dropdown trigger
      test.skip()
      return
    }

    await trigger.click()

    // Wait for dropdown to appear
    const dropdown = page.locator('[data-testid="stage-dropdown-content"]')
    await expect(dropdown).toBeVisible({ timeout: 5000 })

    // Verify dropdown is within viewport
    const dropdownBox = await dropdown.boundingBox()
    const viewportSize = page.viewportSize()

    expect(dropdownBox).not.toBeNull()
    expect(viewportSize).not.toBeNull()

    if (dropdownBox && viewportSize) {
      // Dropdown should be fully visible (bottom edge within viewport)
      expect(dropdownBox.y + dropdownBox.height).toBeLessThanOrEqual(viewportSize.height)
      // Dropdown should be fully visible (top edge within viewport)
      expect(dropdownBox.y).toBeGreaterThanOrEqual(0)
    }
  })

  test("all dropdown menu items are clickable", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Click on first job
    const jobLink = page.locator("table tbody tr a").first()
    await jobLink.click()
    await page.waitForLoadState("networkidle")

    // Find a candidate row with dropdown
    const trigger = page.locator('[data-testid="stage-dropdown-trigger"]').first()
    const triggerCount = await trigger.count()

    if (triggerCount === 0) {
      test.skip()
      return
    }

    await trigger.click()

    // Wait for dropdown
    const dropdown = page.locator('[data-testid="stage-dropdown-content"]')
    await expect(dropdown).toBeVisible()

    // All menu items should be visible
    const menuItems = dropdown.locator('[role="menuitem"], [data-slot="dropdown-menu-item"]')
    const itemCount = await menuItems.count()

    expect(itemCount).toBeGreaterThan(0)

    // Verify each item is visible and within viewport
    const viewportSize = page.viewportSize()
    for (let i = 0; i < itemCount; i++) {
      const item = menuItems.nth(i)
      await expect(item).toBeVisible()

      const box = await item.boundingBox()
      if (box && viewportSize) {
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.y + box.height).toBeLessThanOrEqual(viewportSize.height)
      }
    }
  })

  test("dropdown closes after selecting a stage", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Click on first job
    const jobLink = page.locator("table tbody tr a").first()
    await jobLink.click()
    await page.waitForLoadState("networkidle")

    // Find dropdown trigger
    const trigger = page.locator('[data-testid="stage-dropdown-trigger"]').first()
    const triggerCount = await trigger.count()

    if (triggerCount === 0) {
      test.skip()
      return
    }

    // Get current stage
    const currentStage = await trigger.textContent()

    await trigger.click()

    // Wait for dropdown
    const dropdown = page.locator('[data-testid="stage-dropdown-content"]')
    await expect(dropdown).toBeVisible()

    // Click a different menu item
    const menuItems = dropdown.locator('[role="menuitem"], [data-slot="dropdown-menu-item"]')
    const itemCount = await menuItems.count()

    if (itemCount > 1) {
      // Find a different stage to select
      for (let i = 0; i < itemCount; i++) {
        const item = menuItems.nth(i)
        const text = await item.textContent()
        if (text && !text.includes(currentStage || "")) {
          await item.click()
          break
        }
      }

      // Dropdown should close
      await expect(dropdown).not.toBeVisible({ timeout: 3000 })
    }
  })

  test("dropdown closes on Escape key", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Click on first job
    const jobLink = page.locator("table tbody tr a").first()
    await jobLink.click()
    await page.waitForLoadState("networkidle")

    // Find dropdown trigger
    const trigger = page.locator('[data-testid="stage-dropdown-trigger"]').first()
    const triggerCount = await trigger.count()

    if (triggerCount === 0) {
      test.skip()
      return
    }

    await trigger.click()

    // Wait for dropdown
    const dropdown = page.locator('[data-testid="stage-dropdown-content"]')
    await expect(dropdown).toBeVisible()

    // Press Escape
    await page.keyboard.press("Escape")

    // Dropdown should close
    await expect(dropdown).not.toBeVisible({ timeout: 3000 })
  })

  test("dropdown closes when clicking outside", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Click on first job
    const jobLink = page.locator("table tbody tr a").first()
    await jobLink.click()
    await page.waitForLoadState("networkidle")

    // Find dropdown trigger
    const trigger = page.locator('[data-testid="stage-dropdown-trigger"]').first()
    const triggerCount = await trigger.count()

    if (triggerCount === 0) {
      test.skip()
      return
    }

    await trigger.click()

    // Wait for dropdown
    const dropdown = page.locator('[data-testid="stage-dropdown-content"]')
    await expect(dropdown).toBeVisible()

    // Click outside the dropdown (on the page body)
    await page.locator("body").click({ position: { x: 10, y: 10 } })

    // Dropdown should close
    await expect(dropdown).not.toBeVisible({ timeout: 3000 })
  })
})
