import { defineConfig, devices } from "@playwright/test"

const port = 3000
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`

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
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
