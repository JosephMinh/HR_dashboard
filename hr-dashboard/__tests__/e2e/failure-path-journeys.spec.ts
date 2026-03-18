/**
 * Failure-path E2E journey matrix.
 *
 * Covers operator-visible failure states for:
 * - invite delivery fallback + resend retry
 * - resend-invite rate limiting
 * - storage/upload configuration failure
 * - session loss after page load
 *
 * Bead: hr-kfwh.23.3
 */

import path from "node:path"

import type { Page } from "@playwright/test"
import { hash } from "bcryptjs"
import type { PrismaClient } from "@/generated/prisma/client"

import { test, expect } from "./fixtures"

const OUTBOX_PATH = "/api/test/email-outbox"
const FAILURE_PATH = "/api/test/runtime-failures"
const TEMP_PASSWORD = "TempFailureP@ss99!"
const PLAYWRIGHT_PORT = Number(process.env.PLAYWRIGHT_PORT ?? "3000")
const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PLAYWRIGHT_PORT}`

type CapturedEmail = {
  to: string
  subject: string
  html: string
  text: string | null
}

async function clearEmailOutbox(): Promise<void> {
  const response = await fetch(new URL(OUTBOX_PATH, PLAYWRIGHT_BASE_URL), {
    method: "DELETE",
  })
  expect(response.ok).toBeTruthy()
}

async function countEmails(recipient: string): Promise<number> {
  const response = await fetch(
    new URL(`${OUTBOX_PATH}?recipient=${encodeURIComponent(recipient)}`, PLAYWRIGHT_BASE_URL),
  )
  expect(response.ok).toBeTruthy()
  const data = (await response.json()) as { emails: CapturedEmail[] }
  return data.emails.length
}

async function fetchLatestEmail(recipient: string): Promise<CapturedEmail> {
  await expect
    .poll(() => countEmails(recipient), {
      timeout: 10_000,
      message: `waiting for email to ${recipient}`,
    })
    .toBeGreaterThan(0)

  const response = await fetch(
    new URL(`${OUTBOX_PATH}?recipient=${encodeURIComponent(recipient)}`, PLAYWRIGHT_BASE_URL),
  )
  expect(response.ok).toBeTruthy()
  const data = (await response.json()) as { emails: CapturedEmail[] }
  return data.emails[data.emails.length - 1]!
}

async function configureRuntimeFailures(body: Record<string, unknown>): Promise<void> {
  const response = await fetch(new URL(FAILURE_PATH, PLAYWRIGHT_BASE_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  expect(response.ok).toBeTruthy()
}

async function clearRuntimeFailures(): Promise<void> {
  const response = await fetch(new URL(FAILURE_PATH, PLAYWRIGHT_BASE_URL), {
    method: "DELETE",
  })
  expect(response.ok).toBeTruthy()
}

async function createPendingUser(prisma: PrismaClient, email: string, name: string) {
  const passwordHash = await hash(TEMP_PASSWORD, 10)
  return prisma.user.create({
    data: {
      name,
      email,
      role: "VIEWER",
      active: true,
      mustChangePassword: true,
      passwordHash,
    },
  })
}

async function deleteUserByEmail(prisma: PrismaClient, email: string): Promise<void> {
  await prisma.user.delete({ where: { email } }).catch(() => {})
}

async function getUserRow(adminPage: Page, email: string) {
  const row = adminPage.getByRole("row").filter({ hasText: email })
  await expect(row).toBeVisible({ timeout: 10_000 })
  return row
}

async function resendInviteFromRow(
  adminPage: Page,
  email: string,
): Promise<void> {
  const row = await getUserRow(adminPage, email)
  await row.getByRole("button", { name: /resend invite/i }).click()
  await expect(adminPage.getByText("Resend invite?")).toBeVisible({ timeout: 5_000 })
  await adminPage.getByRole("dialog").getByRole("button", { name: /^resend invite$/i }).click()
}

test.describe("Failure-path journeys", () => {
  test.describe.configure({ mode: "serial" })

  const testResumePath = path.join(__dirname, "fixtures", "test-resume.pdf")

  test.beforeEach(async () => {
    await clearRuntimeFailures()
    await clearEmailOutbox()
  })

  test.afterEach(async () => {
    await clearRuntimeFailures()
  })

  test("create user shows manual setup fallback when invite delivery fails, then resend invite succeeds", async ({
    page,
    loginAs,
    prisma,
  }) => {
    await loginAs(page, "ADMIN")
    const adminPage = page
    const email = `e2e-invite-failure-${Date.now()}@hrtest.local`
    const name = "E2E Invite Failure"

    try {
      await configureRuntimeFailures({
        email: {
          mode: "reject",
          match: { to: email },
        },
      })

      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      await expect(
        adminPage.getByRole("heading", { name: "User Management", exact: true }),
      ).toBeVisible()

      await adminPage.getByRole("button", { name: /new user/i }).click()
      await adminPage.fill("#create-name", name)
      await adminPage.fill("#create-email", email)
      await adminPage.selectOption("#create-role", "VIEWER")
      await adminPage.getByRole("button", { name: /^create user$/i }).click()

      await expect(
        adminPage.getByText(
          "User created, but the invite email could not be sent. Share the setup link manually.",
        ),
      ).toBeVisible({ timeout: 10_000 })
      await expect(adminPage.getByText(/set-password\?token=/)).toBeVisible()
      expect(await countEmails(email)).toBe(0)

      await configureRuntimeFailures({ email: null })
      await resendInviteFromRow(adminPage, email)

      await expect(adminPage.getByText("Onboarding invite resent successfully.")).toBeVisible({
        timeout: 10_000,
      })

      const inviteEmail = await fetchLatestEmail(email)
      expect(inviteEmail.subject).toBe("You're invited to HR Dashboard")
    } finally {
      await deleteUserByEmail(prisma, email)
    }
  })

  test("resend invite surfaces rate-limit warning after repeated attempts", async ({
    page,
    loginAs,
    prisma,
  }) => {
    await loginAs(page, "ADMIN")
    const adminPage = page
    const email = `e2e-rate-limit-${Date.now()}@hrtest.local`
    await createPendingUser(prisma, email, "E2E Rate Limit")

    try {
      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await resendInviteFromRow(adminPage, email)
        await expect(adminPage.getByText("Onboarding invite resent successfully.")).toBeVisible({
          timeout: 10_000,
        })
      }

      await expect
        .poll(() => countEmails(email), {
          timeout: 10_000,
          message: `waiting for all resend invite emails to reach ${email}`,
        })
        .toBe(5)

      await resendInviteFromRow(adminPage, email)
      const row = await getUserRow(adminPage, email)
      await expect(row.getByText("Too many requests")).toBeVisible({ timeout: 10_000 })
      expect(await countEmails(email)).toBe(5)
    } finally {
      await deleteUserByEmail(prisma, email)
    }
  })

  test("resume upload shows storage-unavailable error and leaves candidate unchanged", async ({
    page,
    loginAs,
    prisma,
  }) => {
    await loginAs(page, "RECRUITER")
    const recruiterPage = page
    const candidate = await prisma.candidate.create({
      data: {
        firstName: "Storage",
        lastName: "Failure",
        email: `e2e-storage-${Date.now()}@example.com`,
        source: "OTHER",
      },
    })

    try {
      await recruiterPage.route("**/api/upload/resume", async (route) => {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Resume storage is temporarily unavailable" }),
        })
      })

      await recruiterPage.goto(`/candidates/${candidate.id}`, { waitUntil: "domcontentloaded" })
      await recruiterPage.waitForLoadState("networkidle")

      const uploadButton = recruiterPage.getByRole("button", { name: /upload resume/i })
      await uploadButton.scrollIntoViewIfNeeded()
      await uploadButton.click()

      const fileInput = recruiterPage.locator('input[type="file"]').first()
      await expect(fileInput).toBeAttached()
      await fileInput.setInputFiles(testResumePath)

      const uploadErrorAlert = recruiterPage
        .getByRole("alert")
        .filter({ hasText: /resume storage is temporarily unavailable/i })
        .filter({ has: recruiterPage.getByRole("button", { name: /retry upload/i }) })
      await expect(uploadErrorAlert).toBeVisible({ timeout: 10_000 })

      const unchangedCandidate = await prisma.candidate.findUnique({
        where: { id: candidate.id },
        select: { resumeKey: true, resumeName: true },
      })
      expect(unchangedCandidate?.resumeKey).toBeNull()
      expect(unchangedCandidate?.resumeName).toBeNull()
    } finally {
      await prisma.candidate.delete({ where: { id: candidate.id } }).catch(() => {})
    }
  })

  test("session loss after page load surfaces unauthorized on resend invite", async ({
    page,
    loginAs,
    prisma,
  }) => {
    await loginAs(page, "ADMIN")
    const adminPage = page
    const email = `e2e-session-loss-${Date.now()}@hrtest.local`
    await createPendingUser(prisma, email, "E2E Session Loss")

    try {
      await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
      const row = await getUserRow(adminPage, email)

      await adminPage.context().clearCookies()

      await resendInviteFromRow(adminPage, email)
      await expect(row.getByText("Unauthorized")).toBeVisible({ timeout: 10_000 })
    } finally {
      await deleteUserByEmail(prisma, email)
    }
  })
})
