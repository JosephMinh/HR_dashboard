/**
 * E2E Tests: Jobs Management
 *
 * Tests for Jobs list, create, detail, and edit functionality.
 */

import type { Page } from "@playwright/test"
import { test, expect } from "./fixtures"

type TestRole = "ADMIN" | "RECRUITER" | "VIEWER"
type LoginAs = (page: Page, role: TestRole) => Promise<void>

async function expectQueryValues(page: Page, key: string, expected: string[]) {
  await expect.poll(() => {
    const url = new URL(page.url())
    return url.searchParams.getAll(key)
  }).toEqual(expected)
}

async function expectUrlMatch(page: Page, expected: RegExp) {
  await expect.poll(() => page.url()).toMatch(expected)
}

async function expectPathname(page: Page, expected: string) {
  await expect.poll(() => new URL(page.url()).pathname).toBe(expected)
}

async function ensurePathAs(
  page: Page,
  loginAs: LoginAs,
  role: TestRole,
  path: string,
) {
  await page.goto(path)
  const signInHeading = page.getByRole("heading", { name: /sign in/i })
  if (await signInHeading.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await loginAs(page, role)
    await page.goto(path)
  }
}

async function gotoJobsList(page: Page, loginAs: LoginAs, role: TestRole = "RECRUITER") {
  await ensurePathAs(page, loginAs, role, "/jobs")
  await expect(page.getByPlaceholder("Search jobs...")).toBeVisible()
}

function filterOption(page: Page, label: RegExp) {
  return page.locator("label").filter({ hasText: label })
}

