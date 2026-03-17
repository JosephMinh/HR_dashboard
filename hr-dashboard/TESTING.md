# Testing Playbook

A complete guide to running and extending the HR Dashboard test suite.
**No prior contributor context required.**

---

## Table of Contents

1. [Suite Overview](#1-suite-overview)
2. [Prerequisites](#2-prerequisites)
3. [Running Tests Locally](#3-running-tests-locally)
4. [Running in CI](#4-running-in-ci)
5. [Integration Test Harnesses](#5-integration-test-harnesses)
   - [Database bootstrap](#51-database-bootstrap)
   - [Auth harness (setupTestAuth)](#52-auth-harness-setuptestauth)
   - [Email harness (setupEmailHarness)](#53-email-harness-setupemailharness)
   - [Storage harness (setupStorageHarness)](#54-storage-harness-setupstorageharness)
   - [Rate-limit harness (setupRateLimitHarness)](#55-rate-limit-harness-setupratelimitharness)
6. [E2E Test Setup](#6-e2e-test-setup)
   - [Fixture system](#61-fixture-system)
   - [Page logging](#62-page-logging)
   - [Failure artifacts](#63-failure-artifacts)
7. [Coverage Gates](#7-coverage-gates)
8. [Quality Gates Reference](#8-quality-gates-reference)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Suite Overview

| Layer | Runner | Location | Purpose |
|---|---|---|---|
| **Unit** | Vitest (jsdom) | `__tests__/unit/`, `__tests__/` | Validation, pure utilities, component logic, reporter output |
| **Integration** | Vitest (node) | `__tests__/integration/` | Route handlers against a real PostgreSQL test database |
| **System** | Vitest (node) | `__tests__/integration/system-test-lane.test.ts` | Full API lifecycle with real auth + email + storage + rate-limit stack |
| **E2E** | Playwright | `__tests__/e2e/` | Browser-level user journeys: jobs, candidates, applications, auth |

All four tiers run via `bun run test:all`.

---

## 2. Prerequisites

### Always required

- **Bun** ≥ 1.1
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Node.js** ≥ 20 (Playwright uses Node, not Bun)
- A running **PostgreSQL** instance for the dev database (used by E2E)

### Required for integration and system tests

A separate **test PostgreSQL** container on port 5433:

```bash
# Start (one-time or on reboot)
bun run test:db:up

# Push the current Prisma schema to the test DB
bun run test:db:push
```

The test DB uses `postgres:postgres` credentials.
Full connection string: `postgresql://postgres:postgres@localhost:5433/hr_dashboard_test`

### Optional for E2E

**MinIO** (S3-compatible local storage) is required for resume upload/download E2E tests. Most E2E suites skip storage tests automatically when MinIO is not configured.

```bash
docker compose up -d          # Starts MinIO on localhost:9000
./scripts/setup-minio.sh      # Creates bucket and access keys
```

---

## 3. Running Tests Locally

### Unit tests (fast, no external deps)

```bash
bun run test                  # Run once
bun run test:watch            # Watch mode
bun run test:coverage         # With coverage thresholds
```

### Integration tests (requires test DB on port 5433)

```bash
bun run test:integration
bun run test:integration:watch
bun run test:integration:coverage
```

### E2E tests (requires running app server)

```bash
# One-time: install Playwright browsers
bun run test:e2e:install

# Run E2E suite (starts app server automatically via playwright.config.ts)
bun run test:e2e

# Run a single spec file
bunx playwright test __tests__/e2e/jobs.spec.ts

# Run with browser visible (useful for debugging)
bunx playwright test --headed
```

### All suites in sequence

```bash
bun run test:all               # lint → tsc → unit → integration → e2e
bun run test:all -- --coverage # Same with coverage gates
bun run test:all -- --skip-e2e # Skip E2E (no browser required)
bun run test:all -- --only unit
bun run test:all -- --only integration
```

### Preflight check (smoke-test policy gates before a full run)

```bash
bash scripts/test-preflight.sh
```

---

## 4. Running in CI

The CI pipeline runs:

```
lint → tsc → unit coverage → integration coverage → E2E → flake summary
```

Environment variables that control CI behaviour:

| Variable | Default in CI | Effect |
|---|---|---|
| `CI` | `1` | Enables JUnit XML output, stricter flake policy |
| `SKIP_E2E` | `0` | Set to `1` to skip E2E in jobs that lack a browser |
| `SKIP_INTEGRATION` | `0` | Set to `1` if no test DB is available |
| `FAIL_ON_UNAPPROVED_FLAKES` | `1` in CI | Fails if a test retries and is not in the quarantine manifest |
| `FAIL_ON_EXPIRED_QUARANTINE` | `1` in CI | Fails if a quarantine entry is past its `expiresOn` date |

### Coverage artefacts

After a full CI run the merged coverage artefact lives at:

```
coverage/combined/coverage-summary.json    # per-file summary (JSON)
coverage/combined/index.html               # interactive HTML report
coverage/combined/report.md                # human-readable Markdown summary
coverage/combined/history/index.html       # trend chart across recent runs
```

Individual suite outputs:
```
coverage/coverage-summary.json             # unit only
coverage/integration/coverage-summary.json # integration only
```

---

## 5. Integration Test Harnesses

All harnesses live under `src/test/` and are accessed via:

```ts
import { setupIntegrationTests } from "@/test/setup-integration"
```

### 5.1 Database bootstrap

Every integration test file that needs a real DB calls `setupIntegrationTests()` at the module level:

```ts
import { setupIntegrationTests, getTestPrisma } from "@/test/setup-integration"

describe("my route", () => {
  setupIntegrationTests()              // registers beforeAll/afterAll/beforeEach hooks

  it("creates a record", async () => {
    const prisma = getTestPrisma()
    const job = await prisma.job.create({ data: { ... } })
    // ...
  })
})
```

`setupIntegrationTests()` options:

| Option | Default | Description |
|---|---|---|
| `resetBeforeEach` | `true` | Truncate all tables before each test. Set to `false` for read-only validation suites to avoid the extra DB round-trip |

### 5.2 Auth harness (`setupTestAuth`)

Replaces the per-file `vi.mock('@/lib/auth')` pattern.
Import **directly** — do not import from `setup-integration` (see module comment for why):

```ts
import { setupTestAuth } from "@/test/test-auth"
import { setupIntegrationTests } from "@/test/setup-integration"

describe("jobs API", () => {
  setupIntegrationTests()
  const testAuth = setupTestAuth()

  it("returns 200 for recruiter", async () => {
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

Key API:

| Method | Description |
|---|---|
| `loginAsNewUser({ role, email?, name? })` | Creates a fresh user in the test DB and sets the session |
| `loginAs(user)` | Log in as an existing `TestUser` |
| `logout()` | Clear the session (next route call returns 401) |
| `currentUser` | The currently logged-in `TestUser` or `null` |

**Why real auth?** The harness calls `refreshJwtTokenFromDatabase()` on every `auth()` invocation, so deactivations, role changes, and deletions immediately reflect in test sessions. Plain mocks would miss these behaviors.

### 5.3 Email harness (`setupEmailHarness`)

```ts
import { setupEmailHarness, setupIntegrationTests } from "@/test/setup-integration"

describe("user invite", () => {
  setupIntegrationTests()
  const testAuth = setupTestAuth()
  const email = setupEmailHarness()

  it("sends invite on create", async () => {
    await testAuth.loginAsNewUser({ role: "ADMIN" })
    const { POST } = await import("@/app/api/users/route")
    await POST(new Request("http://localhost/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice", email: "alice@example.com", role: "RECRUITER" }),
    }) as never)

    email.assertEmailSentTo("alice@example.com")
    const link = email.extractFirstLink(email.lastEmail()!)
    expect(link).toContain("/set-password?token=")
  })

  it("rolls back user if email fails", async () => {
    email.injectFailure("reject")
    // POST should return 502 and leave no user record
  })
})
```

Key API:

| Method | Description |
|---|---|
| `lastEmail()` | Returns the most recently captured `CapturedEmail` or `null` |
| `allEmails()` | Returns all emails in the outbox |
| `emailsSentTo(address)` | Returns emails addressed to `address` |
| `assertEmailSentTo(address)` | Throws if no email went to `address` |
| `assertNoEmailSent()` | Throws if any email was captured |
| `extractFirstLink(email)` | Returns the first `https?://` URL in the email body |
| `injectFailure(mode)` | Injects a one-shot delivery failure: `"reject"`, `"timeout"`, `"partial"` |
| `clearInjectedFailure()` | Remove injected failure before it fires |

The outbox is automatically cleared before each test.

### 5.4 Storage harness (`setupStorageHarness`)

```ts
import { setupStorageHarness, setupIntegrationTests } from "@/test/setup-integration"

describe("resume upload", () => {
  setupIntegrationTests()
  const storage = setupStorageHarness()

  it("stores object on upload", async () => {
    const { POST } = await import("@/app/api/upload/resume/route")
    await POST(new Request("http://localhost/api/upload/resume", {
      method: "POST",
      body: JSON.stringify({ fileName: "cv.pdf", contentType: "application/pdf" }),
      headers: { "Content-Type": "application/json" },
    }) as never)

    expect(storage.count).toBeGreaterThan(0)
    storage.assertObjectExists("resumes/") // prefix match
  })

  it("returns 503 on service outage", async () => {
    storage.injectFailure("service-unavailable")
    // ... next upload call should return 503
  })
})
```

Key API:

| Property / Method | Description |
|---|---|
| `count` | Number of objects currently in the in-memory store |
| `all()` | All stored objects as `StoredTestObject[]` |
| `objectExists(key)` | True if an object with that exact key (or key prefix) exists |
| `assertObjectExists(key)` | Throws if the object is not found |
| `assertObjectDoesNotExist(key)` | Throws if the object is found |
| `injectFailure(mode)` | One-shot failure: `"permission-denied"`, `"not-found"`, `"service-unavailable"`, `"timeout"` |
| `clearInjectedFailure()` | Remove injected failure |

Storage is automatically cleared (and test mode enabled) before each test.

### 5.5 Rate-limit harness (`setupRateLimitHarness`)

```ts
import { setupRateLimitHarness, setupIntegrationTests } from "@/test/setup-integration"

describe("password reset rate limit", () => {
  setupIntegrationTests()
  const rateLimit = setupRateLimitHarness()

  it("blocks after too many attempts", async () => {
    rateLimit.exhaustScope("auth", "127.0.0.1")
    const res = await enforceApiRateLimit({
      headers: new Headers({ "x-forwarded-for": "127.0.0.1" }),
      method: "POST",
      nextUrl: { pathname: "/api/auth/session" },
    })
    rateLimit.assert429(res!)
  })

  it("resets after window expires", async () => {
    rateLimit.exhaustScope("auth", "127.0.0.1")
    rateLimit.advanceTime(60_001)   // ms — move past the 1-min window
    const res = await enforceApiRateLimit({ ... })
    expect(res).toBeUndefined()     // not blocked
  })
})
```

Key API:

| Method | Description |
|---|---|
| `advanceTime(ms)` | Move the virtual clock forward by `ms` milliseconds |
| `setTime(ms)` | Set virtual clock to an absolute epoch value |
| `consumeScope(scope, ip, count?)` | Consume `count` credits for a scope key |
| `exhaustScope(scope, ip)` | Fully exhaust a scope limit (auth=10, write=60, read=300, upload=20) |
| `consumeRoute(key, rule, count?)` | Consume credits for a custom per-route key |
| `exhaustRouteLimit(key, rule)` | Exhaust a custom route limit |
| `enforceRoute(key, rule)` | Call `enforceRouteRateLimit` with virtual time |
| `enforceApi(request)` | Call `enforceApiRateLimit` with virtual time |
| `assert429(response)` | Assert status 429 and presence of `Retry-After` header |
| `assertRateLimitHeaders(response, expected?)` | Assert `X-RateLimit-Limit/Remaining/Reset` headers |

Scopes: `"auth"` (10/min) · `"write"` (60/min) · `"read"` (300/min) · `"upload"` (20/min)

---

## 6. E2E Test Setup

### 6.1 Fixture system

All E2E specs import from `./fixtures` (not directly from `@playwright/test`):

```ts
import { test, expect } from "./fixtures"

test("my flow", async ({ recruiterPage, prisma, logger }) => {
  // recruiterPage: Page logged in as RECRUITER
  // prisma: PrismaClient connected to the test DB
  // logger: E2ETestLogger for structured logging
})
```

Available fixtures:

| Fixture | Type | Description |
|---|---|---|
| `adminPage` | `Page` | Pre-authenticated page as ADMIN (worker-scoped context) |
| `recruiterPage` | `Page` | Pre-authenticated page as RECRUITER (worker-scoped context) |
| `viewerPage` | `Page` | Pre-authenticated page as VIEWER (worker-scoped context) |
| `prisma` | `PrismaClient` | Direct DB access for setup/assertion |
| `logger` | `E2ETestLogger` | Structured test logger (auto-attached to page) |
| `loginAs` | `(page, role) => Promise<void>` | Login utility for manual auth flows |
| `pageWithLogger` | `{ page, logger }` | Combined page + logger object |

Test users are defined in `__tests__/e2e/utils/auth.ts` under `TEST_USERS`. They must exist in the dev database before running E2E tests (run `bun run db:seed` or create them manually).

**Parallel safety**: worker-scoped contexts (`adminContext`, `recruiterContext`, `viewerContext`) are reused within a Playwright worker, reducing auth overhead. Seed data created via `prisma` fixture uses `Date.now()`-based unique suffixes to prevent cross-test collisions.

### 6.2 Page logging

Every page in the fixture system is wrapped with `createLoggedPage`, which emits structured log entries for all user-visible actions.

```ts
test("stage transition", async ({ recruiterPage: page, logger }) => {
  logger.info("Starting stage transition test")

  // All page actions are automatically logged as steps
  await page.goto("/jobs")
  await page.getByRole("button", { name: /add candidate/i }).click()

  // Sensitive values are automatically redacted in logs
  await page.getByLabel("Password").fill("SuperSecret123!")
  // → logged as: fill label=Password { redacted: true, valueLength: 15 }
})
```

Network logging is filtered to API mutations, failures, and error responses (noise from GET 200s is suppressed).

### 6.3 Failure artifacts

On test failure (including `timedOut`), the following artifacts are automatically attached:

| Artifact | Content |
|---|---|
| `execution-log` | Full structured test log with step timeline and network events |
| `browser-console` | Browser `console.*` output and `pageerror` events with source locations |
| `screenshot` | Playwright screenshot at the moment of failure |
| `video` | Full test recording (if video is enabled in playwright.config.ts) |
| `trace` | Playwright trace (if tracing is enabled) |

Artifacts appear in:
- **HTML report**: `bunx playwright show-report`
- **CI artefact store**: uploaded via the CI artefact step
- **JSON report**: `test-results/playwright/report.json` — includes per-test step timings

#### Reading the execution-log

The execution log is structured as:

```
=== Execution Log: <test title> ===

--- Event Log ---
[HH:MM:SS.mmm]  INFO   navigate to /jobs
[HH:MM:SS.mmm]  STEP   → navigate to /jobs
[HH:MM:SS.mmm]  INFO   fill label=Password { redacted: true, valueLength: 15 }
[HH:MM:SS.mmm]  NETWORK POST /api/applications 201 42ms
[HH:MM:SS.mmm]  ERROR  Request failed: GET /api/jobs (socket hang up)

--- Browser Console ---
[WARNING] Deprecated API  http://localhost:3000/app.js:7:3
[ERROR]   Something went wrong  http://localhost:3000/page.js:42:1
```

Levels: `INFO` · `STEP` · `NETWORK` · `ERROR` · `CONSOLE`

---

## 7. Coverage Gates

### Current thresholds (unit suite)

| Metric | Gate |
|---|---|
| Statements | 63% |
| Branches | 54% |
| Functions | 58% |
| Lines | 63% |

These are honest current-baseline gates (not aspirational). They will be raised incrementally as new coverage is added.

### Running coverage

```bash
# Unit coverage (fast, ~30s)
bun run test:coverage

# Integration coverage (requires test DB, ~2–5 min)
bun run test:integration:coverage

# Merge both into combined report
bun run coverage:merge

# View HTML report
open coverage/combined/index.html
```

### Diff-aware coverage check

To ensure changed files don't hide behind aggregate legacy numbers:

```bash
# Check changed src/ files against 80% line coverage threshold
bun run scripts/coverage-diff.ts --base origin/main

# With a different threshold
bun run scripts/coverage-diff.ts --base main --threshold 70 --branch-threshold 60

# Check staged files only (pre-push hook use case)
bun run scripts/coverage-diff.ts --staged

# Report without failing the build (CI ramp-up)
bun run scripts/coverage-diff.ts --warn-only
```

The script reads `coverage/coverage-summary.json` (unit) by default. Pass `--summary coverage/integration/coverage-summary.json` to check integration coverage instead.

---

## 8. Quality Gates Reference

| Gate | Where enforced | How to check |
|---|---|---|
| Unit coverage thresholds | `vitest.config.ts` | `bun run test:coverage` |
| Integration coverage thresholds | `vitest.config.integration.ts` | `bun run test:integration:coverage` |
| Diff-aware per-file coverage | `scripts/coverage-diff.ts` | `bun run scripts/coverage-diff.ts` |
| Mock policy baseline | `scripts/test-preflight.sh` | `bash scripts/test-preflight.sh` |
| New vi.mock() quarantine metadata | `__tests__/MOCKING_POLICY.md` | `bash scripts/test-preflight.sh` |
| TypeScript strict mode | `tsconfig.json` | `bunx tsc --noEmit` |
| Lint (ESLint) | `.eslintrc` | `bun run lint` |
| E2E Playwright | `playwright.config.ts` | `bun run test:e2e` |
| Security headers | `scripts/verify-security-headers.mjs` | `bun run verify:headers` |
| Flake quarantine manifest | `test-quarantine.json` | `bun run test:all` (Flake Summary stage) |

### Mock quarantine policy

Adding a new `vi.mock(...)` call requires an inline quarantine comment:

```ts
// MOCK_QUARANTINE(owner=alice, bead=hr-kfwh.X, expires=2026-06-30)
vi.mock("@/lib/some-module")
```

Any new mock not in `__tests__/mock-inventory.json` **and** lacking this comment will fail the preflight gate. See `__tests__/MOCKING_POLICY.md` for the full policy.

---

## 9. Troubleshooting

### Decision tree for setup failures

```
Test run fails immediately on startup
├── "Cannot connect to database"
│   ├── Is the test container running?  →  bun run test:db:up
│   ├── Wrong port?  →  check DATABASE_URL_TEST in .env.test (should be port 5433)
│   └── Schema out of date?  →  bun run test:db:push
│
├── "Module not found: @/lib/..."
│   └── Prisma client not generated?  →  bun run db:generate
│
└── "vi.mock hoisting error" or "Cannot re-mock"
    └── setupTestAuth() imported from wrong path?
        → Import from "@/test/test-auth", NOT from "@/test/setup-integration"

Individual tests fail
├── "401 Unauthorized" in integration test
│   ├── testAuth.loginAsNewUser() called before the request?
│   ├── Using setupTestAuth() from setup-integration (causes hoisting bug)?  →  see above
│   └── DB reset truncated the session user?  →  loginAsNewUser() creates a fresh user each time
│
├── "No email in outbox" assertion fails
│   ├── NODE_ENV=test or VITEST=true set?  →  required for test-mode email capture
│   └── emailHarness.injectFailure() still active from a previous test?  →  harness auto-resets beforeEach
│
├── Storage assertion fails ("object not found")
│   ├── Storage test mode active?  →  setupStorageHarness() enables it automatically
│   └── Key format mismatch?  →  assertObjectExists() supports prefix matching ("resumes/")
│
└── Rate-limit test passes when it should block
    ├── harness.reset() called accidentally?  →  auto-resets before each test; don't call manually
    └── Virtual time not advanced?  →  after exhausting a scope, rateLimit.advanceTime(windowMs+1)

E2E tests fail
├── "Browser not installed"  →  bun run test:e2e:install
│
├── "Could not find TEST_USER for role ADMIN" (or similar)
│   └── Test users not seeded  →  bun run db:seed  (or create via /admin/users)
│
├── App server not running / connection refused
│   └── playwright.config.ts webServer config should start it automatically;
│       if running manually: bun run dev  (default port 3000)
│
├── "timeout waiting for element"
│   ├── Check execution-log attachment (bunx playwright show-report) for last step
│   ├── Check browser-console attachment for JS errors
│   └── Re-run with --headed to watch live: bunx playwright test --headed
│
└── Playwright artifacts not appearing in CI
    └── logger fixture auto-attaches execution-log and browser-console on failure;
        ensure test uses the fixture from ./fixtures (not @playwright/test directly)
```

### Port reference

| Service | Port | Usage |
|---|---|---|
| Dev PostgreSQL | 5432 | App server (`DATABASE_URL`) |
| Test PostgreSQL | 5433 | Integration tests (`DATABASE_URL_TEST`) |
| Dev server (Next.js) | 3000 | E2E tests (`PLAYWRIGHT_PORT`) |
| MinIO API | 9000 | Resume upload/download E2E |
| MinIO Console | 9001 | Browser UI for MinIO management |

### Environment files

| File | Purpose |
|---|---|
| `.env` | Dev environment (gitignored) |
| `.env.example` | Template — copy to `.env` and fill in |
| `.env.test` | Test overrides sourced by `bun run test:e2e` and `test:db:push` |

### Useful one-liners

```bash
# Run a single integration test file
bunx vitest run --config vitest.config.integration.ts __tests__/integration/jobs-get.test.ts

# Run a single unit test by pattern
bunx vitest run -t "validates email format"

# Run a single E2E spec
bunx playwright test __tests__/e2e/jobs.spec.ts

# Open interactive Playwright report
bunx playwright show-report

# Inspect test DB directly
psql postgresql://postgres:postgres@localhost:5433/hr_dashboard_test

# Reset test DB schema (drop + recreate all tables)
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/hr_dashboard_test \
  bunx prisma db push --force-reset

# TypeScript check only
bunx tsc --noEmit

# Run lint with auto-fix
bunx eslint --fix .
```
