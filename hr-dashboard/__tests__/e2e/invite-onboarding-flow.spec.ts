import type { APIRequestContext } from "@playwright/test"
import { hash } from "bcryptjs"

import { test, expect } from "./fixtures"

const STRONG_PASSWORD = "NewSecureP@ss123!"
const OUTBOX_PATH = "/api/test/email-outbox"

type CapturedEmail = {
  to: string
  from: string
  subject: string
  html: string
  text: string | null
  sentAt: string
}

async function fetchInviteEmail(
  request: APIRequestContext,
  recipient: string,
): Promise<CapturedEmail> {
  const path = `${OUTBOX_PATH}?recipient=${encodeURIComponent(recipient)}`

  await expect
    .poll(
      async () => {
        const response = await request.get(path)
        if (!response.ok()) {
          return 0
        }

        const data = (await response.json()) as { emails: CapturedEmail[] }
        return data.emails.length
      },
      {
        message: `waiting for invite email for ${recipient}`,
        timeout: 10_000,
      },
    )
    .toBeGreaterThan(0)

  const response = await request.get(path)
  expect(response.ok()).toBeTruthy()

  const data = (await response.json()) as { emails: CapturedEmail[] }
  return data.emails[data.emails.length - 1]!
}

async function clearEmailOutbox(request: APIRequestContext): Promise<void> {
  const response = await request.delete(OUTBOX_PATH)
  expect(response.ok()).toBeTruthy()
}

function extractSetPasswordUrl(email: CapturedEmail): string {
  const content = `${email.text ?? ""}\n${email.html}`
  const match = content.match(
    /(https?:\/\/[^\s"'<>]+\/set-password\?token=[A-Za-z0-9_-]+|\/set-password\?token=[A-Za-z0-9_-]+)/,
  )

  if (!match) {
    throw new Error("Could not find a set-password link in the captured email")
  }

  return match[0]
}

test.describe("Invite Email Onboarding Flow", () => {
  test("admin creates user, invite email drives setup, and login is ungated", async ({
    adminPage,
    browser,
    prisma,
    request,
  }) => {
    const testEmail = `e2e-invite-${Date.now()}@hrtest.local`
    const testName = "E2E Invite User"

    await clearEmailOutbox(request)

    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await expect(adminPage.getByText("User Management")).toBeVisible()

    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", testName)
    await adminPage.fill("#create-email", testEmail)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /^create user$/i }).click()

    await expect(
      adminPage.getByText("User created. An onboarding invite email has been sent."),
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      adminPage.getByText(/temporary password|shown only once/i),
    ).not.toBeVisible()

    const pendingRow = adminPage.getByRole("row").filter({ hasText: testEmail })
    await expect(pendingRow).toBeVisible({ timeout: 10_000 })
    await expect(pendingRow.getByText("Pending Setup")).toBeVisible()

    const inviteEmail = await fetchInviteEmail(request, testEmail)
    expect(inviteEmail.to).toBe(testEmail)
    expect(inviteEmail.subject).toBe("You're invited to HR Dashboard")

    const setupUrl = extractSetPasswordUrl(inviteEmail)
    const newUserContext = await browser.newContext()
    const newUserPage = await newUserContext.newPage()

    try {
      await newUserPage.goto(setupUrl, { waitUntil: "domcontentloaded" })
      await expect(newUserPage.getByText("Set Your Password")).toBeVisible({
        timeout: 10_000,
      })
      await expect(newUserPage.getByText("Create your password")).toBeVisible()

      await newUserPage.fill("#newPassword", STRONG_PASSWORD)
      await newUserPage.fill("#confirmPassword", STRONG_PASSWORD)
      await newUserPage.getByRole("button", { name: /^set password$/i }).click()

      await expect(
        newUserPage.getByText("Password Set Successfully"),
      ).toBeVisible({ timeout: 10_000 })
      await newUserPage.getByRole("link", { name: /^sign in$/i }).click()
      await newUserPage.waitForURL(/\/login/, { timeout: 10_000 })

      await newUserPage.fill("#email", testEmail)
      await newUserPage.fill("#password", STRONG_PASSWORD)
      await newUserPage.getByRole("button", { name: /^sign in$/i }).click()

      await newUserPage.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 15_000,
      })
      await expect(newUserPage).not.toHaveURL(/\/settings\/password/)

      await newUserPage.goto("/jobs", { waitUntil: "domcontentloaded" })
      await expect(newUserPage).toHaveURL(/\/jobs/)

      const updatedUser = await prisma.user.findUnique({
        where: { email: testEmail },
        select: { mustChangePassword: true },
      })
      expect(updatedUser?.mustChangePassword).toBe(false)

      await adminPage.reload({ waitUntil: "domcontentloaded" })
      const completedRow = adminPage.getByRole("row").filter({ hasText: testEmail })
      await expect(completedRow).toBeVisible({ timeout: 10_000 })
      await expect(completedRow.getByText("Pending Setup")).toHaveCount(0)
    } finally {
      await newUserContext.close()
      await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
    }
  })
})

