# HR Dashboard

HR Dashboard is a full-stack recruiting operations platform for managing jobs, candidates, and hiring pipeline health in one place.

This repository contains the production application code, API layer, database schema, and automated test suite for the platform.

## What It Does

- Tracks job openings from intake to close
- Manages candidate profiles and resume metadata
- Connects candidates to jobs through staged applications
- Surfaces pipeline health and critical hiring risk
- Enforces role-based permissions for HR teams
- Captures audit logs for write operations

## Core Product Areas

### Dashboard

- KPI cards for open jobs, closed jobs, active candidates, and critical roles
- Pipeline health summary (`AHEAD`, `ON_TRACK`, `BEHIND`)
- Critical-jobs table prioritized for recruiter attention

### Jobs

- Structured job records with ownership, priority, target dates, and status
- Search, sorting, filtering, and pagination
- Pipeline view of applications by stage

### Candidates

- Candidate profiles with source, contact details, and notes
- Resume upload metadata and retrieval workflow
- Search, sorting, and pagination for large datasets

### Applications

- Candidate-to-job relationships with explicit stage tracking
- Canonical hiring stages:
  - `NEW`
  - `SCREENING`
  - `INTERVIEWING`
  - `FINAL_ROUND`
  - `OFFER`
  - `HIRED`
  - `REJECTED`
  - `WITHDRAWN`

## Security Model

- Session-based authentication via Auth.js (credentials provider)
- Role-based access control with three roles:
  - `ADMIN`
  - `RECRUITER`
  - `VIEWER`
- Hardened HTTP security headers with a route-wide CSP, frame protection, MIME sniffing protection, referrer controls, and browser feature restrictions
- Signed object URLs for controlled resume upload/download access
- Defensive validation for file type, file size, and storage keys

### Security Headers

The application configures defense-in-depth response headers in [`next.config.ts`](./next.config.ts):

- `Content-Security-Policy` blocks framing, disallows plugin/object content, and limits script/style/resource origins
- `X-Frame-Options: DENY` protects legacy browsers against clickjacking
- `X-Content-Type-Options: nosniff` disables MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` limits cross-site referrer leakage
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` disables unnecessary browser capabilities
- `Strict-Transport-Security` is enabled in production only to enforce HTTPS without breaking local development

### CSRF Posture

The application uses two complementary protections for authenticated mutations:

1. Auth.js session and callback cookies are left on the library defaults: host-only, `httpOnly`, `SameSite=Lax`, and automatically `secure` on HTTPS deployments.
2. Built-in Auth.js CSRF token validation remains active for Auth.js-managed POST actions such as credentials sign-in and sign-out.
3. Application-owned API mutations live under `src/app/api` and use only `POST`, `PATCH`, or `DELETE`. No custom `GET` route performs writes.

Current decision:

- Do not add a second custom CSRF token layer for the app routes at this stage.
- The current threat model is covered by host-only SameSite cookies plus Auth.js CSRF enforcement on sensitive auth actions.
- Do not override Auth.js cookie settings casually; custom cookie configuration opts the app into maintaining that security policy manually.

## Technology Stack

- **Framework:** Next.js (App Router), React, TypeScript
- **Data layer:** Prisma + PostgreSQL
- **Auth:** NextAuth/Auth.js
- **Client state:** TanStack Query
- **UI:** Tailwind CSS + component primitives
- **Storage:** S3-compatible object storage (AWS S3 or MinIO)
- **Testing:** Vitest (unit/integration) + Playwright (end-to-end)

## Data Model (High Level)

The system is centered around five primary entities:

- `User` (identity, role, active state)
- `Job` (opening, priority, health, lifecycle dates)
- `Candidate` (profile and resume metadata)
- `Application` (job-candidate stage progression)
- `AuditLog` (who changed what, and when)

## API Surface (Summary)

The app exposes route handlers under `src/app/api`, including:

- `jobs`
- `candidates`
- `applications`
- `dashboard/stats`
- `upload/resume`
- `auth`

## API Input Validation Constraints

All API routes require an authenticated session. Mutation routes require `ADMIN` or `RECRUITER` role.

### Jobs

**GET `/api/jobs` (query parameters)**

| Param | Type | Constraints | Default | Notes |
| --- | --- | --- | --- | --- |
| page | number | Integer ≥ 1 | 1 | Invalid values return 400 |
| pageSize | number | Integer 1-100 | 20 | Invalid values return 400 |
| sort | string | `title`, `status`, `targetFillDate`, `updatedAt`, `department`, `openedAt` | `updatedAt` | Invalid values return 400 |
| order | string | `asc`, `desc` | `desc` | Invalid values return 400 |
| status | string | Comma-separated `OPEN`, `CLOSED`, `ON_HOLD` | - | Invalid values are ignored |
| department | string | Comma-separated values | - | Trimmed per item |
| pipelineHealth | string | Comma-separated `AHEAD`, `ON_TRACK`, `BEHIND` | - | Invalid values are ignored |
| critical | string | Must be `true` to filter | - | Any other value ignored |
| search | string | Max 200 chars | - | Applied to title contains (case-insensitive) |
| includeCount | boolean | `true` | `false` | Includes active candidate counts |

