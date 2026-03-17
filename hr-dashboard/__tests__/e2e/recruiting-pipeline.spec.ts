/**
 * E2E Tests: Full-Stack Recruiting Pipeline Journey
 *
 * Covers the highest-value recruiting workflow end to end:
 *   Job creation → Candidate creation → Application lifecycle →
 *   Stage advancement → Dashboard effect verification →
 *   Resume upload/download
 *
 * Tests here focus on cross-entity interactions and workflow sequences
 * that are not covered by the individual feature specs (jobs, candidates,
 * applications, dashboard, resume-upload).
 *
 * Bead: hr-kfwh.23.2
 */

import { test, expect } from "./fixtures"
import path from "path"
import fs from "fs"
import { ApplicationStage } from "@/generated/prisma/client"

const storageConfigured = Boolean(
  process.env.STORAGE_BUCKET &&
    (
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
      !process.env.STORAGE_ENDPOINT
    )
)

const INACTIVE_STAGES = [ApplicationStage.REJECTED, ApplicationStage.WITHDRAWN]

function suffix() {
  return Date.now()
}

// =====================================================================
// 1. Complete Pipeline Workflow
// =====================================================================

test.describe("Complete Pipeline Workflow", () => {
  test("create job and verify it appears on dashboard and jobs list", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const title = `Pipeline Journey Job ${suffix()}`

    // Snapshot open-jobs count before
    const openBefore = await prisma.job.count({ where: { status: "OPEN" } })
    logger.info("Open jobs before", { openBefore })

    // Create job via UI
    await page.goto("/jobs/new")
    await page.waitForLoadState("networkidle")

    await page.getByLabel(/title/i).fill(title)
    await page.getByLabel(/description/i).fill(
      "Full-stack pipeline journey test job for E2E coverage."
    )
    await page.locator('[id*="department"]').click()
    await page.getByRole("option", { name: "Engineering" }).click()

    logger.info("Submitting job create form", { title })
    await page.getByRole("button", { name: /create|save|submit/i }).click()

    // Redirect to job detail
    await page.waitForURL(/\/jobs\/[a-z0-9-]+$/, { timeout: 10_000 })
    logger.info("Landed on job detail", { url: page.url() })
    await expect(page.getByText(title)).toBeVisible()

    // DB confirms the job exists
    const job = await prisma.job.findFirst({ where: { title } })
    expect(job).not.toBeNull()
    expect(job!.status).toBe("OPEN")
    logger.info("Job confirmed in DB", { id: job!.id })

    // Dashboard reflects the new open job
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    const openCard = page.locator('[data-slot="card"]').filter({
      has: page.getByText("Open Jobs"),
    })
    await expect(openCard.getByText(String(openBefore + 1))).toBeVisible()
    logger.info("Dashboard open-jobs count verified", { expected: openBefore + 1 })

    // Jobs list shows the new job
    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")
    await page.getByPlaceholder("Search jobs...").fill(title.slice(0, 20))
    await page.waitForTimeout(500)
    await expect(page.getByText(title)).toBeVisible()
    logger.info("Job visible in jobs list")
  })

  test("create candidate via UI form and verify in candidates list", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const s = suffix()
    const firstName = `PipelineFirst${s}`
    const lastName = `PipelineLast${s}`
    const email = `pipeline${s}@example.com`

    await page.goto("/candidates/new")
    await page.waitForLoadState("networkidle")

    await page.getByLabel(/first name/i).fill(firstName)
    await page.getByLabel(/last name/i).fill(lastName)
    await page.getByLabel(/email/i).fill(email)

    logger.info("Submitting candidate form", { firstName, lastName, email })
    await page.getByRole("button", { name: /create|save|submit/i }).click()

    // Redirect to candidate detail
    await page.waitForURL(/\/candidates\/[a-z0-9-]+$/, { timeout: 10_000 })
    logger.info("Landed on candidate detail", { url: page.url() })
    await expect(page.getByText(firstName).or(page.getByText(`${firstName} ${lastName}`))).toBeVisible()

    // DB confirms
    const candidate = await prisma.candidate.findFirst({ where: { email } })
    expect(candidate).not.toBeNull()
    logger.info("Candidate confirmed in DB", { id: candidate!.id })

    // Candidate appears in search
    await page.goto("/candidates")
    await page.waitForLoadState("networkidle")
    await page.getByPlaceholder(/search/i).fill(firstName)
    await page.waitForTimeout(500)
    await expect(page.getByText(new RegExp(firstName))).toBeVisible()
    logger.info("Candidate visible in candidates list")
  })

  test("attach candidate to job via dialog and advance through all active stages", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const s = suffix()

    // Seed job and candidate for a clean, deterministic setup
    const job = await prisma.job.create({
      data: {
        title: `Stage Journey Job ${s}`,
        department: "Engineering",
        description: "Stage advancement journey test",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    const candidate = await prisma.candidate.create({
      data: {
        firstName: `StageFirst${s}`,
        lastName: `StageLast${s}`,
        email: `stage${s}@example.com`,
      },
    })

    logger.info("Test data seeded", { jobId: job.id, candidateId: candidate.id })

    // Navigate to job detail and open add-candidate dialog
    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    await page.getByRole("button", { name: /add candidate/i }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    // Search for candidate in dialog
    await dialog.getByPlaceholder(/search by name or email/i).fill(candidate.firstName)
    await page.waitForTimeout(400)
    logger.info("Searched for candidate in dialog")

    // Select the candidate
    await dialog
      .getByRole("button", { name: new RegExp(`${candidate.firstName} ${candidate.lastName}`) })
      .click()

    // Application row should appear
    const candidateFullName = `${candidate.firstName} ${candidate.lastName}`
    const row = page.getByRole("row", { name: new RegExp(candidateFullName) })
    await expect(row).toBeVisible()
    logger.info("Application row visible after attaching candidate")

    // Verify DB: application created in NEW stage
    const application = await prisma.application.findFirst({
      where: { jobId: job.id, candidateId: candidate.id },
    })
    expect(application).not.toBeNull()
    expect(application!.stage).toBe("NEW")
    logger.info("Application confirmed in DB", { stage: application!.stage })

    // NEW → SCREENING
    await row.getByRole("button", { name: /new/i }).click()
    await page.getByRole("button", { name: /screening/i }).click()
    await expect(row.getByText(/screening/i)).toBeVisible()
    logger.info("Stage advanced to SCREENING")

    // SCREENING → INTERVIEW
    await row.getByRole("button", { name: /screening/i }).click()
    await page.getByRole("button", { name: /interview/i }).click()
    await expect(row.getByText(/interview/i)).toBeVisible()
    logger.info("Stage advanced to INTERVIEW")

    // INTERVIEW → OFFER
    await row.getByRole("button", { name: /interview/i }).click()
    await page.getByRole("button", { name: /offer/i }).click()
    await expect(row.getByText(/offer/i)).toBeVisible()
    logger.info("Stage advanced to OFFER")

    // DB confirms final stage
    const updated = await prisma.application.findUnique({
      where: { id: application!.id },
    })
    expect(updated!.stage).toBe("OFFER")
    logger.info("Final stage confirmed in DB", { stage: updated!.stage })
  })
})

// =====================================================================
// 2. Dashboard Effects from Pipeline Changes
// =====================================================================

test.describe("Dashboard Reflects Pipeline Changes", () => {
  test("open jobs count increments when a new job is created", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const openBefore = await prisma.job.count({ where: { status: "OPEN" } })
    logger.info("Baseline open jobs", { openBefore })

    await prisma.job.create({
      data: {
        title: `Dashboard Open Job ${suffix()}`,
        department: "Operations",
        description: "Dashboard count verification job",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const openCard = page.locator('[data-slot="card"]').filter({
      has: page.getByText("Open Jobs"),
    })
    await expect(openCard.getByText(String(openBefore + 1))).toBeVisible()
    logger.info("Open Jobs count verified", { expected: openBefore + 1 })
  })

  test("active candidates count increments when new active application is added", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const activeBefore = await prisma.application
      .findMany({
        where: {
          job: { status: "OPEN" },
          stage: { notIn: INACTIVE_STAGES },
        },
        distinct: ["candidateId"],
        select: { candidateId: true },
      })
      .then((r) => r.length)

    logger.info("Baseline active candidates", { activeBefore })

    const s = suffix()
    const job = await prisma.job.create({
      data: {
        title: `Dashboard Active Cand Job ${s}`,
        department: "Engineering",
        description: "Active candidates count test",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    const candidate = await prisma.candidate.create({
      data: { firstName: `DashCand${s}`, lastName: "Test" },
    })

    await prisma.application.create({
      data: { jobId: job.id, candidateId: candidate.id, stage: "NEW" },
    })

    logger.info("Test data added", { jobId: job.id, candidateId: candidate.id })

    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const candidatesCard = page.locator('[data-slot="card"]').filter({
      has: page.getByText("Active Candidates"),
    })
    await expect(candidatesCard.getByText(String(activeBefore + 1))).toBeVisible()
    logger.info("Active Candidates count verified", { expected: activeBefore + 1 })
  })

  test("job candidate count on jobs list reflects applications", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const s = suffix()
    const job = await prisma.job.create({
      data: {
        title: `Candidate Count Job ${s}`,
        department: "Engineering",
        description: "Candidate count on list test",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    // Add 2 candidates
    const [c1, c2] = await Promise.all([
      prisma.candidate.create({ data: { firstName: `CountA${s}`, lastName: "Test" } }),
      prisma.candidate.create({ data: { firstName: `CountB${s}`, lastName: "Test" } }),
    ])

    await Promise.all([
      prisma.application.create({ data: { jobId: job.id, candidateId: c1.id, stage: "NEW" } }),
      prisma.application.create({ data: { jobId: job.id, candidateId: c2.id, stage: "SCREENING" } }),
    ])

    logger.info("Two applications created", { jobId: job.id })

    await page.goto("/jobs")
    await page.waitForLoadState("networkidle")

    // Search to isolate the specific job
    await page.getByPlaceholder("Search jobs...").fill(job.title.slice(0, 20))
    await page.waitForTimeout(500)

    const jobRow = page.getByRole("row", { name: new RegExp(job.title) })
    await expect(jobRow).toBeVisible()

    // The "Candidates" column should show 2
    await expect(jobRow.getByText("2")).toBeVisible()
    logger.info("Candidate count verified in jobs list", { expected: 2 })
  })
})

// =====================================================================
// 3. Create Candidate from Job Context (jobId pre-population)
// =====================================================================

test.describe("Create Candidate from Job Context", () => {
  test("create-new-candidate link from job pipeline dialog links back to job", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const job = await prisma.job.create({
      data: {
        title: `Context Job ${suffix()}`,
        department: "Engineering",
        description: "Create candidate from job context test",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    // Open add-candidate dialog
    await page.getByRole("button", { name: /add candidate/i }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    // Search for something that yields no results
    await dialog.getByPlaceholder(/search by name or email/i).fill("zzznomatch")
    await page.waitForTimeout(400)
    await expect(dialog.getByText(/no candidates found/i)).toBeVisible()

    // Click "Create New Candidate" link inside the dialog
    await dialog.getByRole("button", { name: /create new candidate/i }).click()

    // Should navigate to /candidates/new?jobId=...
    await expect(page).toHaveURL(new RegExp(`/candidates/new\\?jobId=${job.id}`))
    logger.info("Navigated to candidate creation with jobId context", { jobId: job.id })
  })

  test("candidate created via job context is immediately linked to job", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const s = suffix()
    const firstName = `CtxFirst${s}`
    const lastName = `CtxLast${s}`

    const job = await prisma.job.create({
      data: {
        title: `Context Link Job ${s}`,
        department: "Engineering",
        description: "Candidate created from job context should be linked",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    // Navigate directly to the create-candidate-with-context URL
    await page.goto(`/candidates/new?jobId=${job.id}`)
    await page.waitForLoadState("networkidle")

    await page.getByLabel(/first name/i).fill(firstName)
    await page.getByLabel(/last name/i).fill(lastName)

    logger.info("Creating candidate with jobId context", { firstName, jobId: job.id })
    await page.getByRole("button", { name: /create|save|submit/i }).click()

    // After creation, should end up on the job detail or candidate detail page
    await page.waitForURL(/\/(?:jobs|candidates)\/[a-z0-9-]+/, { timeout: 10_000 })
    logger.info("Redirected after creation", { url: page.url() })

    // Verify application was created linking candidate to job
    const candidate = await prisma.candidate.findFirst({
      where: { firstName, lastName },
    })
    expect(candidate).not.toBeNull()

    const application = await prisma.application.findFirst({
      where: { jobId: job.id, candidateId: candidate!.id },
    })
    expect(application).not.toBeNull()
    expect(application!.stage).toBe("NEW")
    logger.info("Candidate linked to job via application", {
      candidateId: candidate!.id,
      applicationId: application!.id,
    })
  })
})

// =====================================================================
// 4. Resume Upload in Pipeline Context
// =====================================================================

test.describe("Resume Upload in Pipeline Context", () => {
  const fixturesDir = path.join(__dirname, "fixtures")
  const testResumePath = path.join(fixturesDir, "test-resume.pdf")

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
        "utf-8"
      )
      fs.writeFileSync(testResumePath, minimalPDF)
    }
  })

  test("candidate detail page shows resume upload area", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    const s = suffix()
    const candidate = await prisma.candidate.create({
      data: {
        firstName: `ResumeArea${s}`,
        lastName: "Test",
        email: `resumearea${s}@example.com`,
      },
    })

    await page.goto(`/candidates/${candidate.id}`)
    await page.waitForLoadState("networkidle")
    logger.info("Navigated to candidate detail", { candidateId: candidate.id })

    // The candidate detail page should have a resume upload section
    const resumeSection = page
      .locator('[data-testid="resume-card"], .resume-upload, [class*="resume"]')
      .or(page.locator('input[type="file"]'))

    await expect(resumeSection.first()).toBeVisible({ timeout: 5_000 })
    logger.info("Resume upload area visible")
  })

  test("upload resume to candidate profile and verify persistence", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    test.skip(!storageConfigured, "Skipping: Storage not configured")

    const s = suffix()
    const candidate = await prisma.candidate.create({
      data: {
        firstName: `ResumeUpload${s}`,
        lastName: "Test",
        email: `resumeupload${s}@example.com`,
      },
    })

    await page.goto(`/candidates/${candidate.id}`)
    await page.waitForLoadState("networkidle")

    const fileInput = page.locator('input[type="file"]')
    if ((await fileInput.count()) === 0) {
      logger.info("No file input found; skipping")
      test.skip()
      return
    }

    await fileInput.setInputFiles(testResumePath)
    logger.info("Resume file attached", { path: testResumePath })

    // Wait for upload confirmation
    const successIndicator = page.locator(
      '[data-testid="upload-success"], .upload-success, :text("uploaded"), :text("success")'
    )
    await expect(successIndicator.first()).toBeVisible({ timeout: 15_000 })
    logger.info("Upload success indicator visible")

    // Download link should appear
    const downloadLink = page.locator(
      'a[download], [data-testid="download-resume"], :text("download")'
    )
    await expect(downloadLink.first()).toBeVisible({ timeout: 5_000 })
    logger.info("Download link visible")

    // DB confirms resume key was saved
    const updated = await prisma.candidate.findUnique({ where: { id: candidate.id } })
    expect(updated!.resumeKey).not.toBeNull()
    logger.info("Resume key confirmed in DB", { resumeKey: updated!.resumeKey })
  })

  test("candidate with resume shows resume info in job pipeline row", async ({
    recruiterPage: page,
    prisma,
    logger,
  }) => {
    test.skip(!storageConfigured, "Skipping: Storage not configured")

    const s = suffix()
    const job = await prisma.job.create({
      data: {
        title: `Resume Pipeline Job ${s}`,
        department: "Engineering",
        description: "Resume in pipeline row test",
        status: "OPEN",
        pipelineHealth: "ON_TRACK",
      },
    })

    const candidate = await prisma.candidate.create({
      data: {
        firstName: `ResumePipeFirst${s}`,
        lastName: "Test",
        email: `resumepipe${s}@example.com`,
        resumeKey: `resumes/test-${s}.pdf`,
        resumeName: "test-resume.pdf",
      },
    })

    await prisma.application.create({
      data: { jobId: job.id, candidateId: candidate.id, stage: "NEW" },
    })

    logger.info("Seeded candidate with resume in job pipeline", {
      jobId: job.id,
      candidateId: candidate.id,
    })

    await page.goto(`/jobs/${job.id}`)
    await page.waitForLoadState("networkidle")

    const candidateRow = page.getByRole("row", {
      name: new RegExp(`${candidate.firstName} ${candidate.lastName}`),
    })
    await expect(candidateRow).toBeVisible()
    logger.info("Candidate row visible in pipeline")

    // Click through to candidate detail to verify resume is shown
    await candidateRow
      .getByRole("link", {
        name: new RegExp(`${candidate.firstName} ${candidate.lastName}`),
      })
      .click()

    await page.waitForURL(/\/candidates\/[a-z0-9-]+$/, { timeout: 10_000 })
    await page.waitForLoadState("networkidle")

    // Resume section should reference the uploaded file
    const resumeDisplay = page.locator(
      '[data-testid="resume-card"], .resume-display, :text("test-resume.pdf")'
    )
    await expect(resumeDisplay.first()).toBeVisible()
    logger.info("Resume info visible on candidate detail page")
  })
})
