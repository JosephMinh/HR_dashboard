# Test Suite Coverage Audit

**Date**: 2026-03-17
**Bead**: hr-kfwh.19.1
**Author**: HazyBay (AI Agent)

---

## 1. Coverage Metrics

### Line/Branch/Function Coverage

**Status**: V8 coverage APIs are **not available** under Bun 1.3.10 runtime. Both `bun run test:coverage` and `--pool=forks` fail with `Error: Coverage APIs are not supported`. Native Node.js is not installed in this environment.

**Workaround**: To generate coverage reports, install Node.js or use `npx` with a Node-compatible runtime:
```bash
# Requires native Node.js (not bun's node shim)
NODE_PATH=$(which node) npx vitest run --coverage
```

### Test Counts (as of 2026-03-17)

| Suite | Files | Tests | Pass | Fail | Notes |
|-------|-------|-------|------|------|-------|
| **Unit** | 35 | ~420+ | — | — | Includes coverage-diff, playwright-logging, WFP import unit tests |
| **Integration** | 25 | ~400+ | — | — | Requires test DB on port 5433 |
| **E2E** | 20 | ~220+ | — | — | Requires running app + Playwright |
| **Total** | **80** | **~1040+** | — | — | |

### Known Flaky Tests
- `add-candidate-dialog.test.tsx` > "does not attach candidate immediately" — timeout (5s)
- `premium-ux-interactions.test.tsx` > "renders basic empty state with create action" — timeout (5s)

---

## 2. Mock Usage Inventory

### vi.mock() Usage by Module

| Mocked Module | Count | Test Files Using It |
|---------------|-------|---------------------|
| `@/lib/auth` | 7 | 6 unit test files + 1 integration test (setup-test-auth.test.ts tests the harness); integration tests use `setupTestAuth()` instead |
| `@/lib/prisma` | ~8 | API route unit tests |
| `@/lib/storage` | ~4 | Upload/resume tests |
| `@/lib/audit` | ~3 | API route tests |
| `@/lib/validations` | ~3 | Route handler tests |
| `next/navigation` | ~5 | Component tests (useRouter, useSearchParams) |
| `@tanstack/react-query` | ~3 | Hook/component tests |
| `@/hooks/queries` | ~3 | Component tests |
| `nodemailer` | 1 | email-service.test.ts |

### vi.fn() Usage Density

| Category | Typical Count | Purpose |
|----------|---------------|---------|
| UI component tests | 8–33 per file | onClick, onClose, onSubmit callbacks |
| API route tests | 6–12 per file | Service method stubs, Prisma method returns |
| Utility tests | 0–3 per file | Minimal or none |

### Mock Classification

| Category | Description | Files |
|----------|-------------|-------|
| **Fake Auth** | Mocked session with configurable role | 6 unit test files (integration tests use `setupTestAuth()` real-DB harness) |
| **Fake DB (Prisma)** | `prisma.job.findMany` etc. stubbed | 8 unit test files |
| **Real DB** | Actual PostgreSQL via test factories | 17 integration files |
| **Fake Storage (S3)** | Mocked `getSignedUrl`, `deleteObject` | 3–4 test files |
| **In-Memory Email** | `getTestOutbox()` / `clearTestOutbox()` | Integration + email tests |
| **Mocked Router** | `useRouter`, `useSearchParams` stubs | 5 component test files |
| **No Mocking** | Pure function tests | 13 unit test files |

### Pure Tests (Zero Mocking)

These test files use **no** `vi.mock()` or `vi.fn()`:
- `wfp-sanitize.test.ts` (96 tests)
- `wfp-import-parsers.test.ts` (34 tests)
- `wfp-ids.test.ts` (9 tests)
- `email-templates.test.ts` (27 tests)
- `validation-schemas.test.ts` (70 tests)
- `form-foundation-utils.test.ts` (79 tests)
- `password-policy.test.ts` (151 tests)
- `rate-limit.test.ts` (12 tests — uses in-memory store)
- `storage-list-objects.test.ts` (4 tests)
- `next-config.test.ts` (49 tests)
- `permissions.test.ts` (10 tests)
- `loading-transition.test.tsx` (0 mocks)
- `page-header.test.tsx` (0 mocks)

---

## 3. Business Flow Coverage Map

### Legend
- ✅ **Well-Covered**: Multiple test layers, critical paths exercised
- ⚠️ **Partial**: Some coverage but gaps in key scenarios
- ❌ **No Coverage**: No tests exist

