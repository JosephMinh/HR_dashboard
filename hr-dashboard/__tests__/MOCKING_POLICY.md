# Test Mocking Policy & Quarantine Exception List

**Date**: 2026-03-17
**Bead**: hr-kfwh.20.1
**Author**: HazyBay (AI Agent)
**Reference**: COVERAGE_AUDIT.md, RISK_MATRIX.md

---

## Guiding Principle

> **Exercise real contracts unless isolation is essential.**
>
> Mocks that paper over real behavior hide bugs. Every mock is technical debt
> that must justify its existence by cost, speed, or nondeterminism.

---

## 1. When Mocks Are Acceptable

### 1A. Pure Logic Unit Tests (Mock-Free Zone)

Tests that verify pure transformations, computations, or validation logic
**MUST NOT** use `vi.mock()`. These functions have no side effects and no
external dependencies.

**Currently compliant** (no changes needed):
| Test File | What It Tests |
|-----------|---------------|
| `wfp-sanitize.test.ts` | Field sanitization, mapping, normalization |
| `wfp-import-parsers.test.ts` | Excel row parsing logic |
| `wfp-ids.test.ts` | UUID v5 generation |
| `email-templates.test.ts` | Template rendering (pure string output) |
| `validation-schemas.test.ts` | Zod schema validation rules |
| `form-foundation-utils.test.ts` | TanStack Form + Zod integration |
| `password-policy.test.ts` | Password strength rules |
| `rate-limit.test.ts` | Rate limit algorithm (uses in-memory store) |
| `storage-list-objects.test.ts` | S3 list operation formatting |
| `next-config.test.ts` | Config validation |
| `permissions.test.ts` | Role permission checks |
| `loading-transition.test.tsx` | CSS transition rendering |
| `page-header.test.tsx` | Static component rendering |

**Rule**: If a function can be tested by calling it directly with arguments and
checking the return value, it belongs here. No mocks.

### 1B. UI Component Tests (Router/Navigation Mocks Allowed)

React component tests that need to render in jsdom **may** mock:
- `next/navigation` (useRouter, useSearchParams) — no real router in jsdom
- `next/link` — renders as `<a>` but needs mock for href behavior
- `next-auth/react` — useSession needs a provider or mock

**Approved mocks for UI tests**:
| Mock Target | Reason | Replacement Path |
|-------------|--------|------------------|
| `next/navigation` | No real Next.js router in jsdom | None (inherent limitation) |
| `next/link` | Simplify link rendering in unit context | None |
| `next-auth/react` | Session provider not available in unit tests | None |
| `@tanstack/react-query` | QueryClient setup for isolated component tests | Consider using `QueryClientProvider` with real client instead |
| `@/hooks/queries` | Isolate component from API calls | **Promote to integration** for critical flows |
| `@/lib/api-client` | Prevent actual fetch calls in unit tests | None for unit; E2E covers real calls |
| `@/lib/status-config` | Static config; mock only if testing different configs | Prefer importing real module |

**Rule**: Mock the framework boundary (router, session), not the business logic.
If you're mocking `@/hooks/queries` to avoid testing the actual data flow,
consider whether an integration or E2E test should cover that path instead.

### 1C. Exceptional Cases (Quarantined — Must Have Owner & Expiry)

These mocks exist for cost, speed, or nondeterminism reasons. Each has an
explicit justification and a target date for replacement.

| Mock | Test File | Justification | Owner | Target Replacement | Bead |
|------|-----------|---------------|-------|-------------------|------|
| `nodemailer` | `email-service.test.ts` | External SMTP; test outbox covers integration | Email Harness | Build SMTP sink harness | hr-kfwh.11 |
| `@/lib/storage` (S3) | `resume-upload.test.ts` (integration) | S3/MinIO not always available | Storage Harness | Build storage harness with MinIO test container | hr-kfwh.14 |
| `@/lib/storage` (S3) | `cleanup-orphaned-resumes-route.test.ts` | S3 operations in unit test | Storage Harness | Move to integration with real MinIO | hr-kfwh.14 |
| `@/lib/rate-limit` | `password-setup-api.test.ts`, `users-self-service.test.ts`, `users-admin-api.test.ts` | Redis not available in test; rate limit interferes with rapid test execution | Rate-Limit Harness | Build rate-limit harness with in-memory store or test Redis | hr-kfwh.10 |
| `@/lib/email` | `users-admin-api.test.ts` | Email sending during user creation; avoid SMTP dependency | Email Harness | Use test outbox pattern already in codebase | hr-kfwh.11 |

### 1D. Required Metadata for New Mock Exceptions

`bun run test:preflight` now treats `__tests__/mock-inventory.json` as the
approved `vi.mock()` baseline. Any new `vi.mock()` outside that baseline must
carry explicit quarantine metadata within five lines above the mock site.

