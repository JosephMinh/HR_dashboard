# HR Dashboard — Testing Playbook

A complete reference for running, writing, and debugging tests in this project.
New contributors should be able to execute the full test suite using only this
document.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Running Tests Locally](#running-tests-locally)
3. [Running Tests in CI](#running-tests-in-ci)
4. [Test Suite Architecture](#test-suite-architecture)
5. [Integration Test Harnesses](#integration-test-harnesses)
   - [Core setup — `setupIntegrationTests`](#core-setup--setupintegrationtests)
   - [Auth harness — `setupTestAuth`](#auth-harness--setuptestauth)
   - [Email harness — `setupEmailHarness`](#email-harness--setupemailharness)
   - [Storage harness — `setupStorageHarness`](#storage-harness--setupstorageharness)
   - [Rate-limit harness — `setupRateLimitHarness`](#rate-limit-harness--setupratelimitharness)
   - [Test data factories — `createTestFactories`](#test-data-factories--createtestfactories)
6. [E2E Test Infrastructure](#e2e-test-infrastructure)
7. [Coverage Gates](#coverage-gates)
8. [Flake Quarantine System](#flake-quarantine-system)
9. [Logging and Artifact Interpretation](#logging-and-artifact-interpretation)
10. [Troubleshooting Decision Tree](#troubleshooting-decision-tree)

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Runtime |
| Bun | 1.x | Package manager & test runner |
| Docker | 24+ | Test PostgreSQL container |
| Playwright browsers | Chromium | E2E tests |

Install dependencies:

```sh
cd hr-dashboard
bun install
```

Install Playwright browsers (one-time):

```sh
npm run test:e2e:install
```

---

## Running Tests Locally

### Quick commands

```sh
# Unit tests only (fast, no DB needed)
npm test
# or
bun run test

# Unit tests in watch mode (TDD)
npm run test:watch

# Integration tests (requires test DB — see below)
npm run test:integration

# E2E tests (requires test DB + Next.js server)
npm run test:e2e

# Full suite: lint → tsc → unit → integration → E2E
npm run test:all
```

### Full suite options

`scripts/test-all.sh` has flags for every combination:

```sh
# Full suite with coverage enforcement
./scripts/test-all.sh --coverage

# Full suite, skip browser tests
./scripts/test-all.sh --skip-e2e

# Run only one stage (skips all others)
./scripts/test-all.sh --only unit
./scripts/test-all.sh --only integration
./scripts/test-all.sh --only e2e

# Coverage + per-file diff guard (useful before PRs)
./scripts/test-all.sh --coverage --diff-coverage
```

Environment toggles (alternative to flags):

```sh
SKIP_E2E=1 ./scripts/test-all.sh
SKIP_LINT=1 SKIP_TSC=1 ./scripts/test-all.sh --only unit
DEBUG_PRISMA=true ./scripts/test-all.sh --only integration  # verbose Prisma output
```

### Starting the test database

Integration and E2E tests require a separate PostgreSQL instance on **port 5433**
(the dev DB runs on 5432 — the safety guard in `src/test/test-db.ts` will throw
if you accidentally point tests at port 5432).

```sh
# Start the test DB container
npm run test:db:up

# Push the Prisma schema to it
npm run test:db:push

# Stop it when you're done
npm run test:db:down
```

`test-all.sh` will auto-start the DB if it is not running when integration tests
are reached.

The container is named `hr-dashboard-test-db` and uses these defaults:

```
host: localhost
port: 5433
user: postgres
password: postgres
database: hr_dashboard_test
```

Override via `DATABASE_URL_TEST` in `.env.test` or the environment.

---

## Running Tests in CI

CI sets `CI=1` and runs:

```sh
npm run test:all -- --coverage
```

Stages run in order: **Lint → TypeScript → Unit Tests + Coverage → Integration
Tests + Coverage → E2E Tests → Combined Coverage Report → Flake Summary →
(optional) Diff Coverage Guard**.

The CI-specific reporter emits:
- JUnit XML at `test-results/{vitest,integration,playwright}/junit.xml`
- Custom JSON report at `test-results/{vitest,integration,playwright}/report.json`
- Flake summary at `test-results/flake-summary.json` and
  `test-results/flake-summary.txt`

Retries: unit/integration retry **2×** in CI; E2E retries **2×** in CI with
video recording on first retry.

---

## Test Suite Architecture

```
hr-dashboard/
├── __tests__/
│   ├── unit/            Vitest unit tests (jsdom, no real DB)
│   ├── integration/     Vitest integration tests (real PostgreSQL, port 5433)
│   └── e2e/             Playwright browser tests (real Next.js server)
├── src/test/            Shared harnesses and utilities
│   ├── setup-integration.ts  Main integration setup + re-exports
│   ├── test-auth.ts          Real auth mock (must import directly — see note)
│   ├── auth-harness.ts       Legacy auth harness (new tests: use test-auth)
│   ├── email-harness.ts      Email interception and assertion
│   ├── storage-harness.ts    In-memory S3 store + assertions
│   ├── rate-limit-harness.ts Virtual-clock rate-limit helpers
│   ├── test-db.ts            Prisma test client, DB reset, schema push
│   ├── fixtures.ts           ID/email generators, TEST_DEPARTMENTS etc.
│   └── logger.ts             TestLogger for structured step/HTTP/DB logs
├── vitest.config.ts          Unit test config
├── vitest.config.integration.ts  Integration test config
└── playwright.config.ts      E2E test config
```

### Config highlights

**Unit tests** (`vitest.config.ts`)
- Environment: `jsdom`
- Includes: `__tests__/**/*.test.{ts,tsx}` (excluding `e2e/`, `integration/`)
- Retries: 1× locally, 2× in CI

**Integration tests** (`vitest.config.integration.ts`)
- Environment: `node`
- Includes: `__tests__/integration/**/*.test.{ts,tsx}`
- Timeout: **30 s** per test (longer for DB ops)
- Pool: single fork, `fileParallelism: false` — tests run strictly serially to
  avoid DB conflicts
- Hook ordering: `sequence.hooks = "list"` so `beforeAll` → `beforeEach` hooks
  run in declaration order

**E2E tests** (`playwright.config.ts`)
- Browser: Chromium only
- Timeout: 30 s per test, 5 s for `expect()`
- Trace: `retain-on-failure`; screenshots: `only-on-failure`; video:
  `on-first-retry`
- The web server is auto-started against the test DB unless
  `PLAYWRIGHT_REUSE_SERVER=1` is set

---

## Integration Test Harnesses

All harnesses are imported from `@/test/setup-integration` **except**
`setupTestAuth`, which must be imported directly from `@/test/test-auth`
(see critical note below).

### Core setup — `setupIntegrationTests`

Call once per test file to wire up database lifecycle hooks.

```ts
import { setupIntegrationTests } from "@/test/setup-integration"

describe("jobs API", () => {
  setupIntegrationTests()   // resets DB before each test by default
  // ...
})
```

Options:

| Option | Default | Description |
|--------|---------|-------------|
| `resetBeforeEach` | `true` | Truncate all tables before each test. Disable for read-only / validation-only test files to save ~50 ms per test. |
| `resetBeforeAll` | `false` | Truncate once before the whole suite instead. |
| `verifyClean` | `true` in CI | Assert all tables are empty after reset. Catches test pollution. |
| `logger` | `false` | Create a `TestLogger` per test; retrieve via `getLogger()`. |

For validation-only tests (no data mutations), use:

```ts
setupIntegrationTests({ resetBeforeEach: false })
```

### Auth harness — `setupTestAuth`

**Import directly from `@/test/test-auth` — not from `@/test/setup-integration`.**

> **Why the separate import?** `setupTestAuth` contains a `vi.mock()` call.
> Vitest hoists `vi.mock()` from transitively imported modules, which would
> break any test file that defines its own `vi.mock('@/lib/auth')`. Keeping it
> in a separate file prevents the hoist from leaking.

```ts
import { setupIntegrationTests } from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"   // ← direct import

describe("jobs API", () => {
  setupIntegrationTests()
  const testAuth = setupTestAuth()

  it("returns 200 for authenticated user", async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })

    const { GET } = await import("@/app/api/jobs/route")
    const res = await GET(new Request("http://localhost/api/jobs") as never)
    expect(res.status).toBe(200)
  })

  it("returns 401 when logged out", async () => {
    testAuth.logout()
    const { GET } = await import("@/app/api/jobs/route")
    const res = await GET(new Request("http://localhost/api/jobs") as never)
    expect(res.status).toBe(401)
  })
})
```

**Available methods:**

| Method | Description |
|--------|-------------|
| `loginAsNewUser(opts?)` | Create a fresh DB user and log in as them. Returns `TestUser`. |
| `loginAsRole(role)` | Shorthand for `loginAsNewUser({ role })`. |
| `loginAs(userId)` | Log in as an existing user by ID. |
| `logout()` | Clear the session — next `auth()` call returns `null`. |
| `createUser(opts?)` | Create a user without logging in. |
| `deactivateCurrentUser()` | Mark current user inactive — `auth()` returns `null`. |
| `activateUser(userId)` | Re-activate a deactivated user. |
| `changeRole(newRole)` | Update current user's role in DB — reflected immediately. |
| `setMustChangePassword(value)` | Toggle the password-change flag. |
| `forceSession(session \| null)` | Pin a specific session object (bypasses DB). |
| `clearForceSession()` | Remove the pinned session. |
| `getLastUser(role)` | Retrieve the most recently created user for a role. |
| `currentUserId` | (getter) ID of the currently authenticated user, or `null`. |
| `DEFAULT_PASSWORD` | The plaintext password used for all test users: `"TestPassword123!"` |

**What `setupTestAuth` catches that plain mocks miss:**
- User deactivated in DB → `auth()` returns `null`
- Role changed in DB → session reflects updated role immediately
- User deleted (e.g. by `resetDatabase`) → `auth()` returns `null`

### Email harness — `setupEmailHarness`

Tests that exercise email-sending paths (user invite, password reset) use the
in-memory outbox. The harness wraps it with assertion and failure-injection APIs.

```ts
import { setupIntegrationTests, setupEmailHarness } from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

describe("user invite", () => {
  setupIntegrationTests()
  const testAuth = setupTestAuth()
  const email = setupEmailHarness()

  it("sends invite email on user creation", async () => {
    await testAuth.loginAsNewUser({ role: "ADMIN" })
    // ... POST /api/users ...

    email.assertCount(1)
    email.assertEmailSentTo("new-user@example.com")
    const link = email.extractFirstLink(email.lastEmail()!)
    expect(link).toContain("/set-password?token=")
  })

  it("rolls back cleanly when email fails", async () => {
    email.injectFailure("reject")
    // ... POST /api/users ... expect error response
    email.assertNone()
  })
})
```

**Inspection API:**

| Property / Method | Description |
|---|---|
| `outbox` | Readonly array of all captured emails in send order. |
| `count` | Number of emails sent in current test. |
| `lastEmail()` | Most recently sent email, or `undefined`. |
| `emailAt(index)` | Email at a 0-based index. |
| `findEmail({ to?, subject? })` | First email matching filters. |
| `clear()` | Wipe the outbox mid-test. |

**Assertion API:**

| Method | Description |
|---|---|
| `assertCount(n)` | Exactly N emails sent. |
| `assertNone()` | No emails sent. |
| `assertEmailSentTo(to)` | At least one email to matching address/regex. Returns the email. |
| `assertEmailWithSubject(subject)` | At least one email with matching subject. Returns the email. |

**Content extraction:**

| Method | Description |
|---|---|
| `extractLinks(email)` | All `href=` URLs from HTML body. |
| `extractFirstLink(email)` | First href URL, or `null`. |
| `extractTextLinks(email)` | All `http(s)://` URLs from plain text body. |
| `lastHtml()` | HTML body of last email. Throws if no email sent. |
| `lastText()` | Plain text body of last email. |

**Failure injection:**

```ts
// All emails fail with SMTP refuse
email.injectFailure("reject")

// Only emails to "bob" timeout
email.injectFailure("timeout", { to: "bob" })

// Custom — return null to proceed normally
email.injectCustom((payload) => {
  if (payload.subject.includes("Password Reset")) return { success: false, error: "blocked" }
  return null
})

// Clear injection
email.clearFailure()
```

Failure modes: `"reject"` (ECONNREFUSED), `"timeout"` (socket hang-up),
`"partial"` (452 Too many recipients).

### Storage harness — `setupStorageHarness`

Tests for file upload/download routes use an in-memory store instead of S3.

```ts
import { setupIntegrationTests, setupStorageHarness } from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

describe("resume upload", () => {
  setupIntegrationTests()
  const testAuth = setupTestAuth()
  const storage = setupStorageHarness()

  it("stores the uploaded file", async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })
    // ... POST /api/upload/resume ...

    storage.assertCount(1)
    storage.assertHasPrefix("resumes/")
  })

  it("handles S3 permission denied", async () => {
    storage.injectFailure("permission-denied")
    // ... POST /api/upload/resume ... expect 500
    storage.assertEmpty()
  })
})
```

**Inspection API:**

| Property / Method | Description |
|---|---|
| `store` | Readonly Map of all stored objects. |
| `count` | Number of objects in the store. |
| `getObject(key)` | Object by exact key, or `undefined`. |
| `hasObject(key)` | Boolean key-exists check. |
| `keysWithPrefix(prefix)` | All keys starting with prefix. |
| `allObjects()` | All stored objects as an array. |
| `clear()` | Wipe the store mid-test. |

**Seeding (pre-populate existing objects):**

```ts
storage.seedObject("resumes/existing.pdf")
storage.seedObject("resumes/large.pdf", { size: 5_000_000, contentType: "application/pdf" })
storage.seedObjects(["a.pdf", "b.pdf"])
```

**Assertion API:**

| Method | Description |
|---|---|
| `assertCount(n)` | Exactly N objects in the store. |
| `assertEmpty()` | Store is empty. |
| `assertObjectExists(key)` | Key exists. Returns the object. |
| `assertObjectMissing(key)` | Key does not exist. |
| `assertHasPrefix(prefix)` | At least one key with prefix. |

**Failure injection:**

```ts
// All storage ops fail
storage.injectFailure("permission-denied")

// Only upload ops fail
storage.injectFailure("service-unavailable", { ops: ["upload"] })

// Only keys matching pattern fail
storage.injectFailure("not-found", { keyPattern: /resumes\/.*\.pdf/ })

// Custom — return null to proceed normally
storage.injectCustom((op, key) => {
  if (op === "upload" && key.startsWith("resumes/")) return { error: "quota exceeded" }
  return null
})

storage.clearFailure()
```

Failure modes: `"permission-denied"`, `"not-found"`, `"service-unavailable"`,
`"timeout"`.

### Rate-limit harness — `setupRateLimitHarness`

Tests for rate-limited endpoints use a virtual clock so limits can be tested
without real-time delays.

```ts
import { setupIntegrationTests, setupRateLimitHarness } from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

describe("password reset rate limit", () => {
  setupIntegrationTests()
  const testAuth = setupTestAuth()
  const rateLimit = setupRateLimitHarness()

  it("blocks after too many attempts", async () => {
    await testAuth.loginAsNewUser({ role: "ADMIN" })
    rateLimit.exhaustScope("auth", "127.0.0.1")
    // ... next POST /api/auth/... should get 429
  })

  it("allows requests after window expires", async () => {
    rateLimit.exhaustScope("auth", "127.0.0.1")
    rateLimit.advanceTime(60_001)   // auth window is 60 s
    // ... next request should succeed
  })
})
```

**Rate-limit scopes and their limits:**

| Scope | Limit | Use |
|-------|-------|-----|
| `auth` | 10 / min | Login, password reset |
| `write` | 60 / min | POST/PATCH/DELETE routes |
| `read` | 300 / min | GET routes |
| `upload` | 20 / min | File upload routes |

**Time control:**

```ts
rateLimit.advanceTime(60_001)      // move forward in the virtual clock
rateLimit.setTime(Date.now() + 1)  // jump to an absolute timestamp
rateLimit.now                       // current virtual timestamp
```

**Store manipulation:**

```ts
// Consume N credits for a scope
rateLimit.consumeScope("auth", "127.0.0.1", 5)

// Exhaust all remaining credits for a scope
rateLimit.exhaustScope("write", "192.168.1.1")

// Consume for a per-route key with a custom rule
rateLimit.consumeRoute("password-reset:user-abc", { limit: 5, windowMs: 900_000 }, 3)

// Exhaust a per-route key
rateLimit.exhaustRouteLimit("password-reset:user-abc", { limit: 5, windowMs: 900_000 })

// Reset the store
rateLimit.reset()
```

**Assertion helpers:**

```ts
rateLimit.assert429(response)
rateLimit.assertRateLimitHeaders(response, { limit: 10, remaining: 0 })
```

### Test data factories — `createTestFactories`

Use `createTestFactories()` to create entities with sensible defaults and
unique IDs.

```ts
import {
  setupIntegrationTests,
  createTestFactories,
} from "@/test/setup-integration"

describe("applications API", () => {
  setupIntegrationTests()
  const factories = createTestFactories()

  it("lists applications for a job", async () => {
    const { job, candidates } = await factories.createJobWithCandidates({
      jobTitle: "Senior Engineer",
      candidateCount: 3,
    })
    // All 3 candidates are linked to the job with stage "NEW"
    // ...
  })
})
```

**Available factories:**

| Factory | Key fields | Defaults |
|---------|-----------|---------|
| `createUser(data?)` | `name`, `email`, `role`, `passwordHash` | role `RECRUITER`, unique email |
| `createJob(data?)` | `title`, `department`, `status`, `priority` | `"OPEN"`, `"MEDIUM"` priority |
| `createCandidate(data?)` | `firstName`, `lastName`, `email`, `source` | source `LINKEDIN` |
| `createApplication(data)` | `jobId`, `candidateId`, `stage` | stage `NEW` (required: jobId, candidateId) |
| `createJobWithCandidates(opts?)` | `jobTitle`, `candidateCount` | 3 candidates, all at stage `NEW` |
| `createHeadcountProjection(data)` | `importKey`, `department`, `monthlyFte` | required: `importKey` |
| `createTradeoff(data)` | `importKey`, `rowType`, `sourceTempJobId` | required: `importKey` |

Unique helpers (from `@/test/fixtures`):

```ts
import { uniqueEmail, uniqueId, uniqueImportKey } from "@/test/setup-integration"

const email = uniqueEmail("recruiter")   // e.g. "recruiter-0042@test.example"
const id = uniqueId("job")               // e.g. "job-0043"
const key = uniqueImportKey()            // e.g. "import-0044"
```

---

## E2E Test Infrastructure

E2E tests live in `__tests__/e2e/` and use Playwright with worker-scoped
authentication contexts.

### Fixtures

The test fixture provides three pre-authenticated browser contexts:

```ts
import { test, expect } from "./__tests__/e2e/fixtures"

test("admin can see all jobs", async ({ adminPage, prisma, logger }) => {
  await logger.step("Navigate to jobs", async () => {
    await adminPage.goto("/jobs")
    await expect(adminPage.getByRole("heading", { name: "Jobs" })).toBeVisible()
  })
})
```

| Fixture | Auth level | Notes |
|---------|-----------|-------|
| `adminPage` | ADMIN | Full access |
| `recruiterPage` | RECRUITER | Can manage candidates/jobs |
| `viewerPage` | VIEWER | Read-only |
| `prisma` | — | Prisma client pointed at test DB |
| `logger` | — | `E2ETestLogger` instance |

**Creating test data in E2E tests:**

```ts
test("shows candidate in pipeline", async ({ adminPage, prisma }) => {
  // Seed directly via Prisma — don't rely on UI for setup
  const job = await prisma.job.create({ data: { title: "SWE", department: "Eng", ... } })
  const candidate = await prisma.candidate.create({ data: { ... } })
  await prisma.application.create({
    data: { jobId: job.id, candidateId: candidate.id, stage: "SCREENING" }
  })

  await adminPage.goto(`/jobs/${job.id}`)
  // ...
})
```

### `data-testid` selectors (stable across refactors)

| Selector | Component |
|----------|-----------|
| `[data-testid="candidate-row"]` | Row in the candidates pipeline table |
| `[data-testid="stage-dropdown-trigger"]` | Stage badge button in candidate row |
| `[data-testid="stage-dropdown-content"]` | Dropdown menu after clicking trigger |
| `[data-slot="card"]` | KPI stat cards on the dashboard |

### Add Candidate Dialog — two-step flow

The "Add Candidate" dialog is a **two-step** flow. Do not assume the dialog
closes after selecting a candidate:

```ts
// Step 1: Open dialog and search
await page.getByRole("button", { name: /add candidate/i }).click()
const dialog = page.getByRole("dialog")
await dialog.getByPlaceholder(/search by name or email/i).fill("Alice")
await page.waitForTimeout(450)   // debounce

// Step 2: Click the candidate result to select (shows a preview panel — does NOT attach)
await dialog.getByRole("button", { name: /Alice Smith/ }).click()

// Step 3: Click "Add to Job" to confirm the attach
await dialog.getByRole("button", { name: /add to job/i }).click()
await expect(dialog).not.toBeVisible({ timeout: 8_000 })
```

### Stage names (for text assertions)

| DB value | Display label |
|----------|--------------|
| `NEW` | New |
| `SCREENING` | Screening |
| `INTERVIEWING` | Interviewing |
| `FINAL_ROUND` | Final Round |
| `OFFER` | Offer |
| `HIRED` | Hired |
| `REJECTED` | Rejected |
| `WITHDRAWN` | Withdrawn |

---

## Coverage Gates

Coverage is enforced at two levels.

### Suite-level thresholds

Failing to meet these thresholds will fail the build.

**Unit tests** (Istanbul):

| Metric | Threshold |
|--------|-----------|
| Statements | 63% |
| Branches | 54% |
| Functions | 58% |
| Lines | 63% |

**Integration tests** (Istanbul, `src/app/api/**` and `src/lib/**` only):

| Metric | Threshold |
|--------|-----------|
| Statements | 38% |
| Branches | 39% |
| Functions | 37% |
| Lines | 39% |

### Diff coverage guard

Prevents new code from being merged with uncovered lines. Run before opening a
PR:

```sh
# Requires coverage to have been collected first
./scripts/test-all.sh --coverage --diff-coverage
```

Or as a standalone check after collecting coverage separately:

```sh
npm run coverage:guard -- --no-run
```

The guard compares your branch against `origin/main` (override with
`DIFF_COVERAGE_BASE=origin/release`).

Warn-only mode (log violations without failing the build):

```sh
DIFF_COVERAGE_WARN=1 ./scripts/test-all.sh --coverage --diff-coverage
```

### Combined coverage report

After running both unit and integration with coverage, generate a merged report:

```sh
npm run coverage:merge
```

Output goes to `coverage/combined/`. This is what CI uploads as the coverage
artifact.

---

## Flake Quarantine System

Tests that are known-flaky can be quarantined so they run in a separate lane
without blocking the main suite. The quarantine manifest lives at
`test-quarantine.json`.

### Manifest format

```json
{
  "entries": [
    {
      "id": "flake-001",
      "runner": "e2e",
      "file": "__tests__/e2e/my-flaky-test.spec.ts",
      "testNamePattern": "should render the modal",
      "owner": "YourName",
      "expiresOn": "2026-04-30",
      "reason": "Race condition on slow CI — PR #123 open to fix"
    }
  ]
}
```

Required fields: `id`, `runner` (`unit`|`integration`|`e2e`), `file`, `owner`,
`expiresOn` (YYYY-MM-DD), `reason`.

### Running the quarantine lane

```sh
./scripts/test-all.sh quarantine
# or
npm run test:all -- quarantine
```

### Expiry enforcement

Entries past their `expiresOn` date **fail the build** in CI
(`FAIL_ON_EXPIRED_QUARANTINE=1`). Remove or extend the entry before the
deadline.

In development, expiry is logged but does not fail the run.

### Flake summary output

After every run, `test-results/flake-summary.json` and
`test-results/flake-summary.txt` are written. A test that passes on retry is
flagged as flaky. Flaky tests not in the quarantine manifest are "unapproved
flakes" — these fail the build in CI.

---

## Logging and Artifact Interpretation

### TestLogger (integration tests)

Enable per-test logging via `setupIntegrationTests({ logger: true })`. Retrieve
the logger in a test via `getLogger()`.

```ts
const { getLogger } = setupIntegrationTests({ logger: true })

it("creates a job", async () => {
  const logger = getLogger()!
  await logger.step("POST /api/jobs", async () => {
    const res = await POST(...)
    logger.logResponse(res.status, await res.json())
  })
})
```

Log methods:

| Method | Category | Description |
|--------|----------|-------------|
| `step(name, fn)` | `STEP` | Wraps async work; records PASS/FAIL and duration |
| `logRequest(method, url, body?, headers?)` | `HTTP` | Outgoing request |
| `logResponse(status, body, headers?)` | `HTTP` | Response details |
| `logDatabaseState(table, rows)` | `DB` | Snapshot of DB rows |
| `logAssertion(expected, actual, pass?, msg?)` | `ASSERT` | Assertion trace |
| `logInfo(message, data?)` | `INFO` | Free-form message |
| `logError(message, error?)` | `ERROR` | Error with stack |

Logs are written to `test-results/logs/<test-name>-<uuid>.{json,log}`.

### E2ETestLogger (E2E tests)

Available as the `logger` fixture:

```ts
test("recruiting pipeline", async ({ adminPage, logger }) => {
  await logger.step("Navigate to job", async () => {
    await adminPage.goto("/jobs/abc123")
  })

  await logger.captureScreenshot(adminPage, "pipeline-loaded")
})
```

Screenshots are saved next to traces in `test-results/playwright-output/`.

### Playwright artifacts

On failure, Playwright saves:
- **Trace**: `test-results/playwright-output/<test>-retry-<n>/trace.zip`
  → Open with `npx playwright show-trace <path>`
- **Screenshot**: `test-results/playwright-output/<test>-retry-<n>/test-failed-*.png`
- **Video**: Recorded on first retry — `test-results/playwright-output/<test>-retry-1/video.webm`

The custom reporter also emits a structured JSON report at
`test-results/playwright/report.json`.

### Vitest JSON reports

Located at `test-results/vitest/report.json` (unit) and
`test-results/integration/report.json`.

Key fields:
- `tests[].retryCount` — number of retries (> 0 = flaky candidate)
- `tests[].flaky` — true if the test eventually passed after retrying
- `tests[].file`, `tests[].fullName` — used by quarantine manifest matching

---

## Troubleshooting Decision Tree

### ① Integration tests fail to connect to the database

```
Error: Database not ready after 30000ms
```

1. Is Docker running?
   ```sh
   docker info
   ```
2. Is the test container running?
   ```sh
   docker ps | grep hr-dashboard-test-db
   ```
3. Start (or restart) it:
   ```sh
   npm run test:db:up
   ```
4. Is port 5433 reachable?
   ```sh
   nc -z localhost 5433 && echo "open" || echo "closed"
   ```
5. Check container logs:
   ```sh
   docker logs hr-dashboard-test-db
   ```
6. Push the schema (idempotent):
   ```sh
   npm run test:db:push
   ```

### ② SAFETY error: refusing to run against port 5432

```
SAFETY: Refusing to run integration tests against port 5432
```

Your `DATABASE_URL` is set but `DATABASE_URL_TEST` is not. Set the test URL:

```sh
export DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/hr_dashboard_test
```

Or create a `.env.test` file with this line.

### ③ Tests pollute each other (data from test A visible in test B)

- Ensure `setupIntegrationTests()` is called (default resets before each test).
- For suites that disable resets, add `resetBeforeAll: true` or call
  `resetDatabase()` manually.
- Enable `verifyClean: true` to get a detailed report of leftover rows.

### ④ Unit tests fail with `auth is not mocked`

```
TypeError: Cannot read properties of undefined (reading 'user')
```

You are testing a route that calls `auth()` without mocking it.

1. Add `setupTestAuth()` **imported from `@/test/test-auth`** (not from
   `setup-integration`).
2. Call `testAuth.loginAsNewUser(...)` in `beforeEach` or at the top of the test.

### ⑤ `vi.mock('@/lib/auth')` conflicts with `setupTestAuth`

Symptom: test file has both a manual `vi.mock('@/lib/auth')` and
`setupTestAuth()` — one overwrites the other.

Fix: Remove the manual `vi.mock` and use only `setupTestAuth`. The harness
mocks `auth` for you in a composable way.

If you must keep the manual mock (legacy test), import
`createAuthHarness` from `@/test/setup-integration` instead of `setupTestAuth`.

### ⑥ E2E tests time out opening the browser / Next.js server

```
Error: browserType.launch: Executable doesn't exist
```

Install Playwright browsers:

```sh
npm run test:e2e:install
```

```
Error: connect ECONNREFUSED 127.0.0.1:3000
```

The webServer failed to start. Check:
```sh
# Run the dev server manually and look for build errors:
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/hr_dashboard_test" npm run dev
```

### ⑦ E2E auth fixtures fail (worker context setup error)

The worker-scoped auth contexts are created once per Playwright worker. If the
test DB was reset after contexts were created, the seed users are gone.

- Do not call `resetDatabase()` from within an E2E test body.
- Use `prisma.job.deleteMany()` / `prisma.application.deleteMany()` to clean
  only the entities you created, leaving user rows intact.

### ⑧ Coverage gate fails after adding new code

You added a new file/function but tests don't cover it yet.

1. Check what is uncovered:
   ```sh
   npm run test:coverage     # opens HTML report at coverage/index.html
   npm run coverage:diff     # shows only lines changed in your branch
   ```
2. Either add tests for the new code, or (for deliberately untested utilities
   like scripts) add the path to the `exclude` list in `vitest.config.ts`.

### ⑨ Flake builds fail with "unapproved flakes"

A test passed on retry. You must either:
- Fix the root cause (preferred), or
- Add an entry to `test-quarantine.json` with a short expiry and an owner

### ⑩ Prisma schema push fails during integration setup

```
Failed to push schema to test database after 3 attempts
```

The test DB container may be starting slowly. Wait 10–15 seconds and retry:

```sh
npm run test:db:push
```

Or restart the container:

```sh
npm run test:db:down && npm run test:db:up
```

---

*Last updated: 2026-03-17*
