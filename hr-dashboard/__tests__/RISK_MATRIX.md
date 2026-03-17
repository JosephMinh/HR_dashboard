# Critical User Journey Risk Matrix

**Date**: 2026-03-17
**Bead**: hr-kfwh.2
**Author**: HazyBay (AI Agent), revised by StormyCreek
**Reference**: COVERAGE_AUDIT.md (hr-kfwh.19.1)

---

## Tier Definitions

| Tier | Criteria | Test Requirement |
|------|----------|------------------|
| **P0** | Data loss, auth bypass, or compliance risk if broken | Full-stack E2E + integration, no mocks on critical path |
| **P1** | Core workflow broken for users; workaround exists but painful | Integration + E2E coverage; mocks allowed for non-critical deps only |
| **P2** | Quality/UX degradation; does not block core operations | Unit + targeted integration; E2E optional |

---

## P0 — Must Never Break (No-Mock Full-Stack Required)

### P0-1: Admin User Lifecycle

**Journey**: Admin creates user → invite email sent → new user sets password → new user logs in → admin deactivates user → user session revoked

**Entry Conditions**:
- Authenticated admin user
- SMTP configured (or test outbox available)
- Valid email for new user

**Steps & Invariants**:
1. `POST /api/users` — creates user with `mustChangePassword: true`, sends invite email
2. Invite email contains valid set-password token (single-use, expires in 48h)
3. `GET /set-password?token=...` — renders password form
4. `POST /api/password-setup` — sets password, consumes token, clears `mustChangePassword`
5. `POST /api/auth/[...nextauth]` — login succeeds with new password
6. User can access all routes appropriate to their role
7. `DELETE /api/users/[id]` — admin deactivates user
8. Deactivated user's active sessions are invalidated
9. Deactivated user cannot log in

**Side Effects to Verify**:
- Audit log entries for: user creation, password set, login, deactivation
- Email sent (captured via test outbox)
- Set-password token consumed (second use shows "Already Used")
- Session cookie invalidated after deactivation

**Failure Modes**:
- Token reuse allows password reset by unauthorized party
- Token expiry not enforced → stale links work indefinitely
- Deactivation doesn't revoke sessions → deleted user retains access
- Email not sent → user never receives invite
- Race condition: two concurrent password sets with same token

**Current E2E Coverage**: ✅ `invite-onboarding-flow.spec.ts`, `admin-delete-user.spec.ts`, `temp-password-lifecycle.spec.ts`
**Gaps**: No audit log verification. No concurrent token-use test. No test for admin resending invite.
**Mapped Beads**: hr-kfwh.23.1, hr-kfwh.9

---

### P0-2: Authentication & Session Boundaries

**Journey**: Unauthenticated user → login → session persists → role-based access enforced → logout → session cleared

**Entry Conditions**:
- Valid user credentials in database
- User has assigned role (ADMIN/RECRUITER/VIEWER)

**Steps & Invariants**:
1. `GET /login` — renders login form
2. `POST /api/auth/[...nextauth]` — validates credentials, issues JWT (4h maxAge)
3. Session cookie set; subsequent requests authenticated
4. Role-based routing: ADMIN sees `/admin/users`, VIEWER cannot access mutation routes
5. `POST /api/auth/signout` — clears session
6. Protected routes redirect to `/login` after logout

**Side Effects to Verify**:
- JWT contains correct user ID, role, email
- Session refreshed from database on each request (`refreshJwtTokenFromDatabase`)
- `mustChangePassword` users gated to `/settings/password` only
- Invalid credentials return generic error (no user enumeration)
- Rate limiting on login endpoint (10 attempts/min)

**Failure Modes**:
- JWT not refreshed → stale role persists after admin changes it
- `mustChangePassword` bypass → user accesses app without setting password
- Session cookie not HttpOnly/Secure → XSS session theft
- Login rate limit not enforced → brute force possible
- VIEWER can call mutation API endpoints directly (bypassing UI)

**Current E2E Coverage**: ✅ `auth.spec.ts` (20 tests), `temp-password-lifecycle.spec.ts`
**Gaps**: No direct API authorization test (VIEWER calling POST /api/jobs). No rate-limit verification. No JWT refresh test.
**Mapped Beads**: hr-kfwh.9, hr-kfwh.23.1

---

### P0-3: WFP Data Import (Destructive Bulk Operation)

**Journey**: Operator runs `bun run import:wfp` → all existing jobs/candidates/applications cleared → Excel parsed → data inserted → application state consistent