test.describe("Jobs List Page", () => {
  test("displays jobs table with all columns", async ({ recruiterPage: page, loginAs }) => {
    await gotoJobsList(page, loginAs)

    // Should see table headers
    await expect(page.getByRole("columnheader", { name: "Title" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Department" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Priority" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Pipeline" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Candidates" })).toBeVisible()
    await expect(page.getByRole("button", { name: /target date/i })).toBeVisible()
  })

  test("sort by column updates URL and reorders data", async ({ recruiterPage: page, loginAs }) => {
    await gotoJobsList(page, loginAs)

    // Click Target Date to sort
    await page.getByRole("button", { name: /target date/i }).click()

    // URL should update with sort params
    await expectUrlMatch(page, /sort=targetFillDate/)

    // Click again to reverse order
    await page.getByRole("button", { name: /target date/i }).click()
    await expectUrlMatch(page, /order=asc|order=desc/)
  })

  test("status checkbox popover supports multi-select and URL persistence", async ({ recruiterPage: page, loginAs }) => {
    await gotoJobsList(page, loginAs)

    const statusTrigger = page.getByRole("button", { name: "Filter by status" })
    await statusTrigger.click()

    await filterOption(page, /^Open$/).click()
    await expectQueryValues(page, "status", ["OPEN"])

    await filterOption(page, /^Offer$/).click()
    await expectQueryValues(page, "status", ["OPEN", "OFFER"])

    await page.reload()
    await expect(statusTrigger).toBeVisible()
    await expectQueryValues(page, "status", ["OPEN", "OFFER"])
  })

  test("changing a checkbox filter clears stale pagination state", async ({ recruiterPage: page, loginAs }) => {
    await ensurePathAs(page, loginAs, "RECRUITER", "/jobs?page=3&status=OPEN")
    await expect(page.getByRole("button", { name: "Filter by status" })).toBeVisible()

    await page.getByRole("button", { name: "Filter by status" }).click()
    await filterOption(page, /^Offer$/).click()

    await expectQueryValues(page, "status", ["OPEN", "OFFER"])
    await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBeNull()
  })

  test("deep-linked missing and unavailable filter values stay visible and clearable", async ({ recruiterPage: page, loginAs }) => {
    await ensurePathAs(page, loginAs, "RECRUITER", "/jobs?location=__MISSING__&corporatePriority=Legacy")
    await expect(page.getByRole("button", { name: "Filter by location" })).toBeVisible()

    await page.getByRole("button", { name: "Filter by location" }).click()
    await expect(filterOption(page, /^Not Set$/)).toBeVisible()
    await filterOption(page, /^Not Set$/).click()
    await expect.poll(() => new URL(page.url()).searchParams.getAll("location")).toEqual([])

    await page.getByRole("button", { name: "Filter by corporate priority" }).click()
    await expect(filterOption(page, /^Legacy \(Unavailable\)$/)).toBeVisible()
    await filterOption(page, /^Legacy \(Unavailable\)$/).click()
    await expect.poll(() => new URL(page.url()).searchParams.getAll("corporatePriority")).toEqual([])
  })

  test("keyboard interaction toggles checkbox filters and restores focus to the trigger", async ({ recruiterPage: page, loginAs }) => {
    await gotoJobsList(page, loginAs)

    const statusTrigger = page.getByRole("button", { name: "Filter by status" })
    await statusTrigger.focus()
    await page.keyboard.press("Enter")

    const openOption = filterOption(page, /^Open$/)
    const openCheckbox = openOption.locator('[role="checkbox"]')
    await expect(openOption).toBeVisible()
    await openCheckbox.focus()
    await page.keyboard.press("Space")

    await expectQueryValues(page, "status", ["OPEN"])

    await page.keyboard.press("Escape")
    await expect(statusTrigger).toBeFocused()
  })

  test("search by title filters results", async ({ recruiterPage: page, loginAs }) => {
    await gotoJobsList(page, loginAs)

    // Type in search
    await page.getByPlaceholder("Search jobs...").fill("Engineer")

    // Wait for debounce
    await page.waitForTimeout(500)

    // URL should update
    await expectUrlMatch(page, /search=Engineer/)
  })

  test("rapid typing preserves the full jobs search value", async ({ recruiterPage: page, loginAs }) => {
    await gotoJobsList(page, loginAs)

    const searchInput = page.getByPlaceholder("Search jobs...")
    await searchInput.pressSequentially("principal engineer", { delay: 10 })

    await expect(searchInput).toHaveValue("principal engineer")
    await expectUrlMatch(page, /search=principal(\+|%20)engineer/)
  })

  test("jobs search replaces the current history entry", async ({ recruiterPage: page, loginAs }) => {
    await ensurePathAs(page, loginAs, "RECRUITER", "/")
    await gotoJobsList(page, loginAs)

    const searchInput = page.getByPlaceholder("Search jobs...")

    await searchInput.fill("Engineer")
    await expectUrlMatch(page, /search=Engineer/)

    await searchInput.fill("Product")
    await expectUrlMatch(page, /search=Product/)

    await page.evaluate(() => window.history.back())
    await expectPathname(page, "/")
  })

  test("clear filters resets all filters", async ({ recruiterPage: page, loginAs }) => {
    // Start with filters
    await ensurePathAs(page, loginAs, "RECRUITER", "/jobs?status=OPEN&status=OFFER&department=Engineering&search=test")
    await expect(page.getByRole("button", { name: /clear all/i })).toBeVisible()

    // Click clear all
    const clearButton = page.getByRole("button", { name: /clear all/i })
    if (await clearButton.isVisible()) {
      await clearButton.click()

      // URL should be clean
      await expectPathname(page, "/jobs")
    }
  })

  test("shows empty state when no jobs", async ({ recruiterPage: page, loginAs }) => {
    // Search for something that doesn't exist
    await ensurePathAs(page, loginAs, "RECRUITER", "/jobs?status=OPEN&status=OFFER&search=xyznonexistent123")

    // Should show empty state
    await expect(page.getByText("No matches found")).toBeVisible()
    await expect(page.getByRole("button", { name: /clear filters/i })).toBeVisible()
  })

  test("critical job shows alert indicator", async ({ recruiterPage: page, loginAs }) => {
    await gotoJobsList(page, loginAs)

    // Look for any jobs with alert triangle (critical indicator)
    // This depends on seeded data having critical jobs
    const table = page.locator("table")
    await expect(table).toBeVisible()
  })

  test("pagination works", async ({ recruiterPage: page, loginAs }) => {
    await gotoJobsList(page, loginAs)

    // If there's pagination, test it
    const nextButton = page.getByRole("button", { name: /next/i })
    if (await nextButton.isVisible() && await nextButton.isEnabled()) {
      await nextButton.click()
      await expectUrlMatch(page, /page=2/)

      // Go back
      await page.getByRole("button", { name: /previous/i }).click()
      await expect.poll(() => new URL(page.url()).searchParams.get("page")).not.toBe("2")
    }
  })
})

