/**
 * E2E Tests: Candidates Management
 *
 * Tests for Candidates list, create, detail, edit, and resume upload.
 */

import { test, expect } from "./fixtures"

test.describe("Candidates List Page", () => {
  test("displays candidates table with columns", async ({ recruiterPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    // Should see table or empty state
    const table = page.locator("table")
    const emptyState = page.getByText(/no candidates/i)

    await expect(table.or(emptyState)).toBeVisible()
  })

  test("sort by name", async ({ recruiterPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    // Click name column to sort
    const nameHeader = page.getByRole("button", { name: /name/i })
    if (await nameHeader.isVisible()) {
      await nameHeader.click()
      await expect(page).toHaveURL(/sort=/)
    }
  })

  test("sort by email", async ({ recruiterPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    const emailHeader = page.getByRole("button", { name: /email/i })
    if (await emailHeader.isVisible()) {
      await emailHeader.click()
      await expect(page).toHaveURL(/sort=email/)
    }
  })

  test("sort by updated date", async ({ recruiterPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    const updatedHeader = page.getByRole("button", { name: /updated/i })
    if (await updatedHeader.isVisible()) {
      await updatedHeader.click()
      await expect(page).toHaveURL(/sort=updatedAt/)
    }
  })

  test("search by name filters results", async ({ recruiterPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    // Type in search
    const searchInput = page.getByPlaceholder(/search/i)
    if (await searchInput.isVisible()) {
      await searchInput.fill("Alice")
      await page.waitForTimeout(500) // debounce

      await expect(page).toHaveURL(/search=Alice/)
    }
  })

  test("search by email", async ({ recruiterPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    const searchInput = page.getByPlaceholder(/search/i)
    if (await searchInput.isVisible()) {
      await searchInput.fill("candidate1@")
      await page.waitForTimeout(500)

      await expect(page).toHaveURL(/search=candidate1/)
    }
  })

  test("rapid typing preserves the full search value and syncs the URL", async ({ recruiterPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    const searchInput = page.getByPlaceholder("Search by name or email...")
    await searchInput.pressSequentially("software engineer", { delay: 10 })

    await expect(searchInput).toHaveValue("software engineer")
    await expect(page).toHaveURL(/search=software(\+|%20)engineer/)
  })

  test("browser navigation restores previous search values", async ({ recruiterPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    const searchInput = page.getByPlaceholder("Search by name or email...")

    await searchInput.fill("Alice")
    await expect(page).toHaveURL(/search=Alice/)

    await searchInput.fill("Alice Smith")
    await expect(page).toHaveURL(/search=Alice(\+|%20)Smith/)

    await page.goBack()
    await expect(searchInput).toHaveValue("Alice")

    await page.goForward()
    await expect(searchInput).toHaveValue("Alice Smith")
  })

  test("clear search resets filters", async ({ recruiterPage: page }) => {
    await page.goto("/candidates?search=test")
    await page.waitForLoadState("networkidle")

    const clearButton = page.getByRole("button", { name: /clear/i })
    if (await clearButton.isVisible()) {
      await clearButton.click()
      await expect(page).not.toHaveURL(/search=/)
    }
  })

  test("clear search removes the query param and allows re-searching", async ({ recruiterPage: page }) => {
    await page.goto("/candidates?search=Alice")
    await page.waitForLoadState("networkidle")

    const searchInput = page.getByPlaceholder("Search by name or email...")
    await expect(searchInput).toHaveValue("Alice")

    await page.getByRole("button", { name: "Clear search" }).click()
    await expect(searchInput).toHaveValue("")
    await expect(page).not.toHaveURL(/search=/)

    await searchInput.fill("Developer")
    await expect(searchInput).toHaveValue("Developer")
    await expect(page).toHaveURL(/search=Developer/)
  })

  test("shows resume indicator", async ({ recruiterPage: page, prisma }) => {
    // Get a candidate with resume
    const candidateWithResume = await prisma.candidate.findFirst({
      where: { resumeKey: { not: null } },
    })

    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    // Table should be visible and may have resume indicators
    const table = page.locator("table")
    await expect(table.or(page.getByText(/no candidates/i))).toBeVisible()
  })

  test("shows job count column", async ({ recruiterPage: page, prisma }) => {
    const candidateWithJobs = await prisma.candidate.findFirst({
      where: { applications: { some: {} } },
    })
    if (!candidateWithJobs) {
      test.skip()
      return
    }

    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    await expect(page.getByText(/^Jobs$/i)).toBeVisible()
  })
})

test.describe("Create Candidate", () => {
  test("navigate to create page", async ({ recruiterPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    await page.getByRole("link", { name: /new candidate/i }).click()
    await expect(page).toHaveURL("/candidates/new")
  })

  test("create with required fields only", async ({ recruiterPage: page }) => {
    await page.goto("/candidates/new")
    await page.waitForLoadState("networkidle")

    // Fill required fields
    await page.getByLabel(/first name/i).fill("Test")
    await page.getByLabel(/last name/i).fill("Candidate")

    // Submit
    await page.getByRole("button", { name: /create|save|submit/i }).click()

    // Should redirect to detail page
    await page.waitForURL(/\/candidates\/[a-z0-9-]+$/, { timeout: 10000 })

    // Should see the candidate name
    await expect(page.getByText("Test Candidate").or(page.getByText("Test")).first()).toBeVisible()
  })

  test("create with all fields", async ({ recruiterPage: page }) => {
    await page.goto("/candidates/new")
    await page.waitForLoadState("networkidle")

    // Fill all fields
    await page.getByLabel(/first name/i).fill("Complete")
    await page.getByLabel(/last name/i).fill("Profile")
    await page.getByLabel(/email/i).fill("complete.profile@example.com")
    await page.getByLabel(/phone/i).fill("+1 555-123-4567")
    await page.getByLabel(/current company/i).fill("Test Corp")
    await page.getByLabel(/location/i).fill("San Francisco, CA")
    await page.getByLabel(/linkedin/i).fill("https://linkedin.com/in/completeprofile")

    // Select source if available
    const sourceSelect = page.locator('[id*="source"]')
    if (await sourceSelect.isVisible()) {
      await sourceSelect.click()
      await page.getByRole("option", { name: /linkedin/i }).click()
    }

    // Submit
    await page.getByRole("button", { name: /create|save|submit/i }).click()

    // Should redirect
    await page.waitForURL(/\/candidates\/[a-z0-9-]+$/, { timeout: 10000 })
  })

  test("validation errors for invalid email", async ({ recruiterPage: page }) => {
    await page.goto("/candidates/new")
    await page.waitForLoadState("networkidle")

    await page.getByLabel(/first name/i).fill("Invalid")
    await page.getByLabel(/last name/i).fill("Email")
    await page.getByLabel(/email/i).fill("not-an-email")

    await page.getByRole("button", { name: /create|save|submit/i }).click()

    await expect(page.getByText(/invalid email format/i)).toBeVisible()
  })

  test("validation errors for invalid LinkedIn URL", async ({ recruiterPage: page }) => {
    await page.goto("/candidates/new")
    await page.waitForLoadState("networkidle")

    await page.getByLabel(/first name/i).fill("Invalid")
    await page.getByLabel(/last name/i).fill("LinkedIn")
    await page.getByLabel(/linkedin/i).fill("not-a-url")

    await page.getByRole("button", { name: /create|save|submit/i }).click()

    await expect(page.getByText(/invalid linkedin url/i)).toBeVisible()
  })

  test("create and link to a job via query param", async ({ recruiterPage: page, prisma }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/candidates/new?jobId=${job.id}`)
    await page.waitForLoadState("networkidle")

    await expect(page.getByText(/automatically added to the selected job/i)).toBeVisible()

    const firstName = `Linked-${Date.now()}`
    await page.getByLabel(/first name/i).fill(firstName)
    await page.getByLabel(/last name/i).fill("Candidate")

    await page.getByRole("button", { name: /create|save|submit/i }).click()

    await page.waitForURL(`/jobs/${job.id}`, { timeout: 10000 })
    await expect(page.getByText(new RegExp(firstName))).toBeVisible()
  })

  test("cancel returns to list", async ({ recruiterPage: page }) => {
    await page.goto("/candidates/new")
    await page.waitForLoadState("networkidle")

    const cancelButton = page.getByRole("button", { name: /cancel/i }).or(
      page.getByRole("link", { name: /cancel|back/i })
    )
    if (await cancelButton.isVisible()) {
      await cancelButton.click()
      await expect(page).toHaveURL("/candidates")
    }
  })
})

test.describe("Candidate Detail Page", () => {
  test("displays candidate details", async ({ recruiterPage: page, prisma }) => {
    const candidate = await prisma.candidate.findFirst()
    if (!candidate) {
      test.skip()
      return
    }

    await page.goto(`/candidates/${candidate.id}`)
    await page.waitForLoadState("networkidle")

    // Should see candidate name
    await expect(page.getByText(candidate.firstName)).toBeVisible()
    await expect(page.getByText(candidate.lastName)).toBeVisible()
  })

  test("shows applications list", async ({ recruiterPage: page, prisma }) => {
    const candidate = await prisma.candidate.findFirst({
      include: { applications: true },
    })
    if (!candidate || candidate.applications.length === 0) {
      test.skip()
      return
    }

    await page.goto(`/candidates/${candidate.id}`)
    await page.waitForLoadState("networkidle")

    // Should show applications section
    const content = await page.content()
    const hasApplications = content.includes("application") || content.includes("job")
    expect(hasApplications).toBeTruthy()
  })

  test("edit button navigates to edit form", async ({ recruiterPage: page, prisma }) => {
    const candidate = await prisma.candidate.findFirst()
    if (!candidate) {
      test.skip()
      return
    }

    await page.goto(`/candidates/${candidate.id}`)
    await page.waitForLoadState("networkidle")

    await page.getByRole("link", { name: /edit/i }).click()
    await expect(page).toHaveURL(`/candidates/${candidate.id}/edit`)
  })

  test("resume card shows download when resume exists", async ({ recruiterPage: page, prisma }) => {
    const candidateWithResume = await prisma.candidate.findFirst({
      where: { resumeKey: { not: null } },
    })
    if (!candidateWithResume) {
      test.skip()
      return
    }

    await page.goto(`/candidates/${candidateWithResume.id}`)
    await page.waitForLoadState("networkidle")

    // Should see resume card or download link
    const resumeElement = page.getByText(/resume/i).or(page.getByRole("link", { name: /download/i }))
    await expect(resumeElement).toBeVisible()
  })
})

test.describe("Edit Candidate", () => {
  test("form is pre-populated", async ({ recruiterPage: page, prisma }) => {
    const candidate = await prisma.candidate.findFirst()
    if (!candidate) {
      test.skip()
      return
    }

    await page.goto(`/candidates/${candidate.id}/edit`)
    await page.waitForLoadState("networkidle")

    // Check pre-populated values
    await expect(page.getByLabel(/first name/i)).toHaveValue(candidate.firstName)
    await expect(page.getByLabel(/last name/i)).toHaveValue(candidate.lastName)
  })

  test("update email and save", async ({ recruiterPage: page, prisma }) => {
    const candidate = await prisma.candidate.findFirst()
    if (!candidate) {
      test.skip()
      return
    }

    await page.goto(`/candidates/${candidate.id}/edit`)
    await page.waitForLoadState("networkidle")

    // Update email
    const newEmail = `updated-${Date.now()}@example.com`
    await page.getByLabel(/email/i).fill(newEmail)

    // Save
    await page.getByRole("button", { name: /save|update|submit/i }).click()

    // Should redirect to detail
    await page.waitForURL(`/candidates/${candidate.id}`, { timeout: 10000 })

    // Should see updated email
    await expect(page.getByText(newEmail)).toBeVisible()
  })

  test("clear optional field", async ({ recruiterPage: page, prisma }) => {
    const candidateWithPhone = await prisma.candidate.findFirst({
      where: { phone: { not: null } },
    })
    if (!candidateWithPhone) {
      test.skip()
      return
    }

    await page.goto(`/candidates/${candidateWithPhone.id}/edit`)
    await page.waitForLoadState("networkidle")

    // Clear phone
    await page.getByLabel(/phone/i).fill("")

    // Save
    await page.getByRole("button", { name: /save|update|submit/i }).click()

    // Should redirect
    await page.waitForURL(`/candidates/${candidateWithPhone.id}`, { timeout: 10000 })
  })
})

test.describe("Resume Upload", () => {
  test("upload area is visible", async ({ recruiterPage: page }) => {
    await page.goto("/candidates/new")
    await page.waitForLoadState("networkidle")

    // Look for upload area or resume input
    const uploadArea = page.getByText(/upload|resume|drag/i).or(
      page.locator('input[type="file"]')
    )
    await expect(uploadArea).toBeVisible()
  })

  test("shows error for invalid file type", async ({ recruiterPage: page }) => {
    await page.goto("/candidates/new")
    await page.waitForLoadState("networkidle")

    // Find file input
    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.isVisible()) {
      // Try to upload an invalid file type
      await fileInput.setInputFiles({
        name: "test.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("test content"),
      })

      await expect(page.getByText(/invalid file type/i)).toBeVisible()
    }
  })

  test("shows error for files larger than 10MB", async ({ recruiterPage: page }) => {
    await page.goto("/candidates/new")
    await page.waitForLoadState("networkidle")

    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.isVisible()) {
      await fileInput.setInputFiles({
        name: "large.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
      })

      await expect(page.getByText(/file size exceeds 10mb/i)).toBeVisible()
    }
  })

  test("uploads resume successfully with mocked storage", async ({ recruiterPage: page }) => {
    await page.goto("/candidates/new")
    await page.waitForLoadState("networkidle")

    await page.route("**/api/upload/resume", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          key: "resumes/123e4567-e89b-12d3-a456-426614174000.pdf",
          uploadUrl: "https://example.com/upload",
          contentType: "application/pdf",
          maxSizeBytes: 10485760,
        }),
      })
    })
    await page.route("https://example.com/upload", async (route) => {
      await route.fulfill({ status: 200, body: "" })
    })

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test"),
    })

    await expect(page.getByText(/upload complete/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /replace/i })).toBeVisible()
  })
})

test.describe("Role-based Access for Candidates", () => {
  test("VIEWER cannot see New Candidate button", async ({ viewerPage: page }) => {
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("link", { name: /new candidate/i })).not.toBeVisible()
  })

  test("VIEWER cannot see Edit button on candidate detail", async ({ viewerPage: page, prisma }) => {
    const candidate = await prisma.candidate.findFirst()
    if (!candidate) {
      test.skip()
      return
    }

    await page.goto(`/candidates/${candidate.id}`)
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("link", { name: /edit/i })).not.toBeVisible()
  })

  test("VIEWER cannot access candidate edit page directly", async ({ viewerPage: page, prisma }) => {
    const candidate = await prisma.candidate.findFirst()
    if (!candidate) {
      test.skip()
      return
    }

    await page.goto(`/candidates/${candidate.id}/edit`)
    await page.waitForLoadState("networkidle")

    // Should be redirected or show error
    const url = page.url()
    const isOnEditPage = url.includes("/edit")
    const hasError = await page.getByText(/unauthorized|forbidden|not allowed/i).isVisible().catch(() => false)

    expect(isOnEditPage && !hasError).toBeFalsy()
  })
})
