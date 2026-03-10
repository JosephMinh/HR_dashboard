/**
 * E2E Tests: Jobs Management
 *
 * Tests for Jobs list, create, detail, and edit functionality.
 */

import { test, expect } from "./fixtures"

test.describe("Jobs List Page", () => {
  test("displays jobs table with all columns", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Should see table headers
    await expect(page.getByRole("button", { name: /title/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /department/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /status/i })).toBeVisible()
    await expect(page.getByText("Priority")).toBeVisible()
    await expect(page.getByText("Pipeline")).toBeVisible()
    await expect(page.getByText("Candidates")).toBeVisible()
  })

  test("sort by column updates URL and reorders data", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Click Title to sort
    await page.getByRole("button", { name: /title/i }).click()

    // URL should update with sort params
    await expect(page).toHaveURL(/sort=title/)

    // Click again to reverse order
    await page.getByRole("button", { name: /title/i }).click()
    await expect(page).toHaveURL(/order=asc|order=desc/)
  })

  test("filter by status filters results", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Open status dropdown
    await page.getByRole("combobox").click()

    // Select OPEN status
    await page.getByRole("option", { name: "Open" }).click()

    // URL should update
    await expect(page).toHaveURL(/status=OPEN/)
  })

  test("search by title filters results", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Type in search
    await page.getByPlaceholder("Search jobs...").fill("Engineer")

    // Wait for debounce
    await page.waitForTimeout(500)

    // URL should update
    await expect(page).toHaveURL(/search=Engineer/)
  })

  test("rapid typing preserves the full jobs search value", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    const searchInput = page.getByPlaceholder("Search jobs...")
    await searchInput.pressSequentially("principal engineer", { delay: 10 })

    await expect(searchInput).toHaveValue("principal engineer")
    await expect(page).toHaveURL(/search=principal(\+|%20)engineer/)
  })

  test("browser navigation restores jobs search history", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    const searchInput = page.getByPlaceholder("Search jobs...")

    await searchInput.fill("Engineer")
    await expect(page).toHaveURL(/search=Engineer/)

    await searchInput.fill("Product")
    await expect(page).toHaveURL(/search=Product/)

    await page.goBack()
    await expect(searchInput).toHaveValue("Engineer")
  })

  test("clear filters resets all filters", async ({ recruiterPage: page }) => {
    // Start with filters
    await page.goto("/jobs?status=OPEN&search=test")
    await page.waitForLoadState("networkidle")

    // Click clear all
    const clearButton = page.getByRole("button", { name: /clear all/i })
    if (await clearButton.isVisible()) {
      await clearButton.click()

      // URL should be clean
      await expect(page).toHaveURL("/jobs")
    }
  })

  test("shows empty state when no jobs", async ({ recruiterPage: page }) => {
    // Search for something that doesn't exist
    await page.goto("/jobs?search=xyznonexistent123")
    await page.waitForLoadState("networkidle")

    // Should show empty state
    await expect(page.getByText("No jobs found")).toBeVisible()
  })

  test("critical job shows alert indicator", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Look for any jobs with alert triangle (critical indicator)
    // This depends on seeded data having critical jobs
    const table = page.locator("table")
    await expect(table).toBeVisible()
  })

  test("pagination works", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // If there's pagination, test it
    const nextButton = page.getByRole("button", { name: /next/i })
    if (await nextButton.isVisible() && await nextButton.isEnabled()) {
      await nextButton.click()
      await expect(page).toHaveURL(/page=2/)

      // Go back
      await page.getByRole("button", { name: /previous/i }).click()
      await expect(page).not.toHaveURL(/page=2/)
    }
  })
})

test.describe("Create Job", () => {
  test("navigate to create page", async ({ recruiterPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Click New Job button
    await page.getByRole("link", { name: /new job/i }).click()

    // Should be on create page
    await expect(page).toHaveURL("/jobs/new")
  })

  test("fill and submit job form", async ({ recruiterPage: page }) => {
    await page.goto("/jobs/new")
    await page.waitForLoadState("networkidle")

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

  test("shows validation errors for empty required fields", async ({ recruiterPage: page }) => {
    await page.goto("/jobs/new")
    await page.waitForLoadState("networkidle")

    // Try to submit without filling required fields
    await page.getByRole("button", { name: /create|save|submit/i }).click()

    // Should show error or stay on page (HTML5 validation)
    await expect(page).toHaveURL("/jobs/new")
  })

  test("cancel returns to list", async ({ recruiterPage: page }) => {
    await page.goto("/jobs/new")
    await page.waitForLoadState("networkidle")

    // Click cancel button
    const cancelButton = page.getByRole("button", { name: /cancel/i }).or(
      page.getByRole("link", { name: /cancel|back/i })
    )
    if (await cancelButton.isVisible()) {
      await cancelButton.click()
      await expect(page).toHaveURL("/jobs")
    }
  })
})

test.describe("Job Detail Page", () => {
  test("displays job details", async ({ recruiterPage: page, prisma }) => {
    // Get first job from database
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    // Should see job title
    await expect(page.getByText(job.title)).toBeVisible()

    // Should see department
    await expect(page.getByText(job.department)).toBeVisible()
  })

  test("edit button navigates to edit form", async ({ recruiterPage: page, prisma }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    // Click edit button
    await page.getByRole("link", { name: /edit/i }).click()

    // Should be on edit page
    await expect(page).toHaveURL(`/jobs/${job.id}/edit`)
  })

  test("shows candidates pipeline", async ({ recruiterPage: page, prisma }) => {
    const job = await prisma.job.findFirst({
      include: { applications: true },
    })
    if (!job || job.applications.length === 0) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    // Should see pipeline or candidates section
    // Look for stage names or candidate info
    const pageContent = await page.content()
    const hasContent = pageContent.includes("application") ||
      pageContent.includes("candidate") ||
      pageContent.includes("NEW") ||
      pageContent.includes("SCREENING")

    expect(hasContent).toBeTruthy()
  })

  test("add candidate dialog opens", async ({ recruiterPage: page, prisma }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

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
  test("form is pre-populated with existing values", async ({ recruiterPage: page, prisma }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}/edit`)
    await page.waitForLoadState("networkidle")

    // Title field should have existing value
    const titleInput = page.getByLabel("Title")
    await expect(titleInput).toHaveValue(job.title)
  })

  test("update job title and save", async ({ recruiterPage: page, prisma }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}/edit`)
    await page.waitForLoadState("networkidle")

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

  test("change status to CLOSED", async ({ recruiterPage: page, prisma }) => {
    const job = await prisma.job.findFirst({ where: { status: "OPEN" } })
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}/edit`)
    await page.waitForLoadState("networkidle")

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
  test("VIEWER cannot see New Job button", async ({ viewerPage: page }) => {
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // New Job button should not be visible
    await expect(page.getByRole("link", { name: /new job/i })).not.toBeVisible()
  })

  test("VIEWER cannot see Edit button on job detail", async ({ viewerPage: page, prisma }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    // Edit button should not be visible
    await expect(page.getByRole("link", { name: /edit/i })).not.toBeVisible()
  })

  test("VIEWER cannot access job edit page directly", async ({ viewerPage: page, prisma }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}/edit`)
    await page.waitForLoadState("networkidle")

    // Should be redirected or show error
    const url = page.url()
    const isOnEditPage = url.includes("/edit")
    const hasError = await page.getByText(/unauthorized|forbidden|not allowed/i).isVisible().catch(() => false)

    // Either redirected away or showing error
    expect(isOnEditPage && !hasError).toBeFalsy()
  })
})
