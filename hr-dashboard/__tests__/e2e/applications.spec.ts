/**
 * E2E Tests: Application Pipeline Management
 */

import { test, expect } from "./fixtures"

function buildCandidateName() {
  return {
    firstName: `Pipeline-${Date.now()}`,
    lastName: "Candidate",
  }
}

test.describe("Application Pipeline", () => {
  test("add candidate dialog search states and create-new link", async ({ recruiterPage: page, prisma }) => {
    const job = await prisma.job.findFirst()
    if (!job) {
      test.skip()
      return
    }

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    const addButton = page.getByRole("button", { name: /add candidate/i })
    await addButton.click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/type at least 2 characters/i)).toBeVisible()

    const searchInput = dialog.getByPlaceholder(/search by name or email/i)
    await searchInput.fill("zz")
    await page.waitForTimeout(400)
    await expect(dialog.getByText(/no candidates found/i)).toBeVisible()

    await dialog.getByRole("button", { name: /create new candidate/i }).click()
    await expect(page).toHaveURL(new RegExp(`/candidates/new\?jobId=${job.id}`))
  })

  test("attach candidate to job via dialog", async ({ recruiterPage: page, prisma }) => {
    const job = await prisma.job.create({
      data: {
        title: `Pipeline Job ${Date.now()}`,
        department: "Engineering",
        description: "Pipeline job",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    const { firstName, lastName } = buildCandidateName()
    const candidate = await prisma.candidate.create({
      data: {
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}@example.com`,
      },
    })

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    await page.getByRole("button", { name: /add candidate/i }).click()

    const dialog = page.getByRole("dialog")
    const searchInput = dialog.getByPlaceholder(/search by name or email/i)
    await searchInput.fill(firstName)
    await page.waitForTimeout(400)

    await dialog.getByRole("button", { name: new RegExp(`${firstName} ${lastName}`) }).click()

    await expect(page.getByRole("link", { name: new RegExp(`${firstName} ${lastName}`) })).toBeVisible()
  })

  test("change application stage from NEW to SCREENING", async ({ recruiterPage: page, prisma, logger }) => {
    const job = await prisma.job.create({
      data: {
        title: `Stage Job ${Date.now()}`,
        department: "Engineering",
        description: "Stage job",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    const { firstName, lastName } = buildCandidateName()
    const candidate = await prisma.candidate.create({
      data: { firstName, lastName },
    })

    await prisma.application.create({
      data: {
        jobId: job.id,
        candidateId: candidate.id,
        stage: "NEW",
      },
    })

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    const row = page.getByRole("row", { name: new RegExp(`${firstName} ${lastName}`) })
    await expect(row).toBeVisible()

    await row.getByRole("button", { name: /new/i }).click()
    await page.getByRole("button", { name: /screening/i }).click()

    logger.info("Stage updated", { candidate: `${firstName} ${lastName}`, stage: "SCREENING" })

    await expect(row.getByText(/screening/i)).toBeVisible()
  })

  test("unlink candidate from job", async ({ recruiterPage: page, prisma, logger }) => {
    const job = await prisma.job.create({
      data: {
        title: `Unlink Job ${Date.now()}`,
        department: "Engineering",
        description: "Unlink job",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    const { firstName, lastName } = buildCandidateName()
    const candidate = await prisma.candidate.create({
      data: { firstName, lastName },
    })

    await prisma.application.create({
      data: {
        jobId: job.id,
        candidateId: candidate.id,
        stage: "NEW",
      },
    })

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    const row = page.getByRole("row", { name: new RegExp(`${firstName} ${lastName}`) })
    await expect(row).toBeVisible()

    const unlinkButton = row.locator("button").last()
    await unlinkButton.click()

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText(/remove candidate/i)).toBeVisible()

    await dialog.getByRole("button", { name: /remove/i }).click()

    logger.info("Candidate unlinked", { candidate: `${firstName} ${lastName}` })

    await expect(page.getByRole("link", { name: new RegExp(`${firstName} ${lastName}`) })).not.toBeVisible()
  })

  test("multiple candidates added rapidly all appear without refresh", async ({ recruiterPage: page, prisma, logger }) => {
    // Create a job with no candidates
    const job = await prisma.job.create({
      data: {
        title: `Rapid Add Job ${Date.now()}`,
        department: "Engineering",
        description: "Test rapid adding",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    // Create multiple candidates
    const candidates = await Promise.all([
      prisma.candidate.create({ data: { firstName: `Rapid-A-${Date.now()}`, lastName: "Test" } }),
      prisma.candidate.create({ data: { firstName: `Rapid-B-${Date.now()}`, lastName: "Test" } }),
      prisma.candidate.create({ data: { firstName: `Rapid-C-${Date.now()}`, lastName: "Test" } }),
    ])

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    // Add each candidate rapidly
    for (const candidate of candidates) {
      const fullName = `${candidate.firstName} ${candidate.lastName}`

      await page.getByRole("button", { name: /add candidate/i }).click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()

      const searchInput = dialog.getByPlaceholder(/search by name or email/i)
      await searchInput.fill(candidate.firstName)
      await page.waitForTimeout(400) // Wait for debounced search

      await dialog.getByRole("button", { name: new RegExp(fullName) }).click()

      // Dialog should close after selection
      await expect(dialog).not.toBeVisible()

      logger.info("Added candidate", { candidate: fullName })
    }

    // All three should be visible without refresh
    for (const candidate of candidates) {
      const fullName = `${candidate.firstName} ${candidate.lastName}`
      await expect(page.getByRole("link", { name: new RegExp(fullName) })).toBeVisible()
    }
  })

  test("candidate persists after navigating away and back", async ({ recruiterPage: page, prisma, logger }) => {
    const job = await prisma.job.create({
      data: {
        title: `Persist Job ${Date.now()}`,
        department: "Engineering",
        description: "Test persistence",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    const { firstName, lastName } = buildCandidateName()
    const candidate = await prisma.candidate.create({
      data: {
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}@example.com`,
      },
    })

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    // Add candidate
    await page.getByRole("button", { name: /add candidate/i }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByPlaceholder(/search by name or email/i).fill(firstName)
    await page.waitForTimeout(400)
    await dialog.getByRole("button", { name: new RegExp(`${firstName} ${lastName}`) }).click()

    // Verify appears immediately
    await expect(page.getByRole("link", { name: new RegExp(`${firstName} ${lastName}`) })).toBeVisible()
    logger.info("Candidate added and visible", { candidate: `${firstName} ${lastName}` })

    // Navigate away to jobs list
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Navigate back to job detail
    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    // Candidate should still be there (persisted to database)
    await expect(page.getByRole("link", { name: new RegExp(`${firstName} ${lastName}`) })).toBeVisible()
    logger.info("Candidate persisted after navigation", { candidate: `${firstName} ${lastName}` })
  })
})
