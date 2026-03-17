# Mock Audit Summary

**Bead:** hr-kfwh.1
**Author:** HazyBay
**Date:** 2026-03-17
**Files scanned:** 55 test files (100%)
**Total mock instances:** 87

## Breakdown by Technique

| Technique | Count |
|-----------|-------|
| `vi.mock` | 68 |
| `vi.stubEnv` | 11 |
| `vi.spyOn` | 4 |
| `vi.stubGlobal` | 3 |
| `globalThis.fetch` | 1 |

## Breakdown by Layer

| Layer | Count | Risk Profile |
|-------|-------|-------------|
| db (`@/lib/prisma`) | 13 | 12 high (unit), 1 low (integration redirect) |
| auth (`@/lib/auth`, `next-auth`) | 10 | 8 high, 2 low |
| ui_hooks (navigation, queries) | 15 | all low |
| validation (`@/lib/validations`, `zod`) | 6 | all medium |
| audit (`@/lib/audit`) | 5 | all medium |
| storage (`@/lib/storage`) | 5 | 4 low (necessary), 1 medium |
| rate_limit (`@/lib/rate-limit`) | 4 | all medium |
| email (`@/lib/email`, `nodemailer`) | 3 | 1 low, 2 medium |
| network (`fetch`, `@/lib/api-client`) | 4 | 3 low, 1 medium |
| environment (`vi.stubEnv`) | 11 | all low |
| other (console spies) | 3 | all low |

## Disposition Summary

| Disposition | Count | Description |
|-------------|-------|-------------|
| **necessary** | 52 | Must remain mocked (external services, UI framework, env config) |
| **replaceable_now** | 21 | Harness or test DB redirect already exists |
| **replaceable_later** | 14 | Replacement blocked on planned work |

## Governance Baseline

- `__tests__/mock-inventory.json` is the approved `vi.mock()` baseline.
- `bun run test:preflight` fails if a new `vi.mock()` is added outside that
  baseline without inline `MOCK_QUARANTINE(owner=..., bead=..., expires=...)`
  metadata.
- Active temporary exceptions must carry both an owner and a removal bead in
  [`__tests__/MOCKING_POLICY.md`](../../__tests__/MOCKING_POLICY.md).

---

## Top 20 Highest-Risk Mocks

Ranked by: risk=high first, then replaceable_now before replaceable_later, then by breadth of hidden behavior.

| # | File | Module | Layer | Risk | Disposition | Why It's Risky |
|---|------|--------|-------|------|-------------|---------------|
| 1 | `auth-enforcement-api.test.ts` | `@/lib/auth` | auth | **high** | replaceable_now | Auth mock in an *enforcement* test defeats the purpose — real auth harness exists |
| 2 | `auth-enforcement-api.test.ts` | `@/lib/prisma` | db | **high** | replaceable_now | DB mock hides constraint violations in auth enforcement |
| 3 | `auth-config.test.ts` | `@/lib/prisma` | db | **high** | replaceable_now | DB mock hides real query behavior; integration test covers this |
| 4 | `candidates-post-route.test.ts` | `@/lib/auth` | auth | **high** | replaceable_now | Auth mock in route test hides real auth flow |
| 5 | `candidates-post-route.test.ts` | `@/lib/prisma` | db | **high** | replaceable_now | DB mock hides real query/constraint behavior |
| 6 | `applications-detail-route.test.ts` | `@/lib/auth` | auth | **high** | replaceable_now | Auth mock hides real auth enforcement |
| 7 | `applications-detail-route.test.ts` | `@/lib/prisma` | db | **high** | replaceable_now | DB mock hides query behavior and FK constraints |
| 8 | `candidate-detail-route.test.ts` | `@/lib/auth` | auth | **high** | replaceable_now | Auth mock hides real auth flow |
| 9 | `candidate-detail-route.test.ts` | `@/lib/prisma` | db | **high** | replaceable_now | DB mock hides query behavior |
| 10 | `jobs-route.test.ts` | `@/lib/auth` | auth | **high** | replaceable_now | Auth mock hides real auth |
| 11 | `jobs-route.test.ts` | `@/lib/prisma` | db | **high** | replaceable_now | DB mock hides query behavior |
| 12 | `candidates-route.test.ts` | `@/lib/auth` | auth | **high** | replaceable_now | Auth mock |
| 13 | `candidates-route.test.ts` | `@/lib/prisma` | db | **high** | replaceable_now | DB mock |
| 14 | `cleanup-orphaned-resumes-route.test.ts` | `@/lib/prisma` | db | **high** | replaceable_now | DB mock hides real data state |
| 15 | `candidate-detail-route.test.ts` | `zod` | validation | **medium** | replaceable_later | Zod mock allows invalid data through — defeats validation testing |
| 16 | `candidates-post-route.test.ts` | `@/lib/validations` | validation | **medium** | replaceable_later | Validation mock hides real schema enforcement |
| 17 | `candidates-post-route.test.ts` | `@/lib/audit` | audit | **medium** | replaceable_later | Audit mock prevents verifying real audit writes |
| 18 | `users-admin-api.test.ts` | `@/lib/email` | email | **medium** | replaceable_now | Email mock prevents real delivery testing; email harness available |
| 19 | `email-harness.test.ts` | `@/lib/rate-limit` | rate_limit | **medium** | replaceable_now | Pass-through mock; real rate-limit harness available |
| 20 | `real-auth-coverage.test.ts` | `@/lib/email` | email | **medium** | replaceable_now | Email pass-through mock; harness available |

---

## Replacement Strategy by Category

### 1. Database (`@/lib/prisma`) — 13 mocks, 12 high-risk

