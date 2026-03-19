# HR Dashboard

A full-stack recruiting operations platform for managing jobs, candidates, and hiring pipeline health. Built with Next.js 16, React 19, Prisma 7, and PostgreSQL.

## What It Does

- Tracks job openings from intake to close with priority, health, and ownership
- Manages candidate profiles, resume metadata, and contact details
- Connects candidates to jobs through staged applications (8 hiring stages)
- Surfaces pipeline health and critical hiring risk on a decision-first dashboard
- Enforces role-based permissions for HR teams (Admin, Recruiter, Viewer)
- Captures audit logs with before/after snapshots for every write operation
- Provisions users via email-based onboarding invites with secure token links

## Technology Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Data | Prisma 7 + PostgreSQL |
| Auth | Auth.js 5 (credentials provider, JWT sessions) |
| Client state | TanStack Query 5, TanStack Form 1, TanStack Table 8 |
| UI | Tailwind CSS 4, Lucide icons, Sonner toasts |
| Storage | S3-compatible (AWS S3 or MinIO) |
| Email | Nodemailer 8 (SMTP, dev preview, test capture) |
| Rate limiting | Upstash Redis when configured, in-memory fallback otherwise |
| Testing | Vitest 4 (unit/integration), Playwright 1.58 (E2E) |
| Package manager | Bun |

## Core Product Areas

### Dashboard

- KPI cards for open jobs, closed jobs, active candidates, and critical roles
- Pipeline health summary (`AHEAD`, `ON_TRACK`, `BEHIND`)
- Attention Queue for recruiter follow-up and risk triage
- Dashboard jobs table with quick navigation into active requisitions

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
- Hiring stages: `NEW` > `SCREENING` > `INTERVIEWING` > `FINAL_ROUND` > `OFFER` > `HIRED` | `REJECTED` | `WITHDRAWN`

### User Management (Admin)

- Create, edit, deactivate, and delete users
- Resend onboarding invites and trigger password resets
- Role assignment (Admin, Recruiter, Viewer)

### Headcount Projections

- Imported from the WFP workbook's "2026 Approved Budget" sheet
- Each projection carries department, level, employee name, monthly FTE, and a temporary job ID reference
- Projections are matched to actual `Job` records via the matchedJobId resolution algorithm (see WFP Import Pipeline)
- The API supports department, level, and matched/unmatched filtering; the current page UI exposes matched/unmatched filtering first
- Matched status lets recruiters see which budget lines have corresponding open requisitions and which remain unmatched

### Tradeoffs

- Imported from the WFP workbook's "Tradeoffs" sheet
- Records level-change discussions: a source position traded for a target position at a different level
- Three row types: `PAIR` (both sides present), `SOURCE_ONLY` (no target yet), `NOTE` (context annotation)
- Each side references a job via `tempJobId` → resolved `jobId`
- Level difference is computed and stored for downstream sorting/filtering; the current page emphasizes summary + table review over exposed controls

## Data Model

Eight primary entities:

| Model | Purpose |
| --- | --- |
| `User` | Identity, role, active state, password lifecycle |
| `Job` | Opening with priority, health, lifecycle dates |
| `Candidate` | Profile, contact info, resume metadata |
| `Application` | Job-candidate stage progression (unique per pair) |
| `AuditLog` | Who changed what, when, with before/after JSON |
| `SetPasswordToken` | HMAC-SHA256 hashed tokens for onboarding and password resets |
| `HeadcountProjection` | Imported approved-budget projection rows matched back to jobs |
| `Tradeoff` | Imported tradeoff rows linking source/target positions and status notes |

## Architecture & Design Principles

### Client-Side Data Layer

TanStack Query manages all server state with a structured query key factory. Every key follows the shape `[scope, type, ...params]` — for example `['jobs', 'list', { page: 1, status: ['OPEN'] }]` or `['candidates', 'detail', '7f3a...']`. This hierarchy enables targeted invalidation: invalidating `['jobs']` clears all job-related caches, while `['jobs', 'list']` only clears list queries and leaves detail caches intact.