**POST `/api/jobs` (body)**

| Field | Type | Required | Constraints | Notes |
| --- | --- | --- | --- | --- |
| title | string | Yes | Trimmed, 3-200 chars | Required |
| department | string | Yes | Trimmed, 1-100 chars | Required |
| description | string | Yes | Trimmed, 10-10000 chars | Required |
| location | string | No | Trimmed, max 200 chars | Empty becomes `null` |
| hiringManager | string | No | Trimmed, max 100 chars | Empty becomes `null` |
| recruiterOwner | string | No | Trimmed, max 100 chars | Empty becomes `null` |
| status | enum | No | `OPEN`, `CLOSED`, `ON_HOLD` | Default `OPEN` |
| priority | enum | No | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | Default `MEDIUM` |
| pipelineHealth | enum | Cond. | `AHEAD`, `ON_TRACK`, `BEHIND` | Required when status is `OPEN` |
| isCritical | boolean | No | - | Default `false` |
| openedAt | ISO date | No | Must be valid date | Default `now()` |
| targetFillDate | ISO date | No | Must be valid date, must be >= openedAt | Default `null` |

**PATCH `/api/jobs/:id` (body + route param)**

Route param `:id` must be a valid UUID.

| Field | Type | Required | Constraints | Notes |
| --- | --- | --- | --- | --- |
| title | string | No | Trimmed, 3-200 chars | Cannot be empty |
| department | string | No | Trimmed, 1-100 chars | Cannot be empty |
| description | string | No | Trimmed, 10-10000 chars | Cannot be empty |
| location | string | No | Trimmed, max 200 chars | `null` clears |
| hiringManager | string | No | Trimmed, max 100 chars | `null` clears |
| recruiterOwner | string | No | Trimmed, max 100 chars | `null` clears |
| status | enum | No | `OPEN`, `CLOSED`, `ON_HOLD` | - |
| priority | enum | No | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | - |
| pipelineHealth | enum | No | `AHEAD`, `ON_TRACK`, `BEHIND` | Required when status is `OPEN` |
| isCritical | boolean | No | - | - |
| openedAt | ISO date | No | Valid date or `null` | `null` clears |
| targetFillDate | ISO date | No | Valid date or `null`, must be >= openedAt | `null` clears |
| closedAt | ISO date | No | Valid date or `null` | Allowed only when status is `CLOSED` |

Additional PATCH rules:

1. `targetFillDate` cannot be earlier than `openedAt`.
2. `pipelineHealth` must be set when status is `OPEN`.
3. `closedAt` must be non-null when status is `CLOSED`; otherwise it must be null.
4. At least one valid field must be provided; otherwise 400 is returned.

### Candidates

**GET `/api/candidates` (query parameters)**

| Param | Type | Constraints | Default | Notes |
| --- | --- | --- | --- | --- |
| page | number | Integer ≥ 1 | 1 | Invalid values return 400 |
| pageSize | number | Integer 1-100 | 20 | Invalid values return 400 |
| sort | string | `name`, `email`, `updatedAt` | `name` | Invalid values return 400 |
| order | string | `asc`, `desc` | `asc` | Invalid values return 400 |
| search | string | Max 200 chars | - | Matches first name, last name, email |
| includeJobCount | boolean | `true` | `false` | Adds applications count |

**POST `/api/candidates` (body)**

| Field | Type | Required | Constraints | Notes |
| --- | --- | --- | --- | --- |
| firstName | string | Yes | Trimmed, 1-100 chars | Required |
| lastName | string | Yes | Trimmed, 1-100 chars | Required |
| email | string | No | Max 254 chars, RFC-style email validation | Empty becomes `null` |
| phone | string | No | Trimmed | Empty becomes `null` |
| linkedinUrl | string | No | Valid URL; hostname `linkedin.com` or `*.linkedin.com` | Empty becomes `null` |
| currentCompany | string | No | Trimmed | Empty becomes `null` |
| location | string | No | Trimmed | Empty becomes `null` |
| source | enum | No | `REFERRAL`, `LINKEDIN`, `CAREERS_PAGE`, `AGENCY`, `OTHER` | - |
| resumeKey | string | No | Must match `resumes/{uuid}.{ext}` | Must be paired with resumeName |
| resumeName | string | No | Required if resumeKey provided | Must be paired with resumeKey |
| notes | string | No | Trimmed, max 10000 chars | Empty becomes `null` |
| jobId | UUID | No | Must reference existing job | If provided, creates an application |

