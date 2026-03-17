# Mock, Fake & Stub Audit

**Bead**: hr-kfwh.1
**Date**: 2026-03-17
**Author**: HazyBay
**Machine-readable**: [`mock-inventory.json`](./mock-inventory.json)

---

## Scan Scope

| Suite | Files Scanned | Files with Mocks | Mock-Free |
|-------|:---:|:---:|:---:|
| Unit (.ts) | 23 | 10 | 13 |
| Unit (.tsx) | 10 | 7 | 3 |
| Integration | 22 | 6 | 16 |
| E2E | 13 | 0 | 13 |
| Test Infra | 6 | 1 | 5 |
| **Total** | **74** | **24** | **50** |

---

## Aggregate Counts

| Metric | Count |
|--------|:---:|
| `vi.mock()` calls | 60 |
| `vi.fn()` instances | 55 |
| `vi.spyOn()` calls | 4 |
| `vi.stubGlobal()` calls | 3 |
| **Total mock operations** | **122** |

---

## Top 20 Highest-Risk Mocks

Ranked by potential for false positives (tests pass but prod breaks).

| # | File | Mock Target | Layer | Risk | Why Dangerous | Disposition |
|---|------|-------------|-------|------|---------------|-------------|
| 1 | `unit/candidate-detail-route.test.ts` | `zod` | validation | **HIGH** | Mocking Zod itself bypasses *all* schema validation. A malformed payload accepted by mock will succeed in tests but crash in prod. | **REMOVE** |
| 2 | `unit/jobs-route.test.ts` | `@/lib/prisma` | db | **HIGH** | Mocked findMany/count/create return hand-crafted objects. Schema drift, missing relations, constraint violations are invisible. | Replace now |
| 3 | `unit/candidates-post-route.test.ts` | `@/lib/prisma` | db | **HIGH** | Mocks `$transaction()` — hides deadlocks, FK violations, rollback bugs that only surface with real DB. | Replace now |
| 4 | `unit/auth-enforcement-api.test.ts` | `@/lib/prisma` | db | **HIGH** | 10 vi.fn() stubs; maximum surface area for mock/prod divergence. | Replace now |
| 5 | `unit/applications-detail-route.test.ts` | `@/lib/prisma` | db | **HIGH** | Mocked findUnique/update/delete skip cascading delete rules. | Replace now |
| 6 | `unit/auth-config.test.ts` | `@/lib/prisma` | db | **HIGH** | Mocks credential verification findUnique; hides bcrypt timing, NULL handling. | Replace now |
| 7 | `unit/candidate-detail-route.test.ts` | `@/lib/prisma` | db | **HIGH** | Same pattern as #4. | Replace now |
| 8 | `unit/candidates-route.test.ts` | `@/lib/prisma` | db | **HIGH** | Mocked findMany/count for GET route. | Replace now |
| 9 | `unit/jobs-route.test.ts` | `@/lib/auth` | auth | **HIGH** | Returns `{ user: { id, role } }` directly; skips active check, mustChangePassword, JWT refresh. | Replace now |
| 10 | `unit/auth-enforcement-api.test.ts` | `@/lib/auth` | auth | **HIGH** | Same pattern as #9. | Replace now |
| 11 | `unit/applications-detail-route.test.ts` | `@/lib/auth` | auth | **HIGH** | Same pattern. | Replace now |
| 12 | `unit/candidate-detail-route.test.ts` | `@/lib/auth` | auth | **HIGH** | Same pattern. | Replace now |
| 13 | `unit/candidates-route.test.ts` | `@/lib/auth` | auth | **HIGH** | Same pattern. | Replace now |
| 14 | `unit/candidates-post-route.test.ts` | `@/lib/auth` | auth | **HIGH** | Same pattern. | Replace now |
| 15 | `unit/auth-enforcement-api.test.ts` | `@/lib/storage` | storage | **HIGH** | Mocks presigned URL gen — hides key format, signature expiry, content-type negotiation. | Replace later |
| 16 | `unit/candidate-detail-route.test.ts` | `@/lib/storage` | storage | **HIGH** | Same. | Replace later |
| 17 | `integration/resume-upload.test.ts` | `@/lib/storage` | storage | **HIGH** | Integration test that still mocks storage — undermines the point of integration testing. | Replace later |
| 18 | `unit/cleanup-orphaned-resumes-route.test.ts` | `@/lib/storage` | storage | **HIGH** | Mocks listObjects/deleteObject; hides pagination, prefix-matching, error codes. | Replace later |
| 19 | `unit/cleanup-orphaned-resumes-route.test.ts` | `@/lib/prisma` | db | **HIGH** | Coupled with #18. | Replace later |
| 20 | `unit/candidate-detail-route.test.ts` | `@/lib/validations` | validation | **MED** | Bypasses validation module; less critical since real validation tested in integration. | Replace now |

---

## Layer-by-Layer Summary

### Auth (`@/lib/auth`, `next-auth`, `next-auth/react`)

