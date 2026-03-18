# HR Dashboard Testing Playbook

**Date**: 2026-03-17
**Bead**: hr-kfwh.26
**Author**: HazyBay (AI Agent)
**References**: [COVERAGE_AUDIT.md](COVERAGE_AUDIT.md) · [RISK_MATRIX.md](RISK_MATRIX.md) · [MOCKING_POLICY.md](MOCKING_POLICY.md)

---

## Overview

The test suite has three layers that must all pass before merging:

| Layer | Runner | Database | Browser | Typical Runtime |
|-------|--------|----------|---------|-----------------|
| **Unit** | Vitest (jsdom) | No | No | ~30s |
| **Integration** | Vitest (node) | Yes (port 5433) | No | ~60–90s |
| **E2E** | Playwright (Chromium) | Yes (port 5433) | Yes | ~3–5min |

Every layer uses real implementations by default. Mocks are documented exceptions — see [MOCKING_POLICY.md](MOCKING_POLICY.md).

---

## Quick Start

```bash
cd hr-dashboard

# 1. Install dependencies
bun install

# 2. Start the test database (once per machine/session)
bun run test:db:up        # Docker: starts postgres on port 5433
bun run test:db:push      # Push Prisma schema to test DB

# 3. Run all checks
bun run test              # Unit tests (no DB needed)
bun run test:integration  # Integration tests (needs port 5433)
bun run test:e2e          # E2E tests (starts app, needs port 5433)

# Or run everything at once:
bun run test:all
```

---

## 1. Unit Tests

Unit tests live in `__tests__/unit/` and `__tests__/` (non-integration, non-e2e).
They run in jsdom — no database, no network.

### Running

```bash
bun run test                    # Run all unit tests once
bun run test:watch              # Watch mode
bun run test:coverage           # Run with Istanbul coverage report
```

### Config

`vitest.config.ts` — key settings:

| Setting | Value |
|---------|-------|
| Environment | jsdom |
| Test glob | `__tests__/**/*.test.{ts,tsx}` (excluding integration/e2e) |
| Coverage provider | Istanbul (`@vitest/coverage-istanbul`) |
| Coverage output | `coverage/coverage-summary.json` |
| Retries (CI) | 2 · (local) 1 |

### Coverage Gates (per `vitest.config.ts`)

| Metric | Gate |
|--------|------|
| Statements | 63% |
| Branches | 54% |
| Functions | 58% |
| Lines | 63% |

Coverage is checked on every `bun run test:coverage` run. The CI also runs `bun run coverage:guard` to check per-file branch coverage for files changed on the branch (60% threshold by default).

### Writing a Unit Test

```ts
// __tests__/unit/my-function.test.ts
import { describe, it, expect } from "vitest"
import { myFunction } from "@/lib/my-function"

describe("myFunction", () => {
  it("returns expected value", () => {
    expect(myFunction("input")).toBe("expected")
  })
})
```

Pure logic tests must not use `vi.mock()`. See [MOCKING_POLICY.md §1A](MOCKING_POLICY.md).

---

## 2. Integration Tests

Integration tests live in `__tests__/integration/`.
They run in a Node environment and hit a real PostgreSQL database.

### Prerequisites

```bash
# Requires Docker
bun run test:db:up    # starts postgres:15 on port 5433
bun run test:db:push  # applies Prisma schema (idempotent)
```

Test database URL: `postgresql://postgres:postgres@localhost:5433/hr_dashboard_test`

The test runner refuses to run against port 5432 or any DB name not containing "test" — a safety guard against accidentally wiping dev data.

### Running

```bash
bun run test:integration            # Run all integration tests once
bun run test:integration:watch      # Watch mode
bun run test:integration:coverage   # Run with coverage
```

### Config

`vitest.config.integration.ts` — key settings:

| Setting | Value |
|---------|-------|
| Environment | node |
| Test glob | `__tests__/integration/**/*.test.ts` |
| Timeout | 30 000ms per test + hook |
| Parallelism | Sequential (single worker, no file parallelism) |
| Coverage output | `coverage/integration/coverage-summary.json` |
| Retries (CI) | 2 · (local) 1 |

Tests run in a single worker so suites share a predictable test database lifecycle and avoid cross-file state collisions while the harness resets shared tables between tests.