Required inline format:

```ts
// MOCK_QUARANTINE(owner=Storage Harness, bead=hr-kfwh.14, expires=2026-04-30):
// MinIO-backed harness is not available in this lane yet.
vi.mock("@/lib/storage", () => ({ /* ... */ }));
```

Required fields:
- `owner=`: who is responsible for removing the mock
- `bead=`: the removal or replacement bead
- `expires=`: the date the exception must be re-evaluated

Rule:
- If the mock already exists in `__tests__/mock-inventory.json`, it is part of
  the current approved baseline.
- If it is new, it must include the metadata above and the inventory/policy docs
  must be updated in the same change.

---

## 2. When Mocks Are NOT Acceptable

### 2A. Database Access (`@/lib/prisma`)

**Policy**: Integration tests MUST use a real database. Unit tests that mock
Prisma are testing the mock, not the query.

**Currently mocking Prisma (MUST be promoted or justified)**:

| Test File | Mock Count | Verdict | Action |
|-----------|-----------|---------|--------|
| `auth-enforcement-api.test.ts` | 1 (`prisma`) | **QUARANTINE** | These tests verify auth middleware behavior. The Prisma mock returns controlled data to test authorization logic. Acceptable as unit tests but MUST have parallel integration coverage for the same endpoints. |
| `candidate-detail-route.test.ts` | 1 (`prisma`) | **PROMOTE** | Route handler with real DB assertions needed. Integration test `candidates-detail.test.ts` already exists — verify it covers all cases, then deprecate unit mocks. |
| `candidates-post-route.test.ts` | 1 (`prisma`) | **PROMOTE** | Same — `candidates-post.test.ts` (integration) exists. Verify parity, then deprecate. |
| `candidates-route.test.ts` | 1 (`prisma`) | **PROMOTE** | Same — `candidates-get.test.ts` (integration) exists. |
| `jobs-route.test.ts` | 1 (`prisma`) | **PROMOTE** | Same — `jobs-get.test.ts` (integration) exists. |
| `applications-detail-route.test.ts` | 1 (`prisma`) | **PROMOTE** | Same — `applications.test.ts` (integration) exists. |
| `cleanup-orphaned-resumes-route.test.ts` | 1 (`prisma`) | **PROMOTE** | Needs integration test with real DB + storage harness. |
| `auth-config.test.ts` | 1 (`prisma`) | **QUARANTINE** | Auth config tests verify credential validation logic. Real DB test would be better but auth module initialization is complex. Target: hr-kfwh.9 |

**Rule**: Never add a new test that mocks `@/lib/prisma` unless it's testing
framework-level behavior (auth middleware, error handling) where the DB interaction
is incidental. All data-path tests must hit the real test database.

### 2B. Auth Session (`@/lib/auth`)

**Policy**: Auth mocking in integration tests is the single largest source of
mock debt in this codebase. 14 integration test files mock auth.

**Current state**: Every integration test mocks `@/lib/auth` to inject a session:
```typescript
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "...", role: "ADMIN" } }),
}));
```

**Why this is problematic**:
- If the real auth middleware changes behavior (e.g., adds a field check), mocked tests won't catch it
- Authorization bugs are invisible — the mock always returns whatever role you ask for
- Session refresh logic (`refreshJwtTokenFromDatabase`) is never tested

**Target state** (hr-kfwh.9): Build a real auth test harness that:
1. Creates real users with `bcrypt`-hashed passwords
2. Issues real JWT tokens via NextAuth
3. Passes real `Authorization` headers or cookies to route handlers
4. Tests authorization failures with real middleware

**Interim rule**: Auth mocks in integration tests are **QUARANTINED** with
explicit notation. No new integration tests should mock auth after the harness
lands. All 14 files must be migrated.

**Files to migrate** (in priority order):
1. `users-admin-api.test.ts` — admin operations are highest authorization risk
2. `resume-upload.test.ts` — file access control
3. `applications.test.ts` — recruiter-only mutations
4. `jobs-validation.test.ts` — mutation authorization
5. `candidates-validation.test.ts` — mutation authorization
6. `jobs-post.test.ts`, `jobs-get.test.ts`, `jobs-detail.test.ts`
7. `candidates-post.test.ts`, `candidates-get.test.ts`, `candidates-detail.test.ts`
8. `dashboard-stats.test.ts` — read-only, lowest risk
9. `validation-edge-cases.test.ts` — read/write mix
10. `password-setup-api.test.ts`, `users-self-service.test.ts` — auth-adjacent

### 2C. Validation (`@/lib/validations`)

**Policy**: Never mock validation in tests that exercise the data path. Validation
is a critical safety boundary.