| Location | Mock Style | Risk | Status |
|----------|-----------|------|--------|
| 6 unit route tests | `vi.mock` → `vi.fn()` returning fabricated session | HIGH | **Replace now** — `setupTestAuth()` harness exists |
| `test-auth.ts` (infra) | `vi.mock` → real DB-backed auth | LOW | Necessary (the harness itself) |
| `form-ux-regressions.test.tsx` | `vi.mock("next-auth/react")` | LOW | Necessary — UI form test, not auth test |
| `auth-config.test.ts` | `vi.mock("next-auth")` | MED | Necessary — tests callback extraction |

**Replacement strategy**: All 6 unit route test files (`jobs-route`, `auth-enforcement-api`, `applications-detail-route`, `candidate-detail-route`, `candidates-route`, `candidates-post-route`) should migrate to integration tests using `setupTestAuth()`. The auth mock there exercises `refreshJwtTokenFromDatabase` and checks active/role/mustChangePassword from the real DB.

### Database (`@/lib/prisma`)

| Location | Mock Style | Risk | Status |
|----------|-----------|------|--------|
| 7 unit tests | `vi.mock` → vi.fn() stubs per method | HIGH | **Replace now** |
| 5 integration tests | `vi.mock` → redirect to test DB pool | LOW | Necessary |

**Replacement strategy**: The 7 unit tests with high-risk Prisma mocks should be superseded by integration tests that run against the real test DB (port 5433). The integration test `vi.mock("@/lib/prisma")` redirects to the test pool and is safe — it runs *real* queries against *real* schema.

### Storage (`@/lib/storage`)

| Location | Mock Style | Risk | Status |
|----------|-----------|------|--------|
| 3 unit tests | `vi.mock` → vi.fn() stubs | HIGH | Replace later |
| 1 integration test | `vi.mock` → vi.fn() for URLs | HIGH | Replace later |
| 1 unit test | `vi.spyOn(S3Client)` | MED | Replace later |

**Replacement strategy**: Build a real storage harness (bead hr-kfwh.14) using MinIO in Docker for local/CI. Until then, storage mocks are the only option. Priority: resume-upload integration test should be first to convert.

### Validation (`@/lib/validations`, `zod`)

| Location | Mock Style | Risk | Status |
|----------|-----------|------|--------|
| 5 unit tests | `vi.mock("@/lib/validations")` | MED | Replace now |
| 1 unit test | `vi.mock("zod")` | HIGH | **REMOVE immediately** |

**Replacement strategy**: Stop mocking validation in route tests. Integration tests already exercise real Zod schemas. The `vi.mock("zod")` in `candidate-detail-route.test.ts` should be removed immediately — mocking the validation library itself is never safe.

### Audit (`@/lib/audit`)

| Location | Mock Style | Risk | Status |
|----------|-----------|------|--------|
| 4 unit tests | `vi.mock` → silent stubs | MED | Replace later |

**Replacement strategy**: Low priority. Audit is a write-only side effect. Integration tests already verify audit log creation against the real DB. Unit test silencing is acceptable.

### Email (`nodemailer`, `@/lib/email`)

| Location | Mock Style | Risk | Status |
|----------|-----------|------|--------|
| 1 unit test | `vi.mock("nodemailer")` | MED | Replace later |
| 2 integration tests | `vi.mock("@/lib/email")` pass-through | LOW | Necessary |

**Replacement strategy**: The email harness (bead hr-kfwh.11) provides real SMTP sink testing. The unit test mock of `nodemailer` is acceptable for testing template rendering. Integration pass-throughs are safe.

### Rate Limit (`@/lib/rate-limit`)

| Location | Mock Style | Risk | Status |
|----------|-----------|------|--------|
| 4 integration tests | `vi.mock` pass-through | LOW | Necessary |

**Replacement strategy**: These are pass-through mocks for Vitest module re-evaluation, not behavior mocks. They run the real rate-limit implementation. No action needed.

### UI Navigation / State (`next/navigation`, `@tanstack/react-query`, `@/hooks/queries`, etc.)

| Location | Mock Style | Risk | Status |
|----------|-----------|------|--------|
| 7 component tests | `next/navigation` | LOW | Necessary |
| 6 component tests | Query/hook mocks | LOW | Necessary |

**Replacement strategy**: None needed. jsdom has no real Next.js router or server components. These mocks are standard practice for React component testing. E2E tests via Playwright cover the real navigation.

---

## Disposition Summary

| Disposition | Count | Action |
|-------------|:---:|--------|
| **Necessary** | 30 | Keep — no replacement available or mock is the harness itself |
| **Replace now** | 18 | Migrate to integration tests using existing harnesses (auth, DB) |
| **Replace later** | 11 | Blocked on new harnesses (storage: hr-kfwh.14) |
| **Remove** | 1 | `vi.mock("zod")` in candidate-detail-route — remove immediately |

---

## Recommended Migration Order

1. **Immediate**: Remove `vi.mock("zod")` from `candidate-detail-route.test.ts`
2. **Wave 1** (hr-kfwh.13): Migrate 6 unit route tests that mock `@/lib/auth` + `@/lib/prisma` to integration tests using `setupTestAuth()` + real DB
3. **Wave 2** (hr-kfwh.25): Migrate remaining `@/lib/validations` mocks by using real Zod schemas
4. **Wave 3** (hr-kfwh.14): Build storage harness, then migrate `@/lib/storage` mocks
5. **Ongoing**: Audit and email mocks are low priority — convert opportunistically