| # | Business Area | Risk | Unit | Integration | E2E | Status |
|---|---------------|------|------|-------------|-----|--------|
| 1 | **Authentication & Sessions** | HIGH | 32 tests | — | 45+ tests | ✅ Well |
| 2 | **Job CRUD** | HIGH | 12 tests | 70 tests | 29 tests | ✅ Well |
| 3 | **Candidate CRUD** | HIGH | 29 tests | 76 tests | 39 tests | ✅ Well |
| 4 | **Application Stage Transitions** | HIGH | 6 tests | 25 tests | 13 tests | ✅ Well |
| 5 | **User Management (Admin)** | HIGH | — | 90 tests | 20+ tests | ✅ Well |
| 6 | **Email / Notifications** | HIGH | 46 tests | 12 tests | 12 tests | ✅ Well |
| 7 | **File Uploads / S3** | HIGH | 4 tests | 48 tests | 10 tests | ✅ Well |
| 8 | **Dashboard / Analytics** | MED | — | 4 tests | 6 tests | ⚠️ Minimal |
| 9 | **WFP Import (Parsing)** | CRITICAL | 139 tests | — | — | ⚠️ Partial |
| 10 | **WFP Import (Full Cycle)** | CRITICAL | — | — | — | ❌ None |
| 11 | **Rate Limiting** | MED | 22 tests | — | — | ⚠️ Partial |
| 12 | **Headcount Projections API** | LOW | — | — | — | ❌ None |
| 13 | **Tradeoffs API** | LOW | — | — | — | ❌ None |
| 14 | **Cron: Orphaned Resume Cleanup** | HIGH | 6 tests | — | — | ⚠️ Minimal |

---

## 4. Critical Blind Spots

### CRITICAL: WFP Import Full-Cycle (No Integration Test)

**What's missing**: The `import-wfp.ts` script performs a **destructive** bulk operation:
1. Clears all Tradeoff, HeadcountProjection, Application, Candidate, Job rows
2. Parses Excel workbook
3. Inserts hundreds of rows in a transaction

**Currently tested**: Parsing functions (sanitization, normalization, field mapping) have 139+ unit tests. The orchestration script has **zero** tests.

**Specific gaps**:
- No test for table-clearing cascade behavior
- No test for deterministic UUID v5 idempotency across re-imports
- No test for tempJobId ambiguity resolution
- No test for orphaned resume files after import clears candidates
- No test for transaction rollback on partial failure

**Risk**: A single bad import could wipe the production database with no automated safety net.

### HIGH: Headcount & Tradeoff API Endpoints

**What's missing**: `/api/headcount/` and `/api/tradeoffs/` are read-only list endpoints with pagination and filtering. Neither has any tests.

**Risk**: Silent bugs in filtering, sorting, or pagination could go unnoticed. These are new endpoints added as part of the WFP import feature.

### HIGH: Cron Resume Cleanup Under Real Conditions

**What's missing**: The cleanup cron (`/api/cron/cleanup-orphaned-resumes`) has unit tests for its logic but:
- No test for actual S3 file deletion
- No test for race conditions (cleanup while upload in progress)
- No test verifying 7-day grace period with real timestamps

### MEDIUM: Rate Limiting Under Load

**What's missing**:
- No test for Redis failover to in-memory fallback
- No test for concurrent request behavior
- No test for IP detection across proxy headers

### MEDIUM: Security Edge Cases

**What's missing**:
- No XSS prevention tests for notes/description fields
- No SQL injection tests for search parameters (though Prisma parameterizes)
- No test for malformed JSON request body handling

---

## 5. Test Infrastructure Notes

### Test Database
- **Port**: 5433 (separate from dev on 5432)
- **Credentials**: postgres:postgres
- **Setup**: `npm run test:db:up` (Docker Compose)
- **Schema push**: `npm run test:db:push`
- **Factories**: `createUser()`, `createJob()`, `createCandidate()`, `createApplication()`

### E2E Infrastructure
- **Framework**: Playwright (Chromium)
- **Auth fixtures**: `adminPage`, `recruiterPage`, `viewerPage` (pre-authenticated)
- **Test users**: ADMIN, RECRUITER, VIEWER roles
- **Utilities**: auth helpers, database access, network logging

### Coverage Tooling
- **Provider**: `@vitest/coverage-v8` (functional under Node.js; Bun requires `--pool=forks`)
- **Config**: `vitest.config.ts` → `./coverage`, `vitest.config.integration.ts` → `./coverage/integration`
- **Merged output**: `scripts/merge-coverage.mjs` produces `coverage/combined/` with HTML + JSON summary + trend history
- **Commands**: `bun run test:coverage`, `bun run test:integration:coverage`, `npm run coverage:guard`

---

## 6. Recommendations (Prioritized)

### P0 — Before Next WFP Import
1. **Add WFP import integration test** — validate full cycle: clear → parse → insert → verify counts and FK integrity
2. **Add idempotency test** — run import twice, verify same UUIDs and no duplicates

### P1 — Next Sprint
3. **Add headcount/tradeoff API tests** — at minimum, integration tests for list + filter
4. **Fix coverage tooling** — switch to `@vitest/coverage-istanbul` for Bun compatibility
5. **Fix flaky UI timeouts** — increase timeout or simplify async patterns in `add-candidate-dialog` and `premium-ux-interactions`

### P2 — Backlog
6. **Add cron cleanup integration test** with real S3 mock
7. **Add rate-limit integration test** with Redis fallback
8. **Add security-focused tests** for input sanitization boundary
9. **Expand dashboard test coverage** — metrics accuracy under various data states
