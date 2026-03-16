import type { APIRequestContext } from "@playwright/test"

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