### Coverage Gates (per `vitest.config.integration.ts`)

| Metric | Gate |
|--------|------|
| Statements | 38% |
| Branches | 39% |
| Functions | 37% |
| Lines | 39% |

### Writing an Integration Test

```ts
// __tests__/integration/my-endpoint.test.ts
import { describe, it, expect } from "vitest"
import {
  setupIntegrationTests,
  getTestPrisma,
  uniqueEmail,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

describe("GET /api/jobs", () => {
  // 1. Reset DB before each test + wire up auth mock
  setupIntegrationTests()
  const auth = setupTestAuth()

  it("returns 200 with job list", async () => {
    // Seed data
    const prisma = getTestPrisma()
    await prisma.job.create({
      data: { title: "Eng Manager", department: "Eng", description: "...", status: "OPEN", priority: "HIGH" },
    })

    // Set session
    await auth.loginAsNewUser({ role: "RECRUITER" })

    // Call route handler directly (no HTTP)
    const { GET } = await import("@/app/api/jobs/route")
    const res = await GET(new Request("http://localhost/api/jobs") as never)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.jobs).toHaveLength(1)
  })

  it("returns 401 when unauthenticated", async () => {
    auth.logout()
    const { GET } = await import("@/app/api/jobs/route")
    const res = await GET(new Request("http://localhost/api/jobs") as never)
    expect(res.status).toBe(401)
  })
})
```

**Key rules:**
- Always call `setupIntegrationTests()` first — it handles DB reset + connection lifecycle.
- Use `setupTestAuth()` (imported from `@/test/test-auth`, **not** from `setup-integration`) for auth.
- For validation-only tests that do not need DB resets, pass `{ resetBeforeEach: false }`.

---

## 3. Test Harnesses

All harnesses are installed once per `describe` block. They register `beforeEach`/`afterEach` hooks automatically.

### 3A. Auth Harness — `setupTestAuth()`

Replaces per-file `vi.mock('@/lib/auth')` with a standardized harness that exercises the real `refreshJwtTokenFromDatabase()` path.

```ts
import { setupTestAuth } from "@/test/test-auth"
// NOTE: import directly — do NOT import from setup-integration (causes vi.mock hoisting issues)

const auth = setupTestAuth()

// Log in as a freshly created DB user
await auth.loginAsNewUser({ role: "RECRUITER" })

// Log in as a specific existing user
await auth.loginAs(existingUser.id)

// Log out (auth() returns null)
auth.logout()

// Force a specific session object
auth.forceSession({ user: { id: "...", role: "ADMIN", ... } })
```

**What this catches that plain mocks miss:** deactivated users, role changes mid-session, deleted users.

### 3B. Email Harness — `setupEmailHarness()`

Wraps the built-in in-memory email outbox with assertion helpers and failure injection.

```ts
import { setupIntegrationTests, setupEmailHarness } from "@/test/setup-integration"

setupIntegrationTests()
const email = setupEmailHarness()

// After triggering an email-sending action:
email.assertEmailSentTo("user@example.com")
email.assertEmailSentTo("user@example.com", { subject: /invite/i })
const msg = email.lastEmail()!
const link = email.extractFirstLink(msg) // extracts first https?:// link from body

// Inject SMTP failures
email.injectFailure("reject")    // SMTP connection refused
email.injectFailure("timeout")   // Socket hang-up
email.injectFailure("partial")   // Partial delivery failure

// Inspect the outbox
const all = email.allEmails()    // all captured emails this test
email.clearOutbox()              // manually clear (auto-cleared before each test)
```

### 3C. Storage Harness — `setupStorageHarness()`

Routes S3 operations to an in-memory Map. Zero AWS credentials needed.

```ts
import { setupIntegrationTests, setupStorageHarness } from "@/test/setup-integration"

setupIntegrationTests()
const storage = setupStorageHarness()

// After triggering an upload:
storage.assertObjectExists("resumes/abc-123.pdf")
storage.assertObjectDoesNotExist("resumes/old-key.pdf")
expect(storage.count).toBe(1)

// Inject S3 failures
storage.injectFailure("permission-denied")
storage.injectFailure("not-found")
storage.injectFailure("service-unavailable")

// Inspect the store
const obj = storage.getObject("resumes/abc-123.pdf")  // { key, body, contentType, ... }
const all = storage.allObjects()                        // StoredTestObject[]
storage.clear()                                         // manually clear
```