Filter parameters within query keys are normalized before inclusion — arrays are sorted, empty arrays omitted, and undefined values stripped — so that semantically equivalent requests always produce the same cache key regardless of the order the user clicked filters.

Cache timing follows a volatility-based policy matrix:

| Surface | staleTime | gcTime | Rationale |
| --- | --- | --- | --- |
| Dashboard stats | 2m | 10m | Aggregate data with moderate write frequency |
| List queries | 20s | 5m | Pagination/search/filter state should refresh quickly |
| Detail views | 60s | 10m | Rarely changes while a user is viewing it |
| Filter options | 5m | 30m | Near-static enum/lookup metadata |

`keepPreviousData` is enabled on paginated list queries so that page transitions show the previous page until the new page arrives, avoiding layout flash.

### Jobs Multi-Select Filter System

The jobs list supports multi-select filtering across nine dimensions (status, priority, pipeline health, department, employee type, location, recruiter, functional priority, corporate priority). The system uses three coordinated layers:

**URL Transport** — On the jobs page, filter selections are stored as repeated query parameters (`?status=OPEN&status=OFFER&department=Engineering`), not as comma-separated values. This avoids the need to escape commas in values like `"New York, NY"` and works natively with `URLSearchParams.getAll()`. Each filter dimension maps to a URL parameter key; multiple values for the same key represent an OR within that dimension, while different keys represent AND across dimensions. Some older dashboard-originated links still use comma-separated status parameters, so the repeated-param contract is the jobs-page source of truth rather than a universal URL rule across the whole app.

**Declarative Filter Registry** — A single TypeScript module (`job-filter-constants.ts`) declares every filter's metadata: field name, option source (inline enum or server-fetched), display label, aria label, trigger width, and whether in-popover search is enabled. The `JobsTable` component iterates this registry to render filters, so adding a new filter dimension requires only a new entry in the array — no component changes.

**Canonical URL Ordering** — When a user toggles a checkbox, the selected values are sorted into the canonical order defined by the options array (with the missing-value sentinel always last) before writing to the URL. This ensures that clicking "Offer" then "Open" produces the same URL as clicking "Open" then "Offer" (`?status=OPEN&status=OFFER`), which matters for browser history deduplication, shareable links, and cache key stability.

**Missing-Value Sentinel** — Nullable database columns (location, recruiter, etc.) can have rows where the value is NULL. The filter system represents this as a special sentinel string (`__MISSING__`) that appears as a "Not Set" option in the dropdown. The API route handler detects this sentinel in the filter array and translates it to a Prisma `OR` clause: `{ field: null }` combined with any concrete values. This lets users filter for "all jobs with no location assigned" alongside real location values.

### WFP Import Pipeline

The Workforce Planning (WFP) importer ingests an Excel workbook containing approved headcount projections and tradeoff decisions. The pipeline has four stages:

1. **Workbook Discovery** — Resolves the workbook in a deterministic order: `WFP_WORKBOOK_PATH` override first, otherwise scan the app root for files matching the canonical naming pattern and select the highest numeric revision suffix (`2026 WFP - Approved.xlsx`, `2026 WFP - Approved (1).xlsx`, etc.). If no match exists, the import fails with a clear error rather than silently creating empty tables.

2. **Multi-Sheet Parsing** — Each sheet type (projections, tradeoffs) has its own parser that handles column mapping, type coercion, and row-type classification. Parsers are pure functions: workbook in, typed arrays out, no database interaction. This makes them independently testable without any database setup.

3. **Job ID Resolution** — Parsed rows reference jobs by a temporary ID from the workbook. The resolver loads all existing jobs from the database and matches temporary IDs to real job records. Unmatched IDs are preserved as-is so that operators can see which budget lines have no corresponding requisition.

4. **Transactional FK-Safe Writes** — The final stage runs inside a Prisma interactive transaction. In WFP seed mode, it performs a destructive refresh of recruiting-domain data (`Tradeoff`, `HeadcountProjection`, `Application`, `Candidate`, and `Job`) while leaving user/auth tables intact. IDs are deterministic (UUIDv5) so reruns are idempotent, and the delete order respects foreign key constraints rather than disabling integrity checks.