test.describe("Set-Password Error States", () => {
  test("shows error for missing token parameter", async ({ page }) => {
    await page.goto("/set-password", { waitUntil: "domcontentloaded" })

    await expect(page.getByText("Missing Token")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/no setup token/i)).toBeVisible()
  })

  test("shows error for invalid token", async ({ page }) => {
    await page.goto("/set-password?token=invalid-token-abc123", {
      waitUntil: "domcontentloaded",
    })

    await expect(page.getByText("Invalid Link")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/not valid/i)).toBeVisible()
  })

  test("shows error for already-used token", async ({
    adminPage,
    browser,
    prisma,
    request,
  }) => {
    const testEmail = `e2e-used-token-${Date.now()}@hrtest.local`

    await clearEmailOutbox(request)

    // Create user via admin UI
    await adminPage.goto("/admin/users", { waitUntil: "domcontentloaded" })
    await adminPage.getByRole("button", { name: /new user/i }).click()
    await adminPage.fill("#create-name", "E2E Used Token")
    await adminPage.fill("#create-email", testEmail)
    await adminPage.selectOption("#create-role", "VIEWER")
    await adminPage.getByRole("button", { name: /^create user$/i }).click()

    // Capture setup URL from test outbox
    const inviteEmail = await fetchInviteEmail(request, testEmail)
    const setupUrl = extractSetPasswordUrl(inviteEmail)

    // First use: set the password successfully
    const ctx1 = await browser.newContext()
    const page1 = await ctx1.newPage()
    try {
      await page1.goto(setupUrl, { waitUntil: "domcontentloaded" })
      await expect(page1.getByText("Create your password")).toBeVisible({
        timeout: 10_000,
      })
      await page1.fill("#newPassword", STRONG_PASSWORD)
      await page1.fill("#confirmPassword", STRONG_PASSWORD)
      await page1.getByRole("button", { name: /^set password$/i }).click()
      await expect(page1.getByText("Password Set Successfully")).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await ctx1.close()
    }

    // Second use: same token should show "Already Used"
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    try {
      await page2.goto(setupUrl, { waitUntil: "domcontentloaded" })
      await expect(page2.getByText("Already Used")).toBeVisible({
        timeout: 10_000,
      })
      await expect(page2.getByText(/already been used/i)).toBeVisible()
    } finally {
      await ctx2.close()
      await prisma.user.delete({ where: { email: testEmail } }).catch(() => {})
    }
  })

  test("shows error for expired token", async ({ prisma, page }) => {
    const testEmail = `e2e-expired-${Date.now()}@hrtest.local`
    const passwordHash = await hash("placeholder-never-used", 10)

    const user = await prisma.user.create({
      data: {
        name: "E2E Expired Token",
        email: testEmail,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: true,
      },
    })

    try {
      // Create an expired token directly (must use base64url to match TOKEN_PATTERN)
      const crypto = await import("node:crypto")
      const rawToken = crypto.randomBytes(32).toString("base64url")
      const secret =
        process.env.AUTH_SECRET ||
        "test-secret-key-for-testing-only-do-not-use-in-production"
      const tokenHash = crypto
        .createHmac("sha256", secret)
        .update(rawToken)
        .digest("hex")

      await prisma.setPasswordToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired 1 hour ago
        },
      })

      await page.goto(`/set-password?token=${rawToken}`, {
        waitUntil: "domcontentloaded",
      })
      await expect(page.getByText("Link Expired")).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByText(/expired/i)).toBeVisible()
    } finally {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
    }
  })
})
