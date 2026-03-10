/**
 * Vitest Configuration for Integration Tests
 *
 * Integration tests run against a real PostgreSQL database.
 * Use: bun run test:integration
 */

import path from "node:path"
import { defineConfig } from "vitest/config"
import { loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  // Load test environment variables
  const env = loadEnv(mode, process.cwd(), "")

  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      // Use Node environment for database access
      environment: "node",
      globals: true,

      // Integration test files
      include: ["__tests__/integration/**/*.test.{ts,tsx}"],
      exclude: ["node_modules/**"],

      // Setup files
      setupFiles: ["./vitest.setup.ts"],

      // Longer timeout for database operations
      testTimeout: 30_000,
      hookTimeout: 30_000,

      // Run tests sequentially to avoid database conflicts.
      pool: "forks",
      minWorkers: 1,
      maxWorkers: 1,
      fileParallelism: false,

      // Coverage configuration
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "json"],
        reportsDirectory: "./coverage/integration",
        include: ["src/app/api/**/*.ts", "src/lib/**/*.ts"],
        exclude: [
          "src/generated/**",
          "src/test/**",
          "**/*.test.ts",
          "**/*.d.ts",
        ],
      },

      // CI reporters
      reporters: process.env.CI
        ? [
            "default",
            ["junit", { outputFile: "test-results/integration/junit.xml" }],
            ["./src/test/reporter.ts", { outputDir: "test-results/integration" }],
          ]
        : [
            "default",
            "verbose",
            ["./src/test/reporter.ts", { outputDir: "test-results/integration" }],
          ],

      // Environment variables for tests
      env: {
        DATABASE_URL:
          env.DATABASE_URL_TEST ??
          "postgresql://postgres:postgres@localhost:5433/hr_dashboard_test?schema=test",
        AUTH_SECRET: "test-secret-key-for-testing-only",
        NODE_ENV: "test",
      },
    },
  }
})
