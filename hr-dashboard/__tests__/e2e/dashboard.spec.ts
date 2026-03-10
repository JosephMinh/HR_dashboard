/**
 * E2E Tests: Dashboard
 */

import { ApplicationStage } from "@/generated/prisma/client"
import { test, expect } from "./fixtures"

const INACTIVE_STAGES = [ApplicationStage.REJECTED, ApplicationStage.WITHDRAWN]

test.describe("Dashboard", () => {
  test("shows KPI cards matching database", async ({ recruiterPage: page, prisma, logger }) => {
    const [jobsOpen, jobsClosed, activeCriticalJobs] = await Promise.all([
      prisma.job.count({ where: { status: "OPEN" } }),
      prisma.job.count({ where: { status: "CLOSED" } }),
      prisma.job.count({ where: { status: "OPEN", isCritical: true } }),
    ])

    const activeCandidateIds = await prisma.application.findMany({
      where: {
        job: { status: "OPEN" },
        stage: { notIn: INACTIVE_STAGES },
      },
      distinct: ["candidateId"],
      select: { candidateId: true },
    })

    const activeCandidates = activeCandidateIds.length

    logger.info("KPI expected", {
      jobsOpen,
      jobsClosed,
      activeCriticalJobs,
      activeCandidates,
    })

    const loadStart = Date.now()
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    logger.info("Dashboard load timing", { durationMs: Date.now() - loadStart })
    await logger.captureScreenshot(page, "dashboard-layout")

    const openCard = page.locator('[data-slot="card"]').filter({
      has: page.getByText("Open Jobs"),
    })
    await expect(openCard.getByText(String(jobsOpen))).toBeVisible()

    const closedCard = page.locator('[data-slot="card"]').filter({
      has: page.getByText("Closed Jobs"),
    })
    await expect(closedCard.getByText(String(jobsClosed))).toBeVisible()

    const criticalCard = page.locator('[data-slot="card"]').filter({
      has: page.getByText("Critical Jobs"),
    })
    await expect(criticalCard.getByText(String(activeCriticalJobs))).toBeVisible()

    const candidatesCard = page.locator('[data-slot="card"]').filter({
      has: page.getByText("Active Candidates"),
    })
    await expect(candidatesCard.getByText(String(activeCandidates))).toBeVisible()
  })

  test("pipeline summary matches counts", async ({ recruiterPage: page, prisma, logger }) => {
    const [ahead, onTrack, behind] = await Promise.all([
      prisma.job.count({ where: { status: "OPEN", pipelineHealth: "AHEAD" } }),
      prisma.job.count({ where: { status: "OPEN", pipelineHealth: "ON_TRACK" } }),
      prisma.job.count({ where: { status: "OPEN", pipelineHealth: "BEHIND" } }),
    ])

    logger.info("Pipeline expected", { ahead, onTrack, behind })

    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const pipelineCard = page.locator('[data-slot="card"]').filter({
      has: page.getByText("Pipeline Health"),
    })

    await expect(pipelineCard.getByText(String(ahead))).toBeVisible()
    await expect(pipelineCard.getByText(String(onTrack))).toBeVisible()
    await expect(pipelineCard.getByText(String(behind))).toBeVisible()
  })

  test("critical jobs table links to job detail", async ({ recruiterPage: page, prisma }) => {
    const criticalJob = await prisma.job.findFirst({
      where: { status: "OPEN", isCritical: true },
    })
    if (!criticalJob) {
      test.skip()
      return
    }

    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const criticalSection = page.locator('[data-slot="card"]').filter({
      has: page.getByText("Critical Jobs"),
    })

    const jobLink = criticalSection.getByRole("link", { name: criticalJob.title })
    await expect(jobLink).toBeVisible()
    await jobLink.click()

    await expect(page).toHaveURL(`/jobs/${criticalJob.id}`)
  })

  test("all jobs table renders", async ({ recruiterPage: page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("heading", { name: /all jobs/i })).toBeVisible()
  })

  test("dashboard jobs search preserves rapid typing and can be cleared", async ({ recruiterPage: page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const searchInput = page.getByPlaceholder("Search jobs...")
    await searchInput.pressSequentially("operations manager", { delay: 10 })

    await expect(searchInput).toHaveValue("operations manager")

    const clearButton = page.getByRole("button", { name: "Clear search" })
    await expect(clearButton).toBeVisible()
    await clearButton.click()

    await expect(searchInput).toHaveValue("")
  })
})