### 3D. Rate-Limit Harness — `setupRateLimitHarness()`

Controls the in-memory rate-limit store (Redis is never used in tests).

```ts
import { setupIntegrationTests, setupRateLimitHarness } from "@/test/setup-integration"

setupIntegrationTests()
const rateLimit = setupRateLimitHarness()

// Exhaust a route's limit so the next call gets 429
rateLimit.exhaustRouteLimit("password-reset:user-id", { limit: 5, windowMs: 900_000 })

// Advance the virtual clock past a window
rateLimit.advanceTime(900_001)  // ms

// Reset all counters manually
rateLimit.reset()
```

---

## 4. E2E Tests

E2E tests live in `__tests__/e2e/` and run in a real Chromium browser against a live Next.js dev server.

### Prerequisites

```bash
bun run test:e2e:install   # Install Playwright browsers (once)
bun run test:db:up         # Test database on port 5433
bun run test:db:push       # Push schema
```

### Running

```bash
bun run test:e2e           # Run all E2E tests (starts app automatically)
bun run test:e2e --headed  # Run with visible browser
bun run test:e2e --debug   # Step-through debug mode

# Run a specific spec:
bun run test:e2e __tests__/e2e/jobs.spec.ts

# Reuse an already-running dev server (faster iteration):
PLAYWRIGHT_REUSE_SERVER=1 bun run test:e2e
```

### Fixtures

Every E2E test imports from `"./fixtures"` instead of `"@playwright/test"` directly:

```ts
import { test, expect } from "./fixtures"

test("creates a job", async ({ recruiterPage, prisma, logger }) => {
  // recruiterPage — page pre-authenticated as RECRUITER
  // adminPage     — page pre-authenticated as ADMIN
  // viewerPage    — page pre-authenticated as VIEWER (read-only)
  // prisma        — PrismaClient for direct DB setup/assertions
  // logger        — E2ETestLogger (see §5)

  await recruiterPage.goto("/jobs/new")
  // ...
})
```

Available fixtures:

| Fixture | Type | Description |
|---------|------|-------------|
| `adminPage` | `Page` | Pre-authenticated as ADMIN role |
| `recruiterPage` | `Page` | Pre-authenticated as RECRUITER role |
| `viewerPage` | `Page` | Pre-authenticated as VIEWER role |
| `pageWithLogger` | `{ page, logger }` | Unauthenticated page + logger |
| `loginAs` | `fn(role)` | Returns a page logged in as the given role |
| `prisma` | `PrismaClient` | Direct DB access (test DB) |
| `logger` | `E2ETestLogger` | Console + network logging |

### Config (`playwright.config.ts`)

| Setting | Value |
|---------|-------|
| Base URL | `http://127.0.0.1:3000` (overridable via `PLAYWRIGHT_BASE_URL`) |
| Retries | 2 (CI) · 0 (local) |
| Trace | Retained on failure |
| Screenshot | Captured on failure |
| Video | Recorded on first retry |
| Test timeout | 30 000ms |
| Expect timeout | 5 000ms |

---

## 5. Logging & Artifact Interpretation

### Unit/Integration Artifacts

After a run, artifacts are in `test-results/`:

```
test-results/
  vitest/
    junit.xml              # JUnit XML for CI parsers
    report.json            # JSON summary per test (pass/fail/duration/errors)
  integration/
    junit.xml
    report.json
```

The custom reporter (`src/test/reporter.ts`) produces `report.json` with:
- `status`: `"passed" | "failed" | "skipped"`
- `durationMs`: wall-clock duration
- `errors[]`: `{ message, stack }` — use stack for file+line
- `retryCount`: > 0 means a flaky test passed on retry (possible quarantine candidate)

### E2E Artifacts

```
test-results/
  playwright/
    report.json            # Full JSON summary with per-test steps + attachments
    report.txt             # Human-readable text report
    junit.xml              # JUnit XML
    html/                  # Playwright HTML report (open index.html)
  playwright-output/
    test-name/
      screenshot.png       # Captured on failure
      video.webm           # Captured on first retry
      trace.zip            # Playwright trace (open with: npx playwright show-trace)
```

