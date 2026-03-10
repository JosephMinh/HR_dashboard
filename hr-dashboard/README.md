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
- Hardened HTTP security headers (CSP, frame protection, MIME sniffing protection)
- Signed object URLs for controlled resume upload/download access
- Defensive validation for file type, file size, and storage keys

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
