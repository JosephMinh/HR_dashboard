/**
 * E2E Tests: Recruiting Pipeline Journey (hr-kfwh.23.2)
 *
 * Full-stack journey coverage for the candidate → job → application pipeline.
 * Closes P1-1 gaps identified in RISK_MATRIX.md:
 *   - Full lifecycle (create → all stages → hired → close job)
 *   - Backward stage transitions
 *   - Duplicate application prevention
 *   - Dashboard KPI reflection
 *   - Candidate deletion cascade to applications
 *   - Resume upload in pipeline (conditional on storage)
 *
 * All tests are self-contained: DB data created via prisma fixture or UI.
 */

import { test, expect } from "./fixtures"
import { type Page } from "@playwright/test"
import path from "path"
import fs from "fs"

// Unique suffix generator — prevents cross-test name collisions under parallel runs
function uid(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

// Storage configuration check (mirrors resume-upload.spec.ts)
const storageConfigured = Boolean(
  process.env.STORAGE_BUCKET &&
    (
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
      !process.env.STORAGE_ENDPOINT
    )
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a job via the UI form and return the new job's ID from the redirect URL.
 */
async function createJobViaUI(
  page: Page,
  opts: { title: string; description?: string; department?: string },
): Promise<string> {
  await page.goto("/jobs/new")
  await page.waitForLoadState("networkidle")

  await page.getByLabel("Title").fill(opts.title)
  await page.getByLabel("Description").fill(
    opts.description ?? "Full-stack E2E journey test job. Covers the complete hiring pipeline.",
  )

  // Open department select
  const deptTrigger = page.locator('[id*="department"]')
  await deptTrigger.click()
  await page.getByRole("option", { name: opts.department ?? "Engineering" }).click()

  await page.getByRole("button", { name: /create|save|submit/i }).click()

  // Redirect to /jobs/<id>
  await page.waitForURL(/\/jobs\/[a-z0-9-]+$/, { timeout: 15_000 })

  const url = page.url()
  const match = url.match(/\/jobs\/([^/?#]+)/)
  if (!match?.[1]) throw new Error(`Could not extract job ID from URL: ${url}`)
  return match[1]!
}

/**
 * Create a candidate via the UI form and return the new candidate's ID.
 */
async function createCandidateViaUI(
  page: Page,
  opts: { firstName: string; lastName: string; email?: string },
): Promise<string> {
  await page.goto("/candidates/new")
  await page.waitForLoadState("networkidle")

  await page.getByLabel("First Name").fill(opts.firstName)
  await page.getByLabel("Last Name").fill(opts.lastName)

  if (opts.email) {
    await page.getByLabel(/email/i).fill(opts.email)
  }

  await page.getByRole("button", { name: /create|save|submit/i }).click()

  // Redirect to /candidates/<id>
  await page.waitForURL(/\/candidates\/[a-z0-9-]+$/, { timeout: 15_000 })

  const url = page.url()
  const match = url.match(/\/candidates\/([^/?#]+)/)
  if (!match?.[1]) throw new Error(`Could not extract candidate ID from URL: ${url}`)
  return match[1]!
}

/**
 * Attach an existing candidate to a job using the "Add Candidate" dialog.
 * Assumes the page is currently on /jobs/<jobId>.
 */
async function attachCandidateViaDialog(
  page: Page,
  candidateFirstName: string,
  candidateFullName: string,
): Promise<void> {
  await page.getByRole("button", { name: /add candidate/i }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()

  const searchInput = dialog.getByPlaceholder(/search by name or email/i)
  await searchInput.fill(candidateFirstName)
  await page.waitForTimeout(450) // debounce

  await dialog.getByRole("button", { name: new RegExp(candidateFullName) }).click()

  // Dialog should close after selection
  await expect(dialog).not.toBeVisible({ timeout: 5_000 })
}

/**
 * Advance the stage for a candidate row via the stage dropdown.
 * The page must be on /jobs/<jobId>.
 */
async function advanceStage(
  page: Page,
  candidateFullName: string,
  targetStageLabel: string,
): Promise<void> {
  const row = page.locator('[data-testid="candidate-row"]').filter({
    has: page.getByRole("link", { name: new RegExp(candidateFullName) }),
  })

  const trigger = row.locator('[data-testid="stage-dropdown-trigger"]')
  await trigger.click()

  const dropdown = page.locator('[data-testid="stage-dropdown-content"]')
  await expect(dropdown).toBeVisible({ timeout: 5_000 })

  await dropdown.getByText(targetStageLabel, { exact: false }).click()

  // Wait for dropdown to close and row to update
  await expect(dropdown).not.toBeVisible({ timeout: 5_000 })
  await page.waitForTimeout(300) // brief settle for optimistic update
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("Recruiting Pipeline Journey", () => {
  // --------------------------------------------------------------------------
  // 1. FULL LIFECYCLE: create job → create candidate → attach → advance all
  //    hiring stages → verify DB state → close job
  // --------------------------------------------------------------------------
  test(
    "full pipeline lifecycle: job creation to hired candidate to job close",
    async ({ recruiterPage: page, prisma, logger }) => {
      const suffix = uid()
      const jobTitle = `Pipeline Journey Job ${suffix}`
      const firstName = `Journey-${suffix}`
      const lastName = "Candidate"
      const fullName = `${firstName} ${lastName}`

      // -- 1. Create job via UI --
      logger.info("Step 1: Create job via UI", { jobTitle })
      const jobId = await createJobViaUI(page, { title: jobTitle })
      logger.info("Job created", { jobId })

      // Verify job appears on detail page
      await page.goto(`/jobs/${jobId}`)
      await page.waitForLoadState("networkidle")
      await expect(page.getByText(jobTitle)).toBeVisible()

      // -- 2. Create candidate via UI --
      logger.info("Step 2: Create candidate via UI", { fullName })
      const candidateId = await createCandidateViaUI(page, {
        firstName,
        lastName,
        email: `journey-${suffix}@example.com`,
      })
      logger.info("Candidate created", { candidateId })

      // -- 3. Attach candidate to job via Add Candidate dialog --
      logger.info("Step 3: Attach candidate to job via dialog")
      await page.goto(`/jobs/${jobId}`)
      await page.waitForLoadState("networkidle")

      await attachCandidateViaDialog(page, firstName, fullName)

      // Candidate should appear in pipeline
      const candidateLink = page.getByRole("link", { name: new RegExp(fullName) })
      await expect(candidateLink).toBeVisible({ timeout: 10_000 })
      logger.info("Candidate appears in pipeline", { fullName })

      // Verify initial stage is NEW
      const row = page.locator('[data-testid="candidate-row"]').filter({
        has: page.getByRole("link", { name: new RegExp(fullName) }),
      })
      const trigger = row.locator('[data-testid="stage-dropdown-trigger"]')
      await expect(trigger).toContainText(/new/i)

      // -- 4. Advance through all stages in sequence --
      const stages = [
        "Screening",
        "Interviewing",
        "Final Round",
        "Offer",
        "Hired",
      ] as const

      for (const targetStage of stages) {
        logger.info(`Step 4: Advancing to ${targetStage}`)
        await advanceStage(page, fullName, targetStage)

        // Verify the dropdown trigger now reflects the new stage
        await expect(trigger).toContainText(new RegExp(targetStage, "i"), { timeout: 8_000 })
        logger.info(`Stage advanced to ${targetStage}`)
      }

      // -- 5. Verify final state in the database --
      logger.info("Step 5: Verify DB state")
      const application = await prisma.application.findFirst({
        where: { job: { id: jobId }, candidate: { id: candidateId } },
        select: { stage: true, stageUpdatedAt: true, jobId: true, candidateId: true },
      })

      expect(application).not.toBeNull()
      expect(application?.stage).toBe("HIRED")
      logger.info("DB state verified", { stage: application?.stage })

      // -- 6. Close the job via edit page --
      logger.info("Step 6: Close the job")
      await page.goto(`/jobs/${jobId}/edit`)
      await page.waitForLoadState("networkidle")

      // Select CLOSED status
      const statusSelect = page.locator('[id*="status"]')
      await statusSelect.click()
      await page.getByRole("option", { name: /closed/i }).click()

      await page.getByRole("button", { name: /save|update|submit/i }).click()
      await page.waitForURL(/\/jobs\/[a-z0-9-]+$/, { timeout: 10_000 })

      // Verify job is now closed
      const closedJob = await prisma.job.findUnique({
        where: { id: jobId },
        select: { status: true },
      })
      expect(closedJob?.status).toBe("CLOSED")
      logger.info("Job closed", { jobId, status: closedJob?.status })

      await logger.captureScreenshot(page, "pipeline-lifecycle-complete")
    },
  )

  // --------------------------------------------------------------------------
  // 2. BACKWARD STAGE TRANSITION
  //    RISK_MATRIX P1-1 gap: "No backward stage transition test"
  // --------------------------------------------------------------------------
  test("backward stage transition: OFFER → INTERVIEWING", async ({ recruiterPage: page, prisma, logger }) => {
    const suffix = uid()

    const job = await prisma.job.create({
      data: {
        title: `Backward Stage Job ${suffix}`,
        department: "Engineering",
        description: "Backward stage test",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    const candidate = await prisma.candidate.create({
      data: {
        firstName: `Backward-${suffix}`,
        lastName: "Candidate",
      },
    })

    await prisma.application.create({
      data: {
        jobId: job.id,
        candidateId: candidate.id,
        stage: "OFFER",
      },
    })

    const fullName = `${candidate.firstName} ${candidate.lastName}`

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    const row = page.locator('[data-testid="candidate-row"]').filter({
      has: page.getByRole("link", { name: new RegExp(fullName) }),
    })

    // Verify starting stage is OFFER
    const trigger = row.locator('[data-testid="stage-dropdown-trigger"]')
    await expect(trigger).toContainText(/offer/i)

    logger.info("Starting stage confirmed: OFFER")

    // Go backward: OFFER → INTERVIEWING
    await advanceStage(page, fullName, "Interviewing")
    await expect(trigger).toContainText(/interviewing/i, { timeout: 8_000 })
    logger.info("Backward transition: OFFER → INTERVIEWING confirmed in UI")

    // Verify DB reflects the backward transition
    const updated = await prisma.application.findFirst({
      where: { jobId: job.id, candidateId: candidate.id },
      select: { stage: true },
    })
    expect(updated?.stage).toBe("INTERVIEWING")
    logger.info("DB confirms backward stage transition", { stage: updated?.stage })
  })

  // --------------------------------------------------------------------------
  // 3. DUPLICATE APPLICATION PREVENTION
  //    RISK_MATRIX P1-1 side effect: "Duplicate application prevention"
  // --------------------------------------------------------------------------
  test("duplicate application prevented — same candidate cannot be added twice", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const suffix = uid()

    const job = await prisma.job.create({
      data: {
        title: `Dedupe Job ${suffix}`,
        department: "Engineering",
        description: "Duplicate application test",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    const candidate = await prisma.candidate.create({
      data: {
        firstName: `Dedupe-${suffix}`,
        lastName: "Candidate",
        email: `dedupe-${suffix}@example.com`,
      },
    })

    // Pre-create the first application
    await prisma.application.create({
      data: { jobId: job.id, candidateId: candidate.id, stage: "NEW" },
    })

    const fullName = `${candidate.firstName} ${candidate.lastName}`

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    // Candidate already in pipeline — should be visible
    await expect(page.getByRole("link", { name: new RegExp(fullName) })).toBeVisible()
    logger.info("First application confirmed visible")

    // Attempt to add the same candidate again via dialog
    await page.getByRole("button", { name: /add candidate/i }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    const searchInput = dialog.getByPlaceholder(/search by name or email/i)
    await searchInput.fill(candidate.firstName)
    await page.waitForTimeout(450)

    // The candidate should either not appear (filtered out as already applied)
    // or the UI should show an error / disabled state on selection attempt.
    // Either way: only ONE application should exist in the DB.
    const dialogResult = dialog.getByRole("button", { name: new RegExp(fullName) })
    if (await dialogResult.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Some implementations allow re-selection but reject via API — attempt it
      await dialogResult.click()
      // Wait to see if an error appears or dialog closes
      await page.waitForTimeout(500)
    }

    // Close dialog if still open
    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)

    // DB must still have exactly ONE application
    const count = await prisma.application.count({
      where: { jobId: job.id, candidateId: candidate.id },
    })
    expect(count).toBe(1)
    logger.info("Duplicate prevention confirmed", { applicationCount: count })
  })

  // --------------------------------------------------------------------------
  // 4. DASHBOARD KPI REFLECTION
  //    RISK_MATRIX P1-1 side effect: "Active candidate count reflects pipeline state"
  // --------------------------------------------------------------------------
  test("dashboard KPIs reflect open job and active candidate counts", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const suffix = uid()

    // -- Capture pre-test dashboard counts from DB --
    const openJobsBefore = await prisma.job.count({ where: { status: "OPEN" } })
    logger.info("Pre-test open jobs", { openJobsBefore })

    // -- Create a new OPEN job via DB --
    const job = await prisma.job.create({
      data: {
        title: `Dashboard KPI Job ${suffix}`,
        department: "Product",
        description: "Dashboard KPI test job",
        status: "OPEN",
        pipelineHealth: "AHEAD",
      },
    })

    // Create candidate and active application
    const candidate = await prisma.candidate.create({
      data: { firstName: `KPI-${suffix}`, lastName: "Test" },
    })
    await prisma.application.create({
      data: { jobId: job.id, candidateId: candidate.id, stage: "SCREENING" },
    })

    const openJobsAfter = await prisma.job.count({ where: { status: "OPEN" } })

    // -- Verify dashboard reflects the new open job count --
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const openCard = page.locator('[data-slot="card"]').filter({
      has: page.getByText("Open Jobs"),
    })
    await expect(openCard.getByText(String(openJobsAfter))).toBeVisible({ timeout: 8_000 })
    logger.info("Dashboard open jobs KPI matches DB", {
      displayed: openJobsAfter,
      openJobsBefore,
    })

    await logger.captureScreenshot(page, "dashboard-kpi-post-pipeline")

    // -- Close the job and verify KPI drops by 1 --
    await prisma.job.update({ where: { id: job.id }, data: { status: "CLOSED" } })

    await page.reload()
    await page.waitForLoadState("networkidle")

    const openJobsClosed = await prisma.job.count({ where: { status: "OPEN" } })
    await expect(openCard.getByText(String(openJobsClosed))).toBeVisible({ timeout: 8_000 })
    logger.info("Dashboard open jobs KPI updated after job closed", {
      displayed: openJobsClosed,
    })
  })

  // --------------------------------------------------------------------------
  // 5. CANDIDATE DELETION CASCADES TO APPLICATION REMOVAL
  //    RISK_MATRIX P0-4 gap: cascade after candidate delete
  // --------------------------------------------------------------------------
  test("deleting a candidate removes their application from the job pipeline", async ({
    adminPage: page,
    prisma,
    logger,
  }) => {
    const suffix = uid()

    const job = await prisma.job.create({
      data: {
        title: `Cascade Delete Job ${suffix}`,
        department: "Design",
        description: "Cascade delete test",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    const candidate = await prisma.candidate.create({
      data: {
        firstName: `Cascade-${suffix}`,
        lastName: "Delete",
        email: `cascade-${suffix}@example.com`,
      },
    })

    await prisma.application.create({
      data: { jobId: job.id, candidateId: candidate.id, stage: "SCREENING" },
    })

    const fullName = `${candidate.firstName} ${candidate.lastName}`

    // Verify candidate appears in job pipeline
    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("link", { name: new RegExp(fullName) })).toBeVisible()
    logger.info("Candidate visible in pipeline before delete")

    // Navigate to candidate detail and delete
    await page.goto(`/candidates/${candidate.id}`)
    await page.waitForLoadState("networkidle")

    const deleteButton = page.getByRole("button", { name: /delete/i })
    if (!(await deleteButton.isVisible({ timeout: 3_000 }).catch(() => false))) {
      // Admin delete may be on the edit page
      await page.goto(`/candidates/${candidate.id}/edit`)
      await page.waitForLoadState("networkidle")
    }

    const deleteBtn = page.getByRole("button", { name: /delete/i })
    if (!(await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      logger.info("Delete button not found — verifying via API directly")
      // Fall back: call API directly
      const response = await page.request.delete(`/api/candidates/${candidate.id}`)
      expect(response.status()).toBe(200)
    } else {
      await deleteBtn.click()
      // Confirm deletion if a dialog appears
      const confirmBtn = page.getByRole("button", { name: /confirm|delete|yes/i })
      if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmBtn.click()
      }
      // Should redirect away from candidate
      await page.waitForURL(/\/(candidates|jobs)/, { timeout: 10_000 })
    }

    logger.info("Candidate deleted")

    // Verify application cascade — DB check
    const applicationCount = await prisma.application.count({
      where: { candidateId: candidate.id },
    })
    expect(applicationCount).toBe(0)
    logger.info("DB confirms application cascade", { applicationCount })

    // Verify candidate no longer appears in job pipeline
    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")
    await expect(
      page.getByRole("link", { name: new RegExp(fullName) }),
    ).not.toBeVisible({ timeout: 5_000 })
    logger.info("Candidate no longer visible in job pipeline")
  })

  // --------------------------------------------------------------------------
  // 6. PIPELINE STAGE COUNTS IN JOB DETAIL
  //    Verify candidate row count matches application records for a job
  // --------------------------------------------------------------------------
  test("job pipeline table shows correct candidate count", async ({ recruiterPage: page, prisma, logger }) => {
    const suffix = uid()
    const count = 3

    const job = await prisma.job.create({
      data: {
        title: `Count Verify Job ${suffix}`,
        department: "Marketing",
        description: "Pipeline count verification",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    // Create multiple candidates and attach all to the same job
    const candidates = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        prisma.candidate.create({
          data: {
            firstName: `Count-${suffix}-${i}`,
            lastName: "Tester",
          },
        }),
      ),
    )

    await Promise.all(
      candidates.map((c) =>
        prisma.application.create({
          data: { jobId: job.id, candidateId: c.id, stage: "NEW" },
        }),
      ),
    )

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    // Wait for table to render
    await page.waitForSelector('[data-testid="candidate-row"]', { timeout: 10_000 })

    const rows = page.locator('[data-testid="candidate-row"]')
    const rowCount = await rows.count()

    // At minimum our 3 candidates should appear (others from seeded data may too)
    expect(rowCount).toBeGreaterThanOrEqual(count)
    logger.info("Candidate row count verified", { rowCount, expectedMin: count })

    // Each specific candidate we created should be present
    for (const c of candidates) {
      await expect(
        page.getByRole("link", { name: new RegExp(`${c.firstName} ${c.lastName}`) }),
      ).toBeVisible()
    }

    await logger.captureScreenshot(page, "pipeline-count-verify")
  })

  // --------------------------------------------------------------------------
  // 7. UNLINK (REMOVE) CANDIDATE FROM JOB
  //    Full confirm-dialog flow without deleting the candidate profile
  // --------------------------------------------------------------------------
  test("unlink candidate from job preserves candidate profile", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const suffix = uid()

    const job = await prisma.job.create({
      data: {
        title: `Unlink Preserve Job ${suffix}`,
        department: "Sales",
        description: "Unlink preserve test",
        status: "OPEN",
        pipelineHealth: "AHEAD",
      },
    })

    const candidate = await prisma.candidate.create({
      data: { firstName: `Unlink-${suffix}`, lastName: "Preserve" },
    })

    await prisma.application.create({
      data: { jobId: job.id, candidateId: candidate.id, stage: "INTERVIEWING" },
    })

    const fullName = `${candidate.firstName} ${candidate.lastName}`

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    const row = page.locator('[data-testid="candidate-row"]').filter({
      has: page.getByRole("link", { name: new RegExp(fullName) }),
    })
    await expect(row).toBeVisible()

    // Click the remove (trash) button within the row
    const removeButton = page.getByRole("button", { name: new RegExp(`remove.*${fullName}`, "i") })
    await removeButton.click()

    // Confirm dialog
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText(/remove candidate from job/i)).toBeVisible()

    await dialog.getByRole("button", { name: /remove from job/i }).click()

    logger.info("Candidate unlinked from job")

    // Candidate should no longer appear in pipeline
    await expect(
      page.getByRole("link", { name: new RegExp(fullName) }),
    ).not.toBeVisible({ timeout: 8_000 })

    // DB: application should be gone
    const appCount = await prisma.application.count({
      where: { jobId: job.id, candidateId: candidate.id },
    })
    expect(appCount).toBe(0)

    // But candidate profile still exists
    const candidateRecord = await prisma.candidate.findUnique({
      where: { id: candidate.id },
    })
    expect(candidateRecord).not.toBeNull()
    expect(candidateRecord?.id).toBe(candidate.id)

    logger.info("Candidate profile preserved after unlink", { candidateId: candidate.id })
  })

  // --------------------------------------------------------------------------
  // 8. CANDIDATE DETAIL PAGE — APPLICATION HISTORY
  //    Verify the "Pipeline Activity" section on the candidate profile
  // --------------------------------------------------------------------------
  test("candidate detail page shows application history with job link", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const suffix = uid()

    const job = await prisma.job.create({
      data: {
        title: `History Job ${suffix}`,
        department: "Finance",
        description: "Application history test",
        status: "OPEN",
        pipelineHealth: "BEHIND",
      },
    })

    const candidate = await prisma.candidate.create({
      data: {
        firstName: `History-${suffix}`,
        lastName: "Check",
        email: `history-${suffix}@example.com`,
      },
    })

    await prisma.application.create({
      data: { jobId: job.id, candidateId: candidate.id, stage: "FINAL_ROUND" },
    })

    await page.goto(`/candidates/${candidate.id}`)
    await page.waitForLoadState("networkidle")

    // Pipeline Activity section should be visible
    await expect(page.getByText("Pipeline Activity")).toBeVisible()

    // Job title should link back to the job
    const jobLink = page.getByRole("link", { name: new RegExp(`History Job ${suffix}`) })
    await expect(jobLink).toBeVisible()

    // Stage badge should show Final Round
    await expect(page.getByText(/final round/i)).toBeVisible()

    logger.info("Application history visible on candidate detail page")

    // Click through to the job from the candidate page
    await jobLink.click()
    await expect(page).toHaveURL(new RegExp(`/jobs/${job.id}`))
    logger.info("Job link from candidate detail navigates correctly")
  })

  // --------------------------------------------------------------------------
  // 9. RECRUITER-CREATED CANDIDATE LINKED TO JOB FROM CANDIDATES/NEW?jobId=
  //    The create-candidate form supports a linkedJobId — test this shortcut
  // --------------------------------------------------------------------------
  test("create candidate from job context links them automatically", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const suffix = uid()

    const job = await prisma.job.create({
      data: {
        title: `Context Link Job ${suffix}`,
        department: "Human Resources",
        description: "Context-linked candidate test",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    // Navigate to candidates/new with the job context
    await page.goto(`/candidates/new?jobId=${job.id}`)
    await page.waitForLoadState("networkidle")

    // The form should show the "creating candidate for a job" banner
    await expect(page.getByText(/creating candidate for a job/i)).toBeVisible()
    logger.info("Linked-job context banner visible")

    const suffix2 = uid()
    const firstName = `Linked-${suffix2}`
    const lastName = "Auto"

    await page.getByLabel("First Name").fill(firstName)
    await page.getByLabel("Last Name").fill(lastName)

    await page.getByRole("button", { name: /create|save|submit/i }).click()

    // Should redirect back to the job detail (with candidateAdded param)
    await page.waitForURL(new RegExp(`/jobs/${job.id}`), { timeout: 15_000 })
    logger.info("Redirected to job page after candidate creation")

    // Candidate should appear in the pipeline immediately
    await expect(
      page.getByRole("link", { name: new RegExp(`${firstName} ${lastName}`) }),
    ).toBeVisible({ timeout: 10_000 })

    logger.info("Context-linked candidate appears in job pipeline immediately", {
      candidate: `${firstName} ${lastName}`,
    })

    // Verify DB
    const application = await prisma.application.findFirst({
      where: {
        job: { id: job.id },
        candidate: { firstName },
      },
    })
    expect(application).not.toBeNull()
    expect(application?.stage).toBe("NEW")
    logger.info("DB confirms auto-linked application", { stage: application?.stage })
  })

  // --------------------------------------------------------------------------
  // 10. RESUME UPLOAD IN PIPELINE (conditional)
  //     Mirrors P0-4 from RISK_MATRIX. Skipped when storage not configured.
  // --------------------------------------------------------------------------
  test.describe("resume upload in recruiting pipeline", () => {
    // Create a minimal valid PDF fixture once
    const fixturesDir = path.join(__dirname, "fixtures")
    const testResumePath = path.join(fixturesDir, "test-pipeline-resume.pdf")

    test.beforeAll(async () => {
      if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true })
      }
      if (!fs.existsSync(testResumePath)) {
        const minimalPDF = Buffer.from(
          "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
            "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
            "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n" +
            "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n" +
            "0000000052 00000 n \n0000000101 00000 n \n" +
            "trailer<</Size 4/Root 1 0 R>>\nstartxref\n170\n%%EOF",
          "utf-8",
        )
        fs.writeFileSync(testResumePath, minimalPDF)
      }
    })

    test(
      "recruiter can upload resume during candidate creation and resume is visible on profile",
      async ({ recruiterPage: page, prisma, logger }) => {
        test.skip(!storageConfigured, "Skipping: Storage not configured")

        const suffix = uid()

        await page.goto("/candidates/new")
        await page.waitForLoadState("networkidle")

        await page.getByLabel("First Name").fill(`Resume-${suffix}`)
        await page.getByLabel("Last Name").fill("Upload")

        // Upload the resume
        const fileInput = page.locator('input[type="file"]')
        if (await fileInput.count() === 0) {
          logger.info("No file input found — skipping resume upload portion")
          return
        }

        await fileInput.setInputFiles(testResumePath)

        // Wait for upload confirmation indicator
        const uploadSuccess = page.locator(
          '[data-testid="upload-success"], .upload-success, :text("uploaded"), :text("resume")',
        )
        await expect(uploadSuccess.first()).toBeVisible({ timeout: 20_000 })
        logger.info("Resume upload confirmed")

        // Submit the form
        await page.getByRole("button", { name: /create|save|submit/i }).click()
        await page.waitForURL(/\/candidates\/[a-z0-9-]+$/, { timeout: 15_000 })

        const url = page.url()
        const match = url.match(/\/candidates\/([^/?#]+)/)
        if (!match) throw new Error(`Could not extract candidate ID from URL: ${url}`)
        const candidateId = match[1]

        // Verify resume key is stored in DB
        const candidateRecord = await prisma.candidate.findUnique({
          where: { id: candidateId },
          select: { resumeKey: true, resumeName: true },
        })
        expect(candidateRecord?.resumeKey).not.toBeNull()
        logger.info("Resume key stored in DB", { resumeKey: candidateRecord?.resumeKey })

        // Resume should be visible on the candidate profile
        await expect(page.locator('[data-testid="resume-card"], .resume-display, :text("resume")')).toBeVisible()
        logger.info("Resume visible on candidate profile")
      },
    )
  })
})