**PATCH `/api/candidates/:id` (body + route param)**

Route param `:id` must be a valid UUID.

| Field | Type | Required | Constraints | Notes |
| --- | --- | --- | --- | --- |
| firstName | string | No | Trimmed, 1-100 chars | Cannot be empty |
| lastName | string | No | Trimmed, 1-100 chars | Cannot be empty |
| email | string | No | Max 254 chars, RFC-style email validation | `null` clears |
| phone | string | No | Trimmed | `null` clears |
| linkedinUrl | string | No | Valid URL; hostname `linkedin.com` or `*.linkedin.com` | `null` clears |
| currentCompany | string | No | Trimmed | `null` clears |
| location | string | No | Trimmed | `null` clears |
| source | enum | No | `REFERRAL`, `LINKEDIN`, `CAREERS_PAGE`, `AGENCY`, `OTHER` | `null` clears |
| resumeKey | string | No | Must match `resumes/{uuid}.{ext}` | Must be paired with resumeName |
| resumeName | string | No | Required if resumeKey provided | Must be paired with resumeKey |
| notes | string | No | Trimmed, max 10000 chars | `null` clears |

Additional PATCH rules:

1. `resumeKey` and `resumeName` must be provided together (including when clearing).
2. At least one valid field must be provided; otherwise 400 is returned.

### Applications

**POST `/api/applications` (body)**

| Field | Type | Required | Constraints | Notes |
| --- | --- | --- | --- | --- |
| jobId | UUID | Yes | Valid UUID | Must reference existing job |
| candidateId | UUID | Yes | Valid UUID | Must reference existing candidate |
| stage | enum | No | `NEW`, `SCREENING`, `INTERVIEWING`, `FINAL_ROUND`, `OFFER`, `HIRED`, `REJECTED`, `WITHDRAWN` | Default `NEW` |
| recruiterOwner | string | No | Trimmed, max 100 chars | Empty becomes `null` |
| interviewNotes | string | No | Trimmed, max 50000 chars | Empty becomes `null` |

**PATCH `/api/applications/:id` (body + route param)**

Route param `:id` must be a valid UUID.

| Field | Type | Required | Constraints | Notes |
| --- | --- | --- | --- | --- |
| stage | enum | No | `NEW`, `SCREENING`, `INTERVIEWING`, `FINAL_ROUND`, `OFFER`, `HIRED`, `REJECTED`, `WITHDRAWN` | Updates `stageUpdatedAt` when changed |
| recruiterOwner | string | No | Trimmed, max 100 chars | `null` clears |
| interviewNotes | string | No | Trimmed, max 50000 chars | `null` clears |

Additional PATCH rule: at least one valid field must be provided; otherwise 400 is returned.

### Resume Uploads

**POST `/api/upload/resume` (body)**

| Field | Type | Required | Constraints | Notes |
| --- | --- | --- | --- | --- |
| filename | string | Yes | Must include extension: `pdf`, `doc`, `docx`, `txt`, `rtf` | - |
| contentType | string | No | Must match extension if provided (unless `application/octet-stream`) | - |
| sizeBytes | number | Yes | Integer > 0 and ≤ 10MB | - |

**GET `/api/upload/resume/:key` (route param)**

Route param `:key` must match `resumes/{uuid}.{ext}` where ext is `pdf`, `doc`, `docx`, `txt`, `rtf`.

## Repository Structure

```text
hr-dashboard/
├── prisma/                # Schema and seed data
├── src/
│   ├── app/               # App Router pages and API routes
│   ├── components/        # UI and layout components
│   ├── hooks/             # Query and form hooks
│   ├── lib/               # Auth, permissions, storage, utilities
│   └── test/              # Shared test utilities
├── __tests__/             # Unit, integration, and E2E suites
├── docs/                  # Architecture and migration docs
└── scripts/               # Ops/developer helper scripts
```

## Environment Requirements

This application expects the following infrastructure:

- PostgreSQL database
- S3-compatible object storage bucket for resumes
- Auth secret and trusted host configuration

Reference variables are documented in [`.env.example`](./.env.example).

## Notes for Public Readers

- This repository is the source code for a real internal-facing HR platform, not a one-click demo.
- Deployment and runtime environments differ by organization.
- Public documentation here focuses on architecture and implementation quality rather than consumer onboarding steps.

## Problem Statement & Goals

Recruiting teams are frequently forced to stitch together spreadsheets, ATS exports, and ad-hoc notes. The result is a fragmented workflow where critical signals (pipeline risk, role ownership, bottlenecks) are buried across tools. This platform centralizes those signals and turns them into a decision-support workspace.