### Form Validation Architecture

Forms use a two-layer validation design:

- **Structural layer** (Zod schemas): Defines field presence, types, and string constraints. Schemas are shared between client-side forms and API route handlers, ensuring the same rules apply on both sides.

- **Primitive layer** (pure functions): Implements business rules that need richer feedback — password strength checks, email format validation, date range logic. These functions return detailed error messages and are unit-tested independently of any form framework.

TanStack Form binds these together with `onBlur` timing for individual fields and `onSubmit` timing for cross-field rules. This gives users immediate feedback as they tab between fields without blocking them with errors on fields they haven't visited yet.

### Status & Visual System

The visual system maps domain states to consistent visual treatments through a layered design:

- **Status maps**: Five domain models (job status, priority, pipeline health, application stage, user active state) each define their own status-to-visual mapping
- **Emphasis levels**: Each status badge supports four sizes — `xs` (inline tags), `sm` (table cells), `md` (detail views), `lg` (hero displays)
- **Intent palette**: Five semantic intents (success, warning, danger, info, neutral) map to seven color families via CSS custom properties that respect the active theme

The badge components (`JobStatusBadge`, `PipelineHealthBadge`, `JobPriorityBadge`) are thin wrappers that look up the visual config for their value and render a styled `<span>`. Adding a new status value requires only a new entry in the status map — the component, colors, and sizing adapt automatically.

### State Surface Taxonomy

Empty states, error states, and loading states follow a taxonomy of eleven surface types. Each surface type defines:

- **Tone**: Whether the message is neutral ("No candidates yet"), encouraging ("Create your first job"), or urgent ("Failed to load")
- **Icon**: Contextual icon from the Lucide set, chosen per surface type
- **Actions**: Zero or more action buttons (clear filters, retry, create new) with configurable labels and handlers
- **Template interpolation**: Surface messages accept the resource name and search query as parameters, so the same component can say "No jobs found" or "No candidates found" without per-resource special cases

The `EmptyStateSurface` and `ErrorStateSurface` components in `state-surface.tsx` implement this taxonomy. List views pass `resource`, `hasFilters`, `hasSearch`, and action callbacks — the surface component selects the appropriate message, icon, and actions based on the combination of flags.

## Security Model

### Authentication & Sessions

- Session-based authentication via Auth.js (credentials provider)
- JWT sessions with 4-hour TTL
- Emails normalized to lowercase on creation and login

### Roles & Permissions

| Capability | ADMIN | RECRUITER | VIEWER |
| --- | --- | --- | --- |
| Manage users and roles | Yes | No | No |
| Create, edit, close jobs | Yes | Yes | No |
| Create and update candidates | Yes | Yes | No |
| Move application stages | Yes | Yes | No |
| Upload and download resumes | Yes | Yes | No |
| View dashboards and reports | Yes | Yes | Yes |

### User Onboarding & Password Lifecycle

Users are provisioned by administrators -- there is no self-registration.

1. An admin creates a user via `/admin/users` with name, email, and role.
2. The system generates a secure set-password token (32 random bytes, HMAC-SHA256 hashed) and sends an onboarding invite email with a token link.
3. The user clicks the link, which opens `/set-password?token=...`, validates the token, and prompts them to choose a password.
4. After setting their password, the user can log in normally.
5. Admins can resend the invite email (issues a fresh token, invalidates prior unused tokens).
6. Admins can trigger a password reset, which sends a reset email and invalidates the existing password only after successful email delivery.
7. Users can change their own password at `/settings/password`.

Token properties:
- 24-hour expiry
- One active token per user (issuing a new one atomically invalidates previous tokens)
- Hashed with HMAC-SHA256 using `AUTH_SECRET` (raw token never stored)
- Consumed atomically with race-condition protection via `updateMany` with `usedAt: null` guard

If email delivery fails on an initial user create, the user is still created and the API returns a fallback `setupUrl` so an admin can complete onboarding manually. On resend-invite and reset-password flows, newly issued tokens are rolled back and previously active tokens are restored when safe to do so.