**Current state:** Unit tests mock the entire Prisma client. Integration tests redirect to the test DB via async `vi.mock` factory.

**Strategy:**
- **Unit route tests** (auth-config, candidates-post, applications-detail, candidate-detail, jobs, candidates, cleanup): Convert to integration tests that hit the real test DB. The test infrastructure (`setupIntegrationTests`, `createTestFactories`) already supports this. Each converted test eliminates both the `@/lib/prisma` mock and the `@/lib/auth` mock (via auth harness).
- **Integration tests** (`@/lib/prisma` redirect): Keep as-is. The `vi.mock('@/lib/prisma', async () => ...)` pattern that redirects to `getTestPrisma()` is the correct approach.
- **Tracking:** hr-kfwh.3 (DB mock elimination)

### 2. Auth (`@/lib/auth`) — 8 mocks, all high-risk

**Current state:** Unit route tests mock `requireAuth()` to return a fake session. Integration tests use `createAuthHarness()` or `setupTestAuth()` which provide real session creation.

**Strategy:**
- **Eliminate by conversion:** When the parent route test converts to integration (per DB strategy above), the auth mock goes away too — replaced by `createAuthHarness()` which creates real users and sessions.
- **Priority:** auth-enforcement-api.test.ts is the most critical — an auth enforcement test that mocks auth is testing nothing.
- **Tracking:** hr-kfwh.2 (Auth mock elimination)

### 3. Validation (`@/lib/validations`, `zod`) — 6 mocks, all medium-risk

**Current state:** Unit route tests mock validation schemas to control what passes/fails. This hides real schema enforcement behavior.

**Strategy:**
- **Eliminate by conversion:** Integration tests don't need validation mocks — they send real payloads through real Zod schemas. Converting route tests to integration tests (per DB strategy) eliminates these automatically.
- **The `zod` mock** in candidate-detail-route.test.ts is particularly dangerous — it replaces Zod's parse behavior entirely.
- **Tracking:** Part of route-test conversion (hr-kfwh.3)

### 4. Audit (`@/lib/audit`) — 5 mocks, all medium-risk

**Current state:** Unit route tests mock `createAuditLog()` to a no-op. This prevents verifying that mutations produce audit records.

**Strategy:**
- **Eliminate by conversion:** Integration tests write real audit logs to the test DB. After route test conversion, verify audit records by querying `prisma.auditLog.findMany()`.
- **Tracking:** Part of route-test conversion (hr-kfwh.3)

### 5. Storage (`@/lib/storage`) — 5 mocks, 4 necessary + 1 medium-risk

**Current state:** S3/MinIO requires an external service. Most storage mocks are necessary. The integration test for resume-upload uses a mock that could use a real MinIO harness.

**Strategy:**
- **Keep** unit test storage mocks (external dependency).
- **Replace** the integration-level storage mock in `resume-upload.test.ts` with a real MinIO test container when available.
- **Tracking:** hr-kfwh.14 (Storage harness)

### 6. Rate Limit (`@/lib/rate-limit`) — 4 mocks, all medium-risk

**Current state:** Integration tests use pass-through mocks for rate limiting. A real rate-limit harness (`setupRateLimitHarness`) already exists.

**Strategy:**
- **Replace now:** Switch from `vi.mock('@/lib/rate-limit', ...)` to importing `setupRateLimitHarness` from `@/test/setup-integration`. This is a mechanical replacement.
- **Tracking:** hr-kfwh.10 (Rate-limit mock elimination)

### 7. Email (`@/lib/email`, `nodemailer`) — 3 mocks, 1 necessary + 2 medium-risk

**Current state:** Unit test mocks nodemailer (necessary). Integration tests mock `@/lib/email` when `setupEmailHarness` is already available.

**Strategy:**
- **Keep** the nodemailer unit test mock.
- **Replace** integration-level email mocks with `setupEmailHarness()` from `@/test/setup-integration`.
- **Tracking:** hr-kfwh.9 (Email mock elimination)

### 8. UI Hooks (`next/navigation`, `@/hooks/queries`, `@tanstack/react-query`) — 15 mocks, all low-risk

**Current state:** Component tests mock Next.js router and React Query hooks. This is standard practice for React component testing.

**Strategy:**
- **Keep all.** These are boundary mocks for framework APIs that cannot run outside a browser/server context. No action needed.

### 9. Network (`fetch`, `@/lib/api-client`) — 4 mocks, 3 low + 1 medium

**Current state:** API client unit tests mock `fetch` via `vi.stubGlobal`. One component test assigns `globalThis.fetch` directly.

**Strategy:**
- **Keep** `vi.stubGlobal('fetch', ...)` mocks in api-client.test.ts (necessary).
- **Fix** the `globalThis.fetch = ...` assignment in candidates-page.test.tsx to use `vi.stubGlobal` for proper cleanup.
- **Tracking:** Minor cleanup, no dedicated bead needed.

### 10. Environment (`vi.stubEnv`) — 11 instances, all low-risk

**Strategy:** **Keep all.** Environment variable stubs in email-service.test.ts are the correct way to test config-driven behavior.

---

## Priority Order for Mock Elimination

1. **Auth enforcement test** (hr-kfwh.2) — highest urgency, currently testing nothing
2. **Route test → integration conversion** (hr-kfwh.3) — eliminates 21 high-risk mocks (all DB + auth in unit route tests) plus 11 medium-risk mocks (validation + audit)
3. **Rate-limit harness adoption** (hr-kfwh.10) — mechanical replacement, 4 mocks
4. **Email harness adoption** (hr-kfwh.9) — 2 mocks
5. **Storage harness** (hr-kfwh.14) — 1 mock, blocked on MinIO test container setup
