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
| Rate limiting | Upstash Redis (production), in-memory fallback (dev) |
| Testing | Vitest 4 (unit/integration), Playwright 1.58 (E2E) |
| Package manager | Bun |

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
- Hiring stages: `NEW` > `SCREENING` > `INTERVIEWING` > `FINAL_ROUND` > `OFFER` > `HIRED` | `REJECTED` | `WITHDRAWN`

### User Management (Admin)

- Create, edit, deactivate, and delete users
- Resend onboarding invites and trigger password resets
- Role assignment (Admin, Recruiter, Viewer)

## Data Model

Six primary entities:

| Model | Purpose |
| --- | --- |
| `User` | Identity, role, active state, password lifecycle |
| `Job` | Opening with priority, health, lifecycle dates |
| `Candidate` | Profile, contact info, resume metadata |
| `Application` | Job-candidate stage progression (unique per pair) |
| `AuditLog` | Who changed what, when, with before/after JSON |
| `SetPasswordToken` | HMAC-SHA256 hashed tokens for onboarding and password resets |

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

If email delivery fails during invite or reset, the issued token is rolled back and any previously active tokens are restored when safe to do so.

### Password Policy

- Minimum 12 characters, maximum 128 characters
- At least one uppercase letter, one lowercase letter, one number, and one symbol
- The 128-character maximum prevents bcrypt CPU abuse (bcrypt truncates at 72 bytes but validating before hashing avoids unnecessary work)

### Email System

Three operational modes:

| Mode | When | Behavior |
| --- | --- | --- |
| **Test** | `NODE_ENV=test` or `VITEST=true` | Captures to in-memory outbox (no real sends) |
| **Development** | SMTP not configured | Logs redacted console preview (tokens/passwords never shown) |
| **Production** | SMTP configured | Sends via nodemailer SMTP transport |

### Rate Limiting

Two tiers:

1. **Cloudflare** (recommended primary): Proxy-level rate limiting per IP.
2. **Application-level** (defense-in-depth): Upstash Redis in production, in-memory fallback in dev.

Application rate limits:

| Scope | Limit | Window |
| --- | --- | --- |
| `/api/auth/*` | 10 | 1 min |
| `POST\|PATCH\|DELETE /api/*` | 60 | 1 min |
| `GET /api/*` | 300 | 1 min |
| `/api/upload/*` | 20 | 1 min |
| Password setup (validate) | 30 | 15 min |
| Password setup (submit) | 10 | 15 min |
| Resend invite (per admin) | 5 | 15 min |
| Password reset (per admin) | 5 | 15 min |

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
- Application mutations use only `POST`, `PATCH`, `DELETE` (no `GET` writes)
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

### Known Limitation

Deactivating a user does not invalidate their active JWT session (up to 4-hour TTL). Sessions expire naturally. This is accepted for v1.

## API Surface

### Jobs

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/jobs` | GET | List jobs (pagination, search, sort, filter by status/department/health/critical) |
| `/api/jobs` | POST | Create job |
| `/api/jobs/:id` | GET | Get job by ID |
| `/api/jobs/:id` | PATCH | Update job |
| `/api/jobs/:id` | DELETE | Delete job |

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
│   ├── unit/              # 37 test files (Vitest)
│   ├── integration/       # 28 test files (Vitest + real DB)
│   ├── e2e/               # 20 Playwright browser specs
│   ├── TESTING_PLAYBOOK.md
│   ├── RISK_MATRIX.md
│   ├── MOCKING_POLICY.md
│   └── COVERAGE_AUDIT.md
├── docs/                  # Architecture, migration, and testing docs
├── scripts/               # test-all.sh, coverage-guard.sh, merge-coverage.mjs, setup-minio.sh, …
└── docker-compose*.yml    # Dev (MinIO) and test (PostgreSQL) services
```

## Environment Variables

Reference: [`.env.example`](./.env.example)

### Required

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
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

When SMTP variables are not set, the email system falls back to console preview mode (development).

### Rate Limiting (Production)

| Variable | Description |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |

When not set, rate limiting falls back to an in-memory store (not suitable for multi-instance production).

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

# Start development server
bun run dev
```

### Local MinIO (Resume Storage)

```bash
# Start MinIO via Docker Compose
docker compose up -d

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

- **Unit tests** (37 files): API route handlers, UI components, utility functions, validation schemas, rate limiting, email service, password policy, WFP import parsers
- **Integration tests** (28 files): Prisma operations against a real PostgreSQL database, route handler integration, email/storage/rate-limit adapter contract suites, password setup flow, system test lane
- **E2E tests** (20 specs): Full browser journeys for onboarding, admin user management (invite, resend, reset, deactivate, delete), recruiting pipeline, failure-path scenarios (email delivery failure, storage failure, session loss), and layout/auth flows

Test infrastructure:
- Main database: port 5432
- Test database: port 5433 (separate Docker container)
- Integration tests use `setupIntegrationTests()` for database lifecycle
- Shared harnesses: `setupTestAuth()`, `setupEmailHarness()`, `setupStorageHarness()`, `setupRateLimitHarness()`
- Mock policy: mocks are restricted to narrow, justified cases (see [`__tests__/MOCKING_POLICY.md`](./__tests__/MOCKING_POLICY.md))

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