**Entry Conditions**:
- Excel workbook at expected path (`data/2026 WFP - Approved.xlsx`)
- Database accessible with write permissions
- No concurrent users modifying data during import

**Steps & Invariants**:
1. `DELETE FROM tradeoff, headcount_projection, application, candidate, job` — full table clear
2. Parse "WFP Details - 2026" sheet → jobs + candidates + applications
3. Parse "WFP Details - Beyond 2026" sheet → jobs (ON_HOLD status)
4. Parse "FP&A Budget" sheet → headcount projections with job matching
5. Parse "Tradeoffs" sheet → tradeoff records with job matching
6. All records inserted in single transaction
7. UUID v5 IDs are deterministic (re-import produces identical IDs)
8. Import warnings logged for unknown values

**Side Effects to Verify**:
- All FK constraints satisfied post-import
- Candidate records only created for "Hired" / "Hired - CW" rows
- Application `stageUpdatedAt` set correctly
- HeadcountProjection `matchedJobId` resolves via tempJobId
- Pipeline health computed correctly relative to `PIPELINE_HEALTH_AS_OF` (2026-03-17)
- Transaction rolls back entirely on any insertion failure

**Failure Modes**:
- Partial transaction commit → orphaned records or missing FKs
- Orphaned S3 resume files after candidate table cleared
- Non-deterministic UUIDs → duplicate records on re-import
- Excel format change → silent data corruption (wrong column mapping)
- tempJobId ambiguity → headcount matched to wrong job
- Memory exhaustion on large workbook

**Current Coverage**: ⚠️ Unit tests for parsing (139 tests). **NO integration or E2E test for full import cycle.**
**Gaps**: No transaction rollback test. No idempotency test. No orphaned file cleanup test. No FK integrity verification.
**Mapped Beads**: hr-197h.36, hr-kfwh.28

---

### P0-4: Resume Upload & Cleanup Pipeline

**Journey**: Recruiter uploads resume → file stored in S3 → download link works → candidate deleted → resume cleaned up → cron removes orphans

**Entry Conditions**:
- S3/MinIO storage configured
- Authenticated recruiter
- Candidate record exists

**Steps & Invariants**:
1. `POST /api/upload/resume` — generates presigned upload URL (validates content-type, max 50MB)
2. Client uploads file to presigned URL
3. `GET /api/upload/resume/[key]` — generates signed download URL (5-min expiry)
4. Resume accessible via download URL
5. `DELETE /api/candidates/[id]` — deletes candidate + cascades to applications
6. Resume key on deleted candidate should be flagged for cleanup
7. `POST /api/cron/cleanup-orphaned-resumes` — removes S3 objects for orphaned keys (7-day grace period)

