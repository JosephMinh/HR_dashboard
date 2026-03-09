import { expect, test } from "@playwright/test"

test("login page renders the expected form", async ({ page }) => {
  await page.goto("/login")

  await expect(page.getByText("HR Dashboard")).toBeVisible()
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.getByLabel("Password")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Sign in" }),
  ).toBeVisible()
})