The custom Playwright reporter (`src/test/playwright-reporter.ts`) enriches the JSON and text reports with:

- **`browser-console`** attachment: every `console.log/warn/error` from the page
- **`execution-log`** attachment: every network request + response, navigation events, locator interactions
- **`server-stderr`** / **`server-stdout`**: first 30 lines of app-server output for failing tests

For failing tests, all inline attachment bodies are rendered directly in `report.txt` (up to 100 lines each). Look for:

```
[failed] Test title (1234ms)
  [browser-console] (17 lines):
    [warn] 12:34:56 [Console] Some warning message
    [error] 12:34:57 [Console] Uncaught TypeError: ...
  [execution-log] (42 lines):
    [12:34:55] [NAV] http://localhost:3000/jobs/new (200)
    [12:34:56] [API] POST /api/jobs -> 201
    ...
  server-stderr:
    Error: Database connection refused
```

### Reading the Execution Log

Each line in the execution log follows one of these patterns:

| Prefix | Meaning |
|--------|---------|
| `[NAV]` | Page navigation (URL + HTTP status) |
| `[API]` | API request (method + path + response status) |
| `[API-FAIL]` | API request that resulted in a network error |
| `[Console]` | Browser console message (prefixed by severity) |
| `[CLICK]` | Locator click |
| `[FILL]` | Locator fill (text input) |

### Trace Viewer

For deep debugging, open the Playwright trace:

```bash
npx playwright show-trace test-results/playwright-output/test-name/trace.zip
```

This shows a timeline with screenshots, DOM snapshots, and network calls for each step.

---

## 6. Coverage

### Per-Suite Reports

| Suite | Report File | Format |
|-------|-------------|--------|
| Unit | `coverage/coverage-summary.json` | Istanbul JSON-summary |
| Integration | `coverage/integration/coverage-summary.json` | Istanbul JSON-summary |
| Combined | `coverage/combined/report.json` (after `coverage:merge`) | Custom JSON |

### Running Coverage

```bash
bun run test:coverage                  # Unit coverage
bun run test:integration:coverage      # Integration coverage
bun run coverage:merge                 # Merge into combined report + trend chart
```

### Diff-Aware Guard

Checks only files changed on your branch against a 60% per-file branch threshold:

```bash
bun run coverage:guard                 # Run tests + check changed files
bun run coverage:guard:ci              # Use pre-existing reports (CI flow)

# Flags:
bash scripts/coverage-guard.sh --base origin/main --threshold 70 --verbose
bash scripts/coverage-guard.sh --suite both   # Check unit + integration combined
```

Skipped files (no coverage data) are not counted as failures — add tests if a file is flagged.

### CI Coverage Flow

```bash
# CI runs these in order:
bun run test:coverage                  # → coverage/coverage-summary.json
bun run test:integration:coverage      # → coverage/integration/coverage-summary.json
bun run coverage:guard:ci              # checks changed files vs. origin/main
```

---

## 7. Quality Gates Reference

| Gate | When It Runs | Command | Blocks Merge |
|------|-------------|---------|--------------|
| Lint | Pre-test | `bun run lint` | Yes |
| TypeCheck | Pre-test | `npx tsc --noEmit` | Yes |
| Unit coverage thresholds | `test:coverage` | Vitest built-in | Yes |
| Integration coverage thresholds | `test:integration:coverage` | Vitest built-in | Yes |
| Diff-aware branch coverage | CI, pre-push | `coverage:guard:ci` | Yes |
| All tests pass | CI | `test:all` | Yes |

### Threshold Locations

- Unit thresholds: `vitest.config.ts` → `test.coverage.thresholds`
- Integration thresholds: `vitest.config.integration.ts` → `test.coverage.thresholds`
- Diff guard threshold: `scripts/coverage-guard.sh` default (`60`), overridable via `--threshold`

---

## 8. Flaky Test Quarantine

Approved flaky tests are tracked in `test-quarantine.json`. A quarantine entry exempts a test from failing the build but still runs it.