**Side Effects to Verify**:
- S3 object exists after upload
- Presigned URL expires after 5 minutes
- Content-type validated (pdf, doc, docx, txt, rtf only)
- File size validated server-side
- Orphaned resume detected after candidate deletion
- Cron respects 7-day grace period (doesn't delete recent uploads)
- Cron requires valid CRON_SECRET (timing-safe comparison)

**Failure Modes**:
- Presigned URL doesn't expire → permanent unauthenticated access to PII
- Content-type bypass → malicious file upload
- Candidate deleted but resume persists in S3 indefinitely → storage cost leak + PII retention
- Cron deletes active resume (race condition with ongoing upload)
- CRON_SECRET not validated → external trigger of cleanup

**Current Coverage**: ⚠️ Integration tests for upload/download. Unit tests for cleanup logic. **No end-to-end pipeline test.**
**Gaps**: No S3 lifecycle test. No orphan detection after candidate delete. No race condition test.
**Mapped Beads**: hr-kfwh.14, hr-kfwh.23.2

---

## P1 — Core Workflow (Integration + E2E Required)

### P1-1: Candidate → Job → Application Pipeline

**Journey**: Recruiter creates job → creates candidate → attaches candidate to job → moves through stages → hires candidate → job closed

**Entry Conditions**:
- Authenticated recruiter
- Job in OPEN status

**Steps & Invariants**:
1. `POST /api/jobs` — create job with required fields
2. `POST /api/candidates` — create candidate
3. `POST /api/applications` — link candidate to job (stage: NEW)
4. `PATCH /api/applications/[id]` — advance: NEW → SCREENING → INTERVIEWING → FINAL_ROUND → OFFER → HIRED
5. Each stage transition updates `stageUpdatedAt`
6. `PATCH /api/jobs/[id]` — set status to CLOSED
7. Active candidate count reflects pipeline state

**Side Effects to Verify**:
- Duplicate application prevention (same job + candidate)
- Stage can go backward (e.g., OFFER → INTERVIEWING)
- `recruiterOwner` assigned on application
- Pipeline health recalculated on status/date changes
- Audit log for each mutation

**Failure Modes**:
- Duplicate applications allowed → data integrity violation
- Stage transition to HIRED doesn't update closedAt
- Deleting a job doesn't cascade to applications properly
- Pipeline health shows stale data after status change

**Current E2E Coverage**: ✅ `jobs.spec.ts`, `candidates.spec.ts`, `applications.spec.ts`, `stage-dropdown.spec.ts`
**Gaps**: No full lifecycle test (create → all stages → close). No audit log verification. No backward stage transition test.
**Mapped Beads**: hr-kfwh.23.2

---

### P1-2: Password Reset & Security Lifecycle

**Journey**: Admin resets user password → user forced to change → old sessions invalidated

**Entry Conditions**:
- Authenticated admin
- Target user exists and is active

**Steps & Invariants**:
1. `POST /api/users/[id]/reset-password` — generates temp password, sets `mustChangePassword: true`
2. Temp password shown to admin (one-time display)
3. User's existing sessions should be invalidated
4. User logs in with temp password → gated to `/settings/password`
5. User sets new password (policy: 12+ chars, uppercase, number, symbol)
6. `mustChangePassword` cleared → full access restored

**Side Effects to Verify**:
- Password hashed with bcrypt before storage
- Old password no longer works after reset
- Password policy enforced server-side (not just UI)
- Rate limiting on password-setup endpoint (30 validate/15min, 10 submit/15min)

**Failure Modes**:
- Temp password not invalidated after use → permanent backdoor
- Password policy only enforced client-side → weak passwords accepted via API
- Old sessions not revoked → parallel access with old and new credentials
- Rate limit not enforced → brute force temp password

**Current E2E Coverage**: ✅ `temp-password-lifecycle.spec.ts`
**Gaps**: No test for old-session invalidation after reset. No server-side policy enforcement test. No rate limit test.
**Mapped Beads**: hr-kfwh.9, hr-kfwh.10

---

### P1-3: Email Delivery & Template Integrity

**Journey**: System event triggers email → template rendered → SMTP delivery → recipient receives correct content

**Entry Conditions**:
- SMTP configured (Brevo in prod, test outbox in test)
- Valid recipient email

**Steps & Invariants**:
1. User invite → `sendInviteEmail()` with set-password link
2. Password reset → email with temp password
3. Template includes correct recipient, subject, body
4. HTML + plain text versions generated
5. Set-password link contains valid token
6. Email delivery failure doesn't crash the operation (graceful fallback)

**Side Effects to Verify**:
- Email captured in test outbox
- Token in email matches database record
- HTML sanitized (no XSS in user-provided fields)
- Failed SMTP doesn't block user creation

**Failure Modes**:
- Wrong token in email → user can't set password
- Email contains PII in plain text (temp password in email body is intentional but logged)
- SMTP failure throws unhandled exception → 500 on user creation
- Template injection via user name field

**Current Coverage**: ✅ Unit tests (46), integration (12), E2E (12 via invite flow)
**Gaps**: No SMTP failure resilience test. No template injection test.
**Mapped Beads**: hr-kfwh.11

---

### P1-4: Role-Based API Authorization

**Journey**: Each role attempts each API mutation → only authorized calls succeed

**Entry Conditions**:
- Users of each role (ADMIN, RECRUITER, VIEWER) exist

**Steps & Invariants**:
1. VIEWER calls `POST /api/jobs` → 403
2. VIEWER calls `PATCH /api/candidates/[id]` → 403
3. VIEWER calls `DELETE /api/applications/[id]` → 403
4. RECRUITER calls `DELETE /api/users/[id]` → 403
5. RECRUITER calls `POST /api/users` → 403
6. ADMIN can perform all operations
7. Unauthenticated calls to any `/api/*` → 401

**Side Effects to Verify**:
- Error response doesn't leak data (no user enumeration)
- Authorization checked BEFORE validation (don't process unauthorized input)
- Audit log records unauthorized attempts

**Failure Modes**:
- Authorization check missing on new endpoint → privilege escalation
- Authorization checked after DB query → information leak via timing
- Role change in database not reflected until session refresh

**Current Coverage**: ⚠️ Unit tests mock auth. E2E tests check UI-level access but not direct API calls.
**Gaps**: No direct API authorization E2E test. No test for role change propagation.
**Mapped Beads**: hr-kfwh.9, hr-kfwh.20.3

---

## P2 — Quality & Observability

### P2-1: Dashboard Metrics Accuracy

**Journey**: Data changes → dashboard reflects accurate counts

**Entry Conditions**:
- Seeded database with known counts

**Steps & Invariants**:
1. `GET /api/dashboard/stats` returns correct open/closed/critical job counts
2. Pipeline health summary matches actual job states
3. Imported hires count matches HIRED applications
4. Metrics update after job status change

**Failure Modes**:
- Stale cache returns old counts
- COUNT query doesn't filter soft-deleted records
- Pipeline health aggregation off-by-one

**Current Coverage**: ⚠️ 4 integration + 6 E2E tests
**Gaps**: No test for metrics after state mutation. No performance test.
**Mapped Beads**: hr-kfwh.23.2

---

### P2-2: Headcount Projection & Tradeoff Views

**Journey**: Imported headcount/tradeoff data → API serves filtered lists → UI renders correctly

**Entry Conditions**:
- WFP import completed with headcount + tradeoff data

**Steps & Invariants**:
1. `GET /api/headcount` — paginated, filterable by department, matchedJobId
2. `GET /api/headcount/summary` — aggregated FTE by department
3. `GET /api/tradeoffs` — paginated, filterable by rowType
4. Job matching via tempJobId produces correct links

**Failure Modes**:
- Filtering returns wrong results
- Pagination off-by-one
- Unmatched headcount projections silently dropped

**Current Coverage**: ❌ No tests
**Gaps**: Complete test gap for these endpoints.
**Mapped Beads**: hr-kfwh.28

---

### P2-3: Rate Limiting & Abuse Prevention

**Journey**: Excessive requests → rate limit enforced → 429 returned → legitimate traffic resumes after window

**Entry Conditions**:
- Rate limit configured (Redis or in-memory fallback)

**Steps & Invariants**:
1. Auth endpoint: 10 requests/min then 429
2. Write endpoints: 60 requests/min
3. Read endpoints: 300 requests/min
4. Upload endpoint: 20 requests/min
5. After window expires, requests succeed again
6. Rate limit keyed by IP (cf-connecting-ip, x-vercel-forwarded-for, x-real-ip)

**Failure Modes**:
- Rate limit not enforced → DoS/brute force possible
- Redis failure → fallback not activated → all requests fail
- IP detection bypassed via header spoofing
- Rate limit applies to wrong scope (per-route vs per-user)

**Current Coverage**: ⚠️ 12 unit tests for logic
**Gaps**: No integration test for actual HTTP 429. No Redis fallback test. No IP detection test.
**Mapped Beads**: hr-kfwh.10

---

### P2-4: Audit Trail Integrity

**Journey**: Mutation occurs → audit log entry created → audit queryable

**Entry Conditions**:
- Authenticated user performing CRUD operation

**Steps & Invariants**:
1. Every POST/PATCH/DELETE to core entities creates audit entry
2. Audit entry contains: user ID, action, entity type/ID, timestamp, IP
3. Audit entries are immutable (no update/delete)
4. Failed operations don't create partial audit entries

**Failure Modes**:
- Audit logging silently fails → compliance gap
- Audit entry created before transaction commits → ghost entries
- Missing audit for edge cases (soft delete, status transitions)

**Current Coverage**: ❌ No direct audit verification in any test layer
**Gaps**: Complete test gap for audit trail.
**Mapped Beads**: hr-kfwh.24

---

## Journey → Test Suite Mapping

| Journey | Unit Tests | Integration Tests | E2E Tests | Bead |
|---------|-----------|-------------------|-----------|------|
| P0-1: Admin User Lifecycle | auth-config | users-admin-api, password-setup-api | invite-onboarding-flow, admin-delete-user, temp-password | hr-kfwh.23.1 |
| P0-2: Auth & Sessions | auth-config, auth-enforcement-api | — | auth | hr-kfwh.9 |
| P0-3: WFP Import | wfp-sanitize, wfp-import-parsers, wfp-ids | — | — | hr-197h.36 |
| P0-4: Resume Pipeline | storage-list-objects | resume-upload, storage-config | resume-upload | hr-kfwh.14 |
| P1-1: Recruiting Pipeline | jobs-route, candidates-*, applications-* | all CRUD integration | jobs, candidates, applications | hr-kfwh.23.2 |
| P1-2: Password Security | password-policy | users-self-service, password-setup-api | temp-password-lifecycle | hr-kfwh.9 |
| P1-3: Email Delivery | email-service, email-templates | password-setup-api | invite-onboarding-flow | hr-kfwh.11 |
| P1-4: API Authorization | auth-enforcement-api | — | auth (partial) | hr-kfwh.20.3 |
| P2-1: Dashboard Metrics | — | dashboard-stats | dashboard | hr-kfwh.23.2 |
| P2-2: Headcount/Tradeoffs | — | — | — | hr-kfwh.28 |
| P2-3: Rate Limiting | rate-limit | — | — | hr-kfwh.10 |
| P2-4: Audit Trail | — | — | — | hr-kfwh.24 |

---

## Journey → Logging Artifact & SLO Matrix

The matrix below defines the **minimum evidence packet** each journey must
produce when it fails in CI or local repro. This is the contract for
`hr-kfwh.22.2` and for follow-on journey suites.

| Journey | Required Failure Artifacts | Minimum SLO / Diagnostic Bar |
|---------|-----------------------------|-------------------------------|
| P0-1: Admin User Lifecycle | Playwright trace, screenshot, browser console, captured invite/reset email, DB state for user + token + active flag, audit log rows | Root cause identifiable from one failed run without rerunning locally; invite/deactivate failures must expose whether the break was email, token, auth, or persistence |
| P0-2: Auth & Sessions | Browser console, auth/network request log, redirect chain, session/JWT claim snapshot, server auth log line or structured test log | Any 401/403/redirect failure must show the acting role, expected route, and whether session refresh/gating caused the denial |
| P0-3: WFP Data Import | Import command log, warning summary, inserted-row counts by table, transaction rollback evidence on failure, FK integrity check output | Import failures must identify the workbook row/sheet or transaction stage within one run; destructive import must never fail without counts and rollback status |
| P0-4: Resume Upload & Cleanup | Upload/download request log, storage object keys before/after, signed URL metadata, cleanup cron log, candidate/application DB state | File-path failures must show whether the break was validation, signing, storage persistence, or cleanup selection logic |
| P1-1: Recruiting Pipeline | Browser trace, key API request/response summary, application stage history, dashboard stats delta, audit entries for mutations | A failed journey must show the exact stage/action that diverged and whether the bad state is in UI, API response, or persisted DB rows |
| P1-2: Password Security | Browser trace, password-policy validation output, token/session state, auth/network log, audit rows for reset/change | Password failures must show whether the rejection came from policy, token state, auth state, or stale session behavior |
| P1-3: Email Delivery | Rendered email payload, outbox capture, SMTP/test transport failure result, template subject/body snapshot | Delivery failures must preserve the exact email contract that was attempted and whether fallback behavior succeeded |
| P1-4: API Authorization | Request log with acting role, response body/status, route-level auth decision, audit row for unauthorized attempt when expected | Authorization failures must identify role, endpoint, verb, expected policy, and whether the denial happened before or after business logic |
| P2-1: Dashboard Metrics | Stats API payload, seed/setup counts, page screenshot, query timing/log output | Metric mismatches must show both expected counts and returned counts in one report |
| P2-2: Headcount/Tradeoffs | API filter params, paginated response snapshot, matched/unmatched job counts, source row provenance for a failing record | Failures must identify which filter, page, or provenance link produced the mismatch |
| P2-3: Rate Limiting | Rate-limit decision log, request burst summary, effective client IP key, fallback-mode indicator | 429 behavior must be explainable from a single run, including whether Redis/fallback mode was active |
| P2-4: Audit Trail | Mutation request log, resulting audit row payload, DB timestamp ordering, entity/action correlation | Audit coverage is insufficient unless the failing report shows the missing or malformed audit record directly |

### Tier-Level SLOs

| Tier | Required Diagnostic Standard |
|------|-------------------------------|
| **P0** | One failed run must isolate the failing step, persisted state, and owning subsystem with no manual log spelunking |
| **P1** | One failed run must isolate the failing user-visible workflow step and whether the bug sits in UI, API, or persistence |
| **P2** | One failed run must isolate the incorrect metric, filter, or observability contract with enough data to reproduce quickly |

---

## Summary

| Tier | Journeys | Fully Covered | Partial | No Coverage |
|------|----------|---------------|---------|-------------|
| **P0** | 4 | 0 | 3 | 1 (WFP Import) |
| **P1** | 4 | 1 | 3 | 0 |
| **P2** | 4 | 0 | 2 | 2 |
| **Total** | **12** | **1** | **8** | **3** |

**Highest-impact gaps to close**:
1. WFP Import full-cycle integration test (P0-3)
2. Direct API authorization E2E test (P1-4)
3. Audit trail verification in any test layer (P2-4)
4. Headcount/Tradeoff endpoint tests (P2-2)