**Currently mocking validation**:
| Test File | Verdict |
|-----------|---------|
| `candidate-detail-route.test.ts` | **REMOVE** — test with real validation |
| `candidates-post-route.test.ts` | **REMOVE** — test with real validation |
| `candidates-route.test.ts` | **REMOVE** — test with real validation |
| `applications-detail-route.test.ts` | **REMOVE** — test with real validation |
| `auth-enforcement-api.test.ts` | **QUARANTINE** — auth tests need controlled input |

**Rule**: If you're mocking validation to make a test pass, the test is testing
the wrong thing. Fix the test data instead.

### 2D. Audit Logging (`@/lib/audit`)

**Policy**: Audit mocks in unit tests are acceptable (testing route logic, not
audit). But at least one integration test per mutation endpoint must verify
audit entries are actually created.

**Currently mocking audit**: 4 unit test files. Acceptable for unit layer.
**Gap**: Zero tests verify audit entries exist in the database.

---

## 3. Classification Summary

### Tests That Should Stay Mocked (Approved)

| File | Category | Reason |
|------|----------|--------|
| All `*.test.tsx` UI component tests | 1B | Framework boundary mocks (router, session, query client) |
| `email-service.test.ts` | 1C | External SMTP dependency |
| `rate-limit.test.ts` | 1A | Uses in-memory store (not a mock, real implementation) |

### Tests That Must Be Promoted to Integration

| Unit Test File | Existing Integration Equivalent | Action |
|----------------|--------------------------------|--------|
| `candidate-detail-route.test.ts` | `candidates-detail.test.ts` | Verify integration covers all unit cases, then deprecate unit mocks |
| `candidates-post-route.test.ts` | `candidates-post.test.ts` | Same |
| `candidates-route.test.ts` | `candidates-get.test.ts` | Same |
| `jobs-route.test.ts` | `jobs-get.test.ts` | Same |
| `applications-detail-route.test.ts` | `applications.test.ts` | Same |
| `cleanup-orphaned-resumes-route.test.ts` | — (none exists) | **Create** integration test |
| `auth-enforcement-api.test.ts` | — (none exists) | **Create** integration test (hr-kfwh.20.3) |

### Integration Tests With Auth Mock Debt (Quarantined)

All 14 integration test files that mock `@/lib/auth` are quarantined pending
the real auth harness (hr-kfwh.9):

```
__tests__/integration/applications.test.ts
__tests__/integration/candidates-detail.test.ts
__tests__/integration/candidates-get.test.ts
__tests__/integration/candidates-post.test.ts
__tests__/integration/candidates-validation.test.ts
__tests__/integration/dashboard-stats.test.ts
__tests__/integration/jobs-detail.test.ts
__tests__/integration/jobs-get.test.ts
__tests__/integration/jobs-post.test.ts
__tests__/integration/jobs-validation.test.ts
__tests__/integration/password-setup-api.test.ts
__tests__/integration/resume-upload.test.ts
__tests__/integration/users-admin-api.test.ts
__tests__/integration/users-self-service.test.ts
__tests__/integration/validation-edge-cases.test.ts
```

---

## 4. Rules for New Tests

1. **No new `vi.mock('@/lib/prisma')`** — write integration tests with real DB
2. **No new `vi.mock('@/lib/auth')` in integration tests** — after auth harness lands (hr-kfwh.9)
3. **No new `vi.mock('@/lib/validations')`** — use real validation with correct test data
4. **Router/navigation mocks in component tests** — always allowed
5. **External service mocks** (SMTP, S3, Redis) — allowed with quarantine annotation:
   ```typescript
   // QUARANTINE: Mock until harness hr-kfwh.11 lands
   vi.mock('nodemailer', () => ({ ... }));
   ```
6. **Every quarantined mock must reference the bead** that will replace it
7. **Pure function tests must never mock** — if you need to mock to test a function, refactor the function

---

## 5. Mock Debt Burndown Targets

| Phase | Bead | Mock Eliminated | Tests Affected |
|-------|------|-----------------|----------------|
| 1 | hr-kfwh.9 | `@/lib/auth` in integration | 14 files (~350 tests) |
| 2 | hr-kfwh.11 | `nodemailer`, `@/lib/email` | 2 files (~20 tests) |
| 3 | hr-kfwh.14 | `@/lib/storage` (S3) | 3 files (~25 tests) |
| 4 | hr-kfwh.10 | `@/lib/rate-limit` | 3 files (~30 tests) |
| 5 | hr-kfwh.13 | `@/lib/prisma` in unit route tests | 7 files (~50 tests) |

**Total mock debt**: ~68 `vi.mock()` calls across 25 test files.
**Target**: Reduce to ~15 `vi.mock()` calls (framework boundaries only).