Primary goals:

1. Reduce time-to-hire by giving recruiters immediate visibility into pipeline health.
2. Prevent hiring risk by surfacing critical roles and stalled stages early.
3. Eliminate operational drift by enforcing clear ownership, status, and audit trails.
4. Support fast, safe mutation workflows with clear recovery paths.

## Roles & Permissions

The system is designed around three roles with distinct responsibilities. Permissions are enforced at the API layer and reflected in UI affordances.

| Capability | ADMIN | RECRUITER | VIEWER |
| --- | --- | --- | --- |
| Manage users and roles | ✅ | ❌ | ❌ |
| Create, edit, close jobs | ✅ | ✅ | ❌ |
| Create and update candidates | ✅ | ✅ | ❌ |
| Move application stages | ✅ | ✅ | ❌ |
| View dashboards and reports | ✅ | ✅ | ✅ |
| View audit log entries | ✅ | ✅ | ✅ |

## Data Flow Overview

The standard lifecycle is intentionally simple and fully auditable:

1. A job is created with owner, priority, target dates, and status.
2. A candidate is added or imported, with resume metadata and contact details.
3. An application connects the candidate to a job and sets the initial stage.
4. The application progresses through stages until hire, rejection, or withdrawal.
5. Dashboard surfaces aggregate signals and critical pipeline risks.

Every write action is recorded in `AuditLog` to provide traceability.

## Resume Storage & Security Model

Resume handling is intentionally conservative:

1. All uploads are validated for file type and size before accepting.
2. Files are stored in an S3-compatible bucket under a deterministic storage key.
3. Downloads use signed URLs with short TTLs for controlled access.
4. Resume metadata is stored in the candidate record for retrieval and audits.

This keeps storage decoupled from the app while enforcing controlled access at the edge.

## Architecture Overview

The application follows a clean request flow:

1. Next.js App Router handles the request at `src/app`.
2. Route handlers validate inputs and enforce permissions.
3. Prisma models persist data in PostgreSQL.
4. TanStack Query manages client state and cache invalidation.
5. UI components render deterministic state surfaces for empty, loading, and error states.

This separation keeps data rules on the server and visual policy on the client.

## Design Principles

The UX is intentionally opinionated:

1. Decision-first dashboards. Critical signals are surfaced before raw lists.
2. Consistent list workspaces. Tables, filters, and pagination behave the same everywhere.
3. Progressive disclosure. Only the right amount of detail is shown at each step.
4. Recoverable mutations. Every destructive action has a clear escape hatch.
5. Accessibility-by-default. Keyboard, focus, and aria patterns are first-class concerns.

## Algorithms & Heuristics

The system uses a few lightweight heuristics to drive prioritization:

1. Pipeline health classification based on stage velocity and role criticality.
2. Critical jobs ranking based on priority, aging, and pipeline movement.
3. Candidate recency signals to prevent stale follow-ups.

The intent is clarity and predictability rather than opaque machine learning.

## Validation & Form Strategy

Forms use a shared validation model to keep behavior consistent:

1. Zod validation with explicit error messaging.
2. Standardized validation timing to reduce noisy feedback.
3. Dirty-state guards to prevent accidental navigation loss.
4. Explicit submit feedback and success transitions.

## Performance & Perceived Speed

Performance is optimized for responsiveness and stability:

1. Loading skeletons are used for predictable layout and reduced layout shift.
2. keepPreviousData patterns avoid table jitter during refetches.
3. Deferred loading indicators prevent flicker for fast operations.

## Testing Strategy

The test suite is structured to cover critical user flows:

1. Unit tests for data-table behaviors, form utilities, and mutations.
2. Integration tests for Prisma and route handlers.
3. E2E tests for candidate workflows, job creation, and stage transitions.

## Operational Concerns

Operationally, this platform expects:

1. Database migrations handled through Prisma.
2. An object storage bucket for resumes with restricted access.
3. Audit logs retained for compliance and review.

## Limitations & Roadmap

Current limitations and likely near-term expansions:

1. Single-tenant only.
2. No automated external sourcing integrations.
3. Limited analytics beyond pipeline health.

Potential roadmap items:

1. Multi-tenant support.
2. Advanced reporting and SLA alerts.
3. Bulk import workflows and CRM sync.

## Documentation

- [TanStack Migration Blueprint](./docs/TANSTACK_MIGRATION_BLUEPRINT.md)
- [TanStack Migration Playbook](./docs/TANSTACK_MIGRATION_PLAYBOOK.md)
- [TanStack Acceptance Matrix](./docs/TANSTACK_ACCEPTANCE_MATRIX.md)

## License

No open-source license is currently declared in this repository.
