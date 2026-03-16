import "dotenv/config" // Must be first - hashSetPasswordToken triggers @/lib/prisma which needs DATABASE_URL
import crypto from "node:crypto"

import { hash } from "bcryptjs"

import { test, expect } from "./fixtures"
import { hashSetPasswordToken } from "@/lib/password-setup-tokens"

test.describe("Set-Password Token Error States", () => {
  test("shows Missing Token when no token parameter is provided", async ({
    page,
  }) => {
    await page.goto("/set-password", { waitUntil: "domcontentloaded" })

    await expect(page.getByText("Missing Token")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/no setup token was provided/i)).toBeVisible()
  })

  test("shows Invalid Link for a bogus token", async ({ page }) => {
    await page.goto("/set-password?token=not-a-real-token", {
      waitUntil: "domcontentloaded",
    })

    await expect(page.getByText("Invalid Link")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/not valid/i)).toBeVisible()
  })

  test("shows Link Expired for an expired token", async ({ page, prisma }) => {
    const passwordHash = await hash("placeholder-hash-value-1234", 10)
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Expired Token User",
        email: `e2e-expired-${Date.now()}@hrtest.local`,
        passwordHash,
        role: "VIEWER",
        active: true,
        mustChangePassword: true,
      },
    })

    const rawToken = crypto.randomBytes(32).toString("base64url")
    const tokenHash = hashSetPasswordToken(rawToken)

    await prisma.setPasswordToken.create({
      data: {
        userId: testUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 60_000),
      },
    })

    try {
      await page.goto(`/set-password?token=${rawToken}`, {
        waitUntil: "domcontentloaded",
      })

      await expect(page.getByText("Link Expired")).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(/expired/i)).toBeVisible()
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })

  test("shows Already Used for a consumed token", async ({ page, prisma }) => {
    const passwordHash = await hash("placeholder-hash-value-5678", 10)
    const testUser = await prisma.user.create({
      data: {
        name: "E2E Used Token User",
        email: `e2e-used-${Date.now()}@hrtest.local`,
        passwordHash,
        role: "VIEWER",
        active: true,
      },
    })

    const rawToken = crypto.randomBytes(32).toString("base64url")
    const tokenHash = hashSetPasswordToken(rawToken)

    await prisma.setPasswordToken.create({
      data: {
        userId: testUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 3_600_000),
        usedAt: new Date(),
      },
    })

    try {
      await page.goto(`/set-password?token=${rawToken}`, {
        waitUntil: "domcontentloaded",
      })

      await expect(page.getByText("Already Used")).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(/already been used/i)).toBeVisible()
      await expect(page.getByRole("link", { name: /login/i })).toBeVisible()
    } finally {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {})
    }
  })
})