### Password Policy

- Minimum 12 characters, maximum 128 characters
- At least one uppercase letter, one lowercase letter, one number, and one symbol
- The 128-character maximum prevents bcrypt CPU abuse (bcrypt truncates at 72 bytes but validating before hashing avoids unnecessary work)

### Email System

Three operational modes:

| Mode | When | Behavior |
| --- | --- | --- |
| **Test** | `NODE_ENV=test` or `VITEST=true` | Captures to in-memory outbox (no real sends) |
| **Development** | SMTP not configured | Logs a redacted console preview and reports delivery failure to the caller so admin flows can surface fallback handling |
| **Production** | SMTP configured | Sends via nodemailer SMTP transport |

### Rate Limiting

Two tiers:

1. **Cloudflare** (recommended primary): Proxy-level rate limiting per IP.
2. **Application-level** (defense-in-depth): Upstash Redis whenever it is configured, with in-memory fallback otherwise or if Redis is unavailable.

Application rate limits:

| Scope | Limit | Window |
| --- | --- | --- |
| Auth callback / sign-in / sign-out endpoints | 10 | 1 min |
| `POST\|PATCH\|DELETE\|PUT /api/*` | 60 | 1 min |
| `GET /api/*` | 300 | 1 min |
| `/api/upload/*` | 20 | 1 min |
| Password setup (validate) | 30 | 15 min |
| Password setup (submit) | 10 | 15 min |
| Resend invite (per admin) | 5 | 15 min |
| Password reset (per admin) | 5 | 15 min |
| Password change (per user) | 5 | 15 min |

### Security Headers

Configured in `next.config.ts`:

- `Content-Security-Policy` with script/style/resource origin restrictions
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security` (production only)
- `X-Powered-By` removed

### CSRF Posture

- Auth.js session cookies: host-only, `httpOnly`, `SameSite=Lax`, `secure` on HTTPS
- Auth.js CSRF token validation on auth POST actions
- Browser-authenticated application mutations use `POST`, `PATCH`, `DELETE`, and `PUT`; the operational cron cleanup endpoint is a deliberate `GET` exception protected by `CRON_SECRET`
- No additional custom CSRF layer needed at this stage

### Resume Storage

- Validated for file type (pdf, doc, docx, txt, rtf) and size (max 10MB) before accepting
- Stored in S3-compatible bucket under deterministic keys (`resumes/{uuid}.{ext}`)
- Downloads use signed URLs with short TTLs
- `ADMIN`/`RECRUITER` only; `VIEWER` receives 403
- Orphaned resumes cleaned up by cron endpoint (7-day grace period)

### Audit Logging

- Every write operation creates an `AuditLog` entry with before/after JSON snapshots
- Client IP extracted from trusted proxy headers (cf-connecting-ip > x-vercel-forwarded-for > x-real-ip > x-forwarded-for)
- IP addresses sanitized (truncated to 45 chars, non-printable chars stripped)
- If the acting user is deleted before the log is written, the entry is retried with `userId: null`

### Session Revocation Behavior

JWTs still use a 4-hour TTL, but session authorization is refreshed from the database on subsequent auth checks. Deactivated users therefore lose access on the next checked request rather than remaining active for the full TTL.

## API Surface

### Jobs

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/jobs` | GET | List jobs with pagination, search, sort, and multi-select filters across status, priority, pipeline, ownership, and WFP metadata |
| `/api/jobs` | POST | Create job |
| `/api/jobs/:id` | GET | Get job by ID |
| `/api/jobs/:id` | PATCH | Update job |
| `/api/jobs/:id` | DELETE | Delete job |
| `/api/jobs/filter-options` | GET | Load server-backed jobs filter metadata and missing-value support |

### Candidates

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/candidates` | GET | List candidates (pagination, search, sort) |
| `/api/candidates` | POST | Create candidate (optionally attach to job) |
| `/api/candidates/:id` | GET | Get candidate by ID |
| `/api/candidates/:id` | PATCH | Update candidate |
| `/api/candidates/:id` | DELETE | Delete candidate (removes resume from storage) |

### Applications

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/applications` | POST | Create application (candidate + job) |
| `/api/applications/:id` | PATCH | Update stage, recruiter, notes |
| `/api/applications/:id` | DELETE | Delete application |