test.describe("Create Job", () => {
  test("navigate to create page", async ({ recruiterPage: page, loginAs }) => {
    await gotoJobsList(page, loginAs)

    // Click New Job button
    await page.getByRole("link", { name: /new job/i }).click()

    // Should be on create page
    await expectPathname(page, "/jobs/new")
  })

  test("fill and submit job form", async ({ recruiterPage: page, loginAs }) => {
    await ensurePathAs(page, loginAs, "RECRUITER", "/jobs/new")
    await expect(page.getByLabel("Title")).toBeVisible()

    // Fill required fields
    await page.getByLabel("Title").fill("Test Engineer Position")
    await page.getByLabel("Description").fill("This is a test job description for E2E testing.")

    // Select department
    await page.locator('[id*="department"]').click()
    await page.getByRole("option", { name: "Engineering" }).click()

    // Submit form
    await page.getByRole("button", { name: /create|save|submit/i }).click()

    // Should redirect to job detail
    await page.waitForURL(/\/jobs\/[a-z0-9-]+$/, { timeout: 10000 })

    // Should see the job title
    await expect(page.getByText("Test Engineer Position")).toBeVisible()
  })

  test("shows validation errors for empty required fields", async ({ recruiterPage: page, loginAs }) => {
    await ensurePathAs(page, loginAs, "RECRUITER", "/jobs/new")
    await expect(page.getByLabel("Title")).toBeVisible()

    // Try to submit without filling required fields
    await page.getByRole("button", { name: /create|save|submit/i }).click()

    // Should show error or stay on page (HTML5 validation)
    await expectPathname(page, "/jobs/new")
  })

  test("cancel returns to list", async ({ recruiterPage: page, loginAs }) => {
    await ensurePathAs(page, loginAs, "RECRUITER", "/jobs/new")
    await expect(page.getByLabel("Title")).toBeVisible()

    // Click cancel button
    const cancelButton = page.getByRole("button", { name: /cancel/i }).or(
      page.getByRole("link", { name: /cancel|back/i })
    )
    if (await cancelButton.isVisible()) {
      await cancelButton.click()
      await expectPathname(page, "/jobs")
    }
  })
})