```json
{
  "tests": [
    {
      "id": "add-candidate-dialog > does not attach candidate immediately",
      "reason": "TanStack Form async validation timing — see hr-kfwh.11",
      "expiresAt": "2026-04-30",
      "approvedBy": "HazyBay"
    }
  ]
}
```

**Rules:**
- Quarantine entries require a `reason` and an `expiresAt` date.
- Expired entries are flagged by `test:all` (or `FAIL_ON_EXPIRED_QUARANTINE=1`).
- Do not quarantine a test to hide a real bug — fix the root cause.

---

## 9. Environment Variables

### Test Database

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL_TEST` | `postgresql://postgres:postgres@localhost:5433/hr_dashboard_test` | Test DB URL |

Load from `.env.test` (for local overrides):

```bash
cp .env.example .env.test
# Edit DATABASE_URL_TEST, AUTH_SECRET, etc.
```

### E2E

| Variable | Default | Purpose |
|----------|---------|---------|
| `PLAYWRIGHT_BASE_URL` | `http://127.0.0.1:3000` | App URL for E2E tests |
| `PLAYWRIGHT_PORT` | `3000` | Port (if using default base URL) |
| `PLAYWRIGHT_REUSE_SERVER` | `""` | Set to `1` to skip starting a dev server |
| `PLAYWRIGHT_REPORT_DIR` | `test-results/playwright` | Custom report directory |

E2E execution policy:
- Playwright is fully parallel by default.
- The suite relies on one shared seeded database baseline plus per-test data creation where needed.
- Auth storage is isolated per worker so parallel workers do not overwrite each other's cached session files.
- Suites that intentionally mutate shared global state must opt into serial mode with `test.describe.configure({ mode: "serial" })`.

### Auth

| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTH_SECRET` | `test-secret-key-for-testing-only` | NextAuth secret in tests |
| `NEXTAUTH_URL` | (from app) | Required by Auth.js for redirect URLs |

### Coverage Guard

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASE_REF` | auto-detected (`origin/main`) | Git ref to diff against |
| `THRESHOLD` | `60` | Branch coverage % threshold per file |
| `COVERAGE_SUITE` | `unit` | Which suite to check (`unit` / `integration` / `both`) |
| `NO_RUN` | `0` | `1` = use pre-existing reports |
| `GUARD_VERBOSE` | `0` | `1` = show coverage source breakdown per file |

---

## 10. Troubleshooting

### Integration Tests: Cannot connect to database

```
Error: SAFETY: Refusing to run integration tests against port 5432
```
→ Run `bun run test:db:up` to start the test database on port 5433.

```
Error: connect ECONNREFUSED 127.0.0.1:5433
```
→ Docker container may not have started. Check: `docker ps | grep postgres-test`.
→ Re-run: `bun run test:db:up`

### Integration Tests: Schema mismatch / migration error

```
Error: The table `public.User` does not exist
```
→ Run `bun run test:db:push` to apply the current Prisma schema.

### Integration Tests: Deadlock / lock timeout

```
Error: deadlock detected
```
→ An earlier test likely left a transaction open or is still holding work on the shared test pool.
→ Restart the run first. The current harness resets tables with ordered `deleteMany()` calls and keeps integration on a single worker so lock contention should be rare.

### Unit Tests: `vi.mock` hoisting conflict with `setupTestAuth`

```
Error: Cannot set properties of undefined (setting 'auth')
```
→ `setupTestAuth()` must be imported from `@/test/test-auth` directly, not re-exported through `@/test/setup-integration`. The re-export was intentionally omitted to prevent vi.mock hoisting collisions.

### E2E Tests: App server does not start

```
Error: browserType.launch: Chromium distribution "chromium" is not found
```
→ Run `bun run test:e2e:install` to install Playwright browsers.

```
Error: Page crashed
```
→ Check the `server-stderr` section in `test-results/playwright/report.txt` for the app's startup error.

### E2E Tests: Auth fixtures not working

→ Global setup (`__tests__/e2e/global-setup.ts`) now shares the same database readiness and schema-push helpers as integration tests before seeding test users. If it fails, the pre-authenticated fixtures will have no valid session.
→ Check: is the test DB reachable? Is `DATABASE_URL_TEST` correct in `.env.test`?