### Headcount

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/headcount` | GET | List headcount projections with pagination, filtering, and matched job metadata |
| `/api/headcount/summary` | GET | Aggregate monthly FTE totals by department for charts |

### Tradeoffs

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/tradeoffs` | GET | List tradeoff rows with pagination, filtering, sort, and linked job metadata |

### Users (Admin -- requires MANAGE_USERS permission)

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/users` | GET | List users (pagination, search, active filter) |
| `/api/users` | POST | Create user and send onboarding invite email |
| `/api/users/:id` | PATCH | Update name, role, or active status |
| `/api/users/:id` | DELETE | Permanently delete user (with last-admin guard) |
| `/api/users/:id/resend-invite` | POST | Resend onboarding invite (rate limited) |
| `/api/users/:id/reset-password` | POST | Send password reset email (rate limited) |

### Users (Self-Service)

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/users/me` | PATCH | Update own name |
| `/api/users/me/password` | POST | Change own password |

### Password Setup (Public)

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/password-setup` | GET | Validate token (returns masked email, rate limited) |
| `/api/password-setup` | POST | Consume token and set password (rate limited) |

### Auth Runtime

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/auth/:path*` | GET/POST | Auth.js session, callback, sign-in, and sign-out runtime routes |

### Other

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/dashboard/stats` | GET | Dashboard KPIs and pipeline summary |
| `/api/upload/resume` | POST | Get signed upload URL |
| `/api/upload/resume/:key` | GET | Get signed download URL |
| `/api/cron/cleanup-orphaned-resumes` | GET | Delete orphaned resume objects (auth: `CRON_SECRET`) |
| `/api/test/email-outbox` | GET/DELETE | Test-only: inspect/clear captured emails (`NODE_ENV=test` only) |
| `/api/test/runtime-failures` | POST | Test-only: inject email/storage failure conditions for E2E failure-path tests |

## Repository Structure

```
hr-dashboard/
├── prisma/                # Schema, seed, migrations, WFP importer
├── src/
│   ├── app/               # App Router pages and API routes
│   │   ├── api/           # Route handlers
│   │   ├── admin/users/   # User management page
│   │   ├── set-password/  # Public token-based password setup page
│   │   ├── settings/      # Profile and password self-service
│   │   └── ...            # Dashboard, jobs, candidates, headcount, tradeoffs pages
│   ├── components/        # UI and layout components
│   ├── hooks/             # TanStack Query and form hooks
│   ├── lib/               # Auth, permissions, storage, email, rate-limit, validations, WFP parsers
│   └── test/              # Shared test utilities and harnesses
├── __tests__/
│   ├── unit/              # Vitest unit suites
│   ├── integration/       # Vitest integration suites against a real DB
│   ├── e2e/               # Playwright browser specs
│   ├── TESTING_PLAYBOOK.md
│   ├── RISK_MATRIX.md
│   ├── MOCKING_POLICY.md
│   └── COVERAGE_AUDIT.md
├── docs/                  # Architecture, migration, testing, and mock-audit docs
├── scripts/               # test-all.sh, coverage-guard.sh, merge-coverage.mjs, setup-minio.sh, …
└── docker-compose*.yml    # Dev (MinIO) and test (PostgreSQL) services
```

## Environment Variables

Reference: [`.env.example`](./.env.example)

### Required

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `DIRECT_URL` | Optional direct PostgreSQL connection string used for migrations and WFP import when present |
| `AUTH_SECRET` | Auth.js secret (`openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | `true` for VPS/proxy deployments |
| `STORAGE_BUCKET` | S3 bucket name for resumes |

### Email (SMTP)