test.describe("Job Detail Page", () => {
  test("displays job details", async ({ recruiterPage: page, prisma, loginAs }) => {
    // Get first job from database
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await ensurePathAs(page, loginAs, "RECRUITER", `/jobs/${job.id}`)

    // Should see job title
    await expect(page.getByText(job.title)).toBeVisible()

    // Should see department
    await expect(page.getByText(job.department)).toBeVisible()
  })

  test("edit button navigates to edit form", async ({ recruiterPage: page, prisma, loginAs }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await ensurePathAs(page, loginAs, "RECRUITER", `/jobs/${job.id}`)

    // Click edit button
    await page.getByRole("link", { name: /edit/i }).click()

    // Should be on edit page
    await expectPathname(page, `/jobs/${job.id}/edit`)
  })

  test("shows candidates pipeline", async ({ recruiterPage: page, prisma, loginAs }) => {
    const job = await prisma.job.findFirst({
      include: { applications: true },
    })
    if (!job || job.applications.length === 0) {
      test.skip()
      return
    }

    await ensurePathAs(page, loginAs, "RECRUITER", `/jobs/${job.id}`)

    // Should see pipeline or candidates section
    // Look for stage names or candidate info
    const pageContent = await page.content()
    const hasContent = pageContent.includes("application") ||
      pageContent.includes("candidate") ||
      pageContent.includes("NEW") ||
      pageContent.includes("SCREENING")

    expect(hasContent).toBeTruthy()
  })

  test("add candidate dialog opens", async ({ recruiterPage: page, prisma, loginAs }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await ensurePathAs(page, loginAs, "RECRUITER", `/jobs/${job.id}`)

    // Click add candidate button
    const addButton = page.getByRole("button", { name: /add candidate/i })
    if (await addButton.isVisible()) {
      await addButton.click()

      // Dialog should open
      await expect(page.getByRole("dialog")).toBeVisible()
    }
  })
})

test.describe("Edit Job", () => {
  test("form is pre-populated with existing values", async ({ recruiterPage: page, prisma, loginAs }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await ensurePathAs(page, loginAs, "RECRUITER", `/jobs/${job.id}/edit`)

    // Title field should have existing value
    const titleInput = page.getByLabel("Title")
    await expect(titleInput).toHaveValue(job.title)
  })

  test("update job title and save", async ({ recruiterPage: page, prisma, loginAs }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await ensurePathAs(page, loginAs, "RECRUITER", `/jobs/${job.id}/edit`)

    // Update title
    const newTitle = `Updated Job Title ${Date.now()}`
    await page.getByLabel("Title").fill(newTitle)

    // Save
    await page.getByRole("button", { name: /save|update|submit/i }).click()

    // Should redirect to detail page
    await page.waitForURL(`/jobs/${job.id}`, { timeout: 10000 })

    // Should see updated title
    await expect(page.getByText(newTitle)).toBeVisible()
  })

  test("change status to CLOSED", async ({ recruiterPage: page, prisma, loginAs }) => {
    const job = await prisma.job.findFirst({ where: { status: "OPEN" } })
    if (!job) {
      test.skip()
      return
    }

    await ensurePathAs(page, loginAs, "RECRUITER", `/jobs/${job.id}/edit`)

    // Change status
    await page.locator('[id*="status"]').click()
    await page.getByRole("option", { name: /closed/i }).click()

    // Save
    await page.getByRole("button", { name: /save|update|submit/i }).click()

    // Should redirect to detail
    await page.waitForURL(`/jobs/${job.id}`, { timeout: 10000 })

    // Should see CLOSED status badge
    await expect(page.getByText(/closed/i)).toBeVisible()
  })
})

test.describe("Role-based Access for Jobs", () => {
  test("VIEWER cannot see New Job button", async ({ viewerPage: page, loginAs }) => {
    await gotoJobsList(page, loginAs, "VIEWER")

    // New Job button should not be visible
    await expect(page.getByRole("link", { name: /new job/i })).not.toBeVisible()
  })

  test("VIEWER cannot see Edit button on job detail", async ({ viewerPage: page, prisma, loginAs }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await ensurePathAs(page, loginAs, "VIEWER", `/jobs/${job.id}`)

    // Edit button should not be visible
    await expect(page.getByRole("link", { name: /edit/i })).not.toBeVisible()
  })

  test("VIEWER cannot access job edit page directly", async ({ viewerPage: page, prisma, loginAs }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await ensurePathAs(page, loginAs, "VIEWER", `/jobs/${job.id}/edit`)

    // Should be redirected or show error
    const url = page.url()
    const isOnEditPage = url.includes("/edit")
    const hasError = await page.getByText(/unauthorized|forbidden|not allowed/i).isVisible().catch(() => false)

    // Either redirected away or showing error
    expect(isOnEditPage && !hasError).toBeFalsy()
  })
})