### Coverage Guard: All files show as "missing"

```
[SKIP] src/lib/auth.ts — no coverage data found
```
→ Coverage reports do not exist yet. Run `bun run test:coverage` (and optionally `test:integration:coverage`) before calling `coverage:guard --no-run`.

### Coverage Guard: File below threshold

```
[FAIL] src/lib/email.ts — 42% branch (need 60%)
```
→ Add tests covering the missing branches, then re-run. Use `--verbose` to see which suite (unit vs. integration) provided the best coverage. Consider running `--suite both` to combine both reports.

---

## 11. CI Workflow Summary

The full CI pipeline runs these stages in order:

```bash
# Stage 1: Static checks
bun run lint
npx tsc --noEmit

# Stage 2: Unit tests + coverage
bun run test:coverage

# Stage 3: Integration tests + coverage (requires test DB)
bun run test:db:up
bun run test:db:push
bun run test:integration:coverage

# Stage 4: E2E tests (requires test DB + running app)
bun run test:e2e

# Stage 5: Quality gates
bun run coverage:guard:ci    # diff-aware per-file branch check
bun run coverage:merge       # merge reports for trend chart
```

Use `bash scripts/test-all.sh` locally to run all stages end-to-end. Flags:

```bash
bash scripts/test-all.sh --skip-e2e          # Unit + integration only
bash scripts/test-all.sh --coverage          # Include coverage stages
bash scripts/test-all.sh --diff-coverage     # Include coverage guard
bash scripts/test-all.sh --only integration  # Single stage
```

---

## 12. Adding New Tests

### Which Layer?

| What you're testing | Use |
|--------------------|-----|
| Pure function / transform / validation | Unit (`__tests__/unit/`) |
| React component rendering | Unit (`__tests__/`) |
| API route handler (full request cycle) | Integration (`__tests__/integration/`) |
| Database query correctness | Integration |
| Email / storage / rate-limit side effects | Integration (use harness) |
| Multi-step user journey across pages | E2E (`__tests__/e2e/`) |
| Auth flows (login, onboarding, password reset) | E2E |

### Integration Test Template

```ts
import { describe, it, expect } from "vitest"
import {
  setupIntegrationTests,
  getTestPrisma,
  uniqueEmail,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"
// Add as needed:
// import { setupEmailHarness } from "@/test/setup-integration"
// import { setupStorageHarness } from "@/test/setup-integration"
// import { setupRateLimitHarness } from "@/test/setup-integration"

describe("POST /api/candidates", () => {
  setupIntegrationTests()         // resets DB before each test
  const auth = setupTestAuth()    // auth harness

  it("creates a candidate", async () => {
    await auth.loginAsNewUser({ role: "RECRUITER" })

    const { POST } = await import("@/app/api/candidates/route")
    const res = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Jane",
          lastName: "Doe",
          email: uniqueEmail("candidate"),
          source: "LINKEDIN",
        }),
      }) as never,
    )

    expect(res.status).toBe(201)
    const { candidate } = await res.json()
    expect(candidate.firstName).toBe("Jane")

    // Verify in DB
    const prisma = getTestPrisma()
    const row = await prisma.candidate.findUnique({ where: { id: candidate.id } })
    expect(row?.firstName).toBe("Jane")
  })
})
```

### E2E Test Template

```ts
import { test, expect } from "./fixtures"

test("recruiter can create a job", async ({ recruiterPage: page, prisma, logger }) => {
  await page.goto("/jobs/new")
  await page.getByLabel("Job Title").fill("Senior Engineer")
  await page.getByLabel("Department").fill("Engineering")
  await page.getByRole("button", { name: /create job/i }).click()

  await expect(page).toHaveURL(/\/jobs\/[a-z0-9-]+/)

  // Verify in DB
  const job = await prisma.job.findFirst({ where: { title: "Senior Engineer" } })
  expect(job).toBeTruthy()
})
```

---

*For coverage strategy and risk tiers, see [RISK_MATRIX.md](RISK_MATRIX.md).
For mocking rules and quarantine exceptions, see [MOCKING_POLICY.md](MOCKING_POLICY.md).
For current coverage gaps and blind spots, see [COVERAGE_AUDIT.md](COVERAGE_AUDIT.md).*