| Variable | Description |
| --- | --- |
| `APP_URL` | Application base URL (used in email links) |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (587 for STARTTLS, 465 for TLS) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SENDER_EMAIL` | "From" email address |
| `SENDER_NAME` | "From" display name |

When SMTP variables are not set, the email system logs a redacted console preview and returns a delivery failure so callers can surface fallback handling.

### Rate Limiting (Production)

| Variable | Description |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |

When not set, rate limiting falls back to an in-memory store (not suitable for multi-instance production).

### Operations / Import (Optional)

| Variable | Description |
| --- | --- |
| `WFP_WORKBOOK_PATH` | Explicit path override for the approved WFP workbook |
| `CRON_SECRET` | Bearer token for operational cron endpoints like orphaned-resume cleanup |

### Storage (Optional)

| Variable | Description |
| --- | --- |
| `STORAGE_REGION` | AWS region (default: `us-east-1`) |
| `STORAGE_ENDPOINT` | Custom S3 endpoint (MinIO, DigitalOcean Spaces) |
| `AWS_ACCESS_KEY_ID` | AWS credentials (omit for IAM roles) |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials (omit for IAM roles) |

### Seeding (Optional)

| Variable | Description |
| --- | --- |
| `HR_DASHBOARD_SEED_MODE` | Seed mode for `prisma db seed` (`demo` or `wfp`, default: `demo`) |
| `ADMIN_NAME` | Admin display name for first bootstrap or explicit admin refresh |
| `ADMIN_EMAIL` | Admin email for first bootstrap or explicit admin refresh |
| `ADMIN_PASSWORD` | Admin password for first bootstrap or explicit admin refresh |

## Getting Started

```bash
# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env with your database URL, auth secret, etc.

# Generate Prisma client and push schema
bun run db:generate
bun run db:push

# Seed demo recruiting data and bootstrap an admin
bun run db:seed

# Or import the approved WFP workbook instead of demo data
bun run db:seed:wfp

# Optional: point WFP import at a specific workbook
WFP_WORKBOOK_PATH="./2026 WFP - Approved.xlsx" bun run db:seed:wfp

# Start development server
bun run dev
```

### Local MinIO (Resume Storage)

```bash
# Start MinIO via the dev compose file
docker compose -f docker-compose.dev.yml up -d minio

# Run setup script
./scripts/setup-minio.sh
```

### Running Tests

```bash
# Unit tests
bun run test

# Integration tests (requires test database)
bun run test:db:up        # Start test PostgreSQL on port 5433
bun run test:db:push       # Push schema to test DB
bun run test:integration

# E2E tests
bun run test:e2e:install   # Install Playwright browsers
bun run test:e2e

# All stages in one command (lint → tsc → unit → integration → E2E)
bun run test:all

# Common focused variants
bun run test:all -- --skip-e2e
bun run test:all -- --only integration
bun run test:all -- --coverage

# Coverage
bun run test:coverage
bun run test:integration:coverage

