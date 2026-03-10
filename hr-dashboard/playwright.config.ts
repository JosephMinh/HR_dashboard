import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`
const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ??
  "postgresql://postgres:postgres@localhost:5433/hr_dashboard_test"

export default defineConfig({
  testDir: "./__tests__/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  globalSetup: "./__tests__/e2e/global-setup.ts",
  globalTeardown: "./__tests__/e2e/global-teardown.ts",
  reporter: process.env.CI
    ? [
        ["./src/test/playwright-reporter.ts", { outputDir: "test-results/playwright" }],
        ["junit", { outputFile: "test-results/playwright/junit.xml" }],
        ["html", { outputFolder: "test-results/playwright/html", open: "never" }],
        ["list"],
      ]
    : [
        ["./src/test/playwright-reporter.ts", { outputDir: "test-results/playwright" }],
        ["html", { outputFolder: "test-results/playwright/html", open: "never" }],
        ["list"],
      ],
  outputDir: "./test-results/playwright-output",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `DATABASE_URL="${testDatabaseUrl}" npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    // Reusing an existing dev server can point tests at the wrong database.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