# Diff-aware per-file branch coverage guard
bun run coverage:guard                   # Run coverage + check changed files
bun run coverage:guard:ci                # Use pre-existing reports (CI)
```

Verify test infrastructure is healthy before integration/E2E runs:

```bash
bun run test:preflight
```

`test:preflight` also checks mock-policy and quarantine metadata before the heavier suites run.

### Available Scripts

| Script | Description |
| --- | --- |
| `dev` | Start Next.js dev server |
| `build` | Generate Prisma client, run migrations, import WFP data, build Next.js |
| `start` | Start production server |
| `lint` | Run ESLint |
| `test` | Run unit tests |
| `test:watch` | Unit tests in watch mode |
| `test:coverage` | Unit tests with coverage |
| `test:integration` | Run integration tests |
| `test:integration:watch` | Integration tests in watch mode |
| `test:integration:coverage` | Integration tests with coverage |
| `test:e2e` | Run Playwright E2E tests |
| `test:e2e:install` | Install Playwright browsers |
| `test:db:up` | Start test PostgreSQL container |
| `test:db:down` | Stop test PostgreSQL container |
| `test:db:push` | Push Prisma schema to test DB |
| `test:all` | Full pipeline: lint → tsc → unit → integration → E2E |
| `test:preflight` | Verify test infra (Docker, DB, schema, mock policy) |
| `coverage:guard` | Diff-aware per-file branch coverage check (changed files only) |
| `coverage:guard:ci` | Coverage guard using pre-existing reports (no re-run) |
| `coverage:merge` | Merge unit + integration Istanbul reports into `coverage/combined/` |
| `coverage:diff` | Show coverage delta for files changed vs base branch |
| `coverage:diff:ci` | Coverage diff against `origin/main` (CI mode) |
| `verify:headers` | Verify security headers on deployed URL |
| `db:generate` | Generate Prisma client |
| `db:push` | Push schema to database |
| `db:migrate` | Run Prisma migrations |
| `db:seed` | Seed demo recruiting data and bootstrap an admin |
| `db:seed:wfp` | Bootstrap an admin if needed, then import the approved WFP workbook |
| `db:studio` | Open Prisma Studio |
| `import:wfp` | Alias for `db:seed:wfp` |

## Testing Strategy

The test suite covers critical user flows across three tiers:

- **Unit tests**: API route handlers, UI components, utility functions, validation schemas, rate limiting, email service, password policy, and WFP import parsers
- **Integration tests**: Prisma operations against a real PostgreSQL database, route-handler integration, email/storage/rate-limit adapter contracts, password setup flow, and auth/session harnesses
- **E2E tests**: Full browser journeys for onboarding, admin user management (invite, resend, reset, deactivate, delete), recruiting pipeline, failure-path scenarios, and layout/auth flows

Test infrastructure:
- Main database: port 5432
- Test database: port 5433 (separate Docker container)
- Integration tests use `setupIntegrationTests()` for database lifecycle
- Shared harnesses: `setupTestAuth()`, `setupEmailHarness()`, `setupStorageHarness()`, `setupRateLimitHarness()`
- Mock policy: mocks are restricted to narrow, justified cases (see [`__tests__/MOCKING_POLICY.md`](./__tests__/MOCKING_POLICY.md))

### Test Database Infrastructure

Integration tests run against a dedicated PostgreSQL instance (port 5433) separate from the development database (port 5432). The test database enforces three safety invariants:

- **Port isolation**: The test connection string must target port 5433. The setup utility rejects any connection that doesn't match, preventing accidental writes to the development database.
- **Name guard**: The database name must contain the substring "test". This is a second-chance check that catches misconfigured connection strings.
- **Single-connection pool**: The test Prisma client uses `connection_limit=1` to prevent connection pool exhaustion during parallel test runs and to make transaction behavior deterministic.

The `setupIntegrationTests()` harness manages database lifecycle per test file. In its default mode, it runs `deleteMany` on all tables in foreign-key-safe order before each test, ensuring a clean slate without the overhead of dropping and recreating the schema. For validation-only test suites that don't write to the database, the `resetBeforeEach: false` option skips cleanup entirely.

## Documentation

### Testing

- [Testing Playbook](./docs/TESTING_PLAYBOOK.md) — Quick-start, suite overview, harness usage, coverage gates, E2E fixtures, troubleshooting
- [Risk Matrix](./__tests__/RISK_MATRIX.md) — P0/P1/P2 journey tiers, entry conditions, invariants, failure modes, artifact requirements
- [Mocking Policy](./__tests__/MOCKING_POLICY.md) — Allowed/disallowed mock scenarios, exception workflow, quarantine registry
- [Coverage Audit](./__tests__/COVERAGE_AUDIT.md) — Coverage inventory by layer, risk hotspot files, blind spot map

### Architecture

- [TanStack Migration Blueprint](./docs/TANSTACK_MIGRATION_BLUEPRINT.md)
- [TanStack Migration Playbook](./docs/TANSTACK_MIGRATION_PLAYBOOK.md)
- [TanStack Acceptance Matrix](./docs/TANSTACK_ACCEPTANCE_MATRIX.md)
- [Visual System Contract](./docs/VISUAL_SYSTEM_CONTRACT.md)
- [List Workspace Contract](./docs/LIST_WORKSPACE_CONTRACT.md)

## License

No open-source license is currently declared in this repository.
