# TanStack Migration Blueprint

## Overview

This document defines the migration strategy from manual client state/fetch/table/form patterns to TanStack primitives (Query, Table, Form).

**Status:** Draft v1.0
**Created:** 2026-03-10
**Owner:** hr-214.1.1

---

## 1. Scope Boundaries

### In Scope

| Area | Components | TanStack Target |
|------|------------|-----------------|
| **Query** | JobsTable, CandidatesTable, AllJobsTable, detail pages | `@tanstack/react-query` |
| **Table** | JobsTable, CandidatesTable, AllJobsTable | `@tanstack/react-table` |
| **Form** | JobForm, CandidateForm, LoginForm | `@tanstack/react-form` |
| **API** | `/api/jobs`, `/api/candidates` pagination | Server-side pagination |

### Out of Scope

- ResumeUpload component (complex file state machine, keep as-is)
- `/api/dashboard/stats` (aggregation endpoint, no pagination needed)
- Server components (remain server-rendered)
- Authentication flows (NextAuth integration unchanged)

---

## 2. Current State Analysis

### Data Fetching Patterns

| File | Pattern | Issues |
|------|---------|--------|
| `jobs-table.tsx` (342 LOC) | useState + useEffect + fetch | Race conditions, no cache, manual abort |
| `candidates-table.tsx` (327 LOC) | useState + useEffect + fetch | No dedup, refetch on mount |
| `all-jobs-table.tsx` (386 LOC) | useState + useEffect + fetch | Complex filter state, no cache |

### Table Patterns

- **Sorting:** URL-driven via `sort` and `order` params
- **Filtering:** URL-driven via `status`, `search`, `department` params
- **Pagination:** Client-side slicing (20 items/page), not server-side

### Form Patterns

- **JobForm:** Manual useState for each field, submit-time validation
- **CandidateForm:** Manual useState, linked job selection, resume upload integration
- **LoginForm:** Simple 2-field form, NextAuth integration
  - Decision: keep LoginForm lightweight for now; TanStack Form adds complexity without clear benefit.

### API Contract Gaps

| Endpoint | Current | Needed |
|----------|---------|--------|
| `GET /api/jobs` | Returns all records | `limit`, `offset`, `page` params |
| `GET /api/candidates` | Returns all records | `limit`, `offset`, `page` params |

---

## 3. File Ownership Map

### Track 1: Foundation (hr-214.1.x)

| File | Task | Action |
|------|------|--------|
| `package.json` | hr-214.1.2 | Add TanStack deps |
| `src/app/layout.tsx` or `src/lib/providers.tsx` | hr-214.1.2 | QueryClientProvider |
| `src/lib/api-client.ts` | hr-214.1.3 | New typed fetch wrapper |
| `src/lib/query-keys.ts` | hr-214.1.3 | Canonical query key factory |
| `src/app/api/jobs/route.ts` | hr-214.1.4 | Pagination params |
| `src/app/api/candidates/route.ts` | hr-214.1.5 | Pagination params |

### Track 2: Query Migration (hr-214.2.x)

| File | Task | Action |
|------|------|--------|
| `src/hooks/queries/use-jobs.ts` | hr-214.2.1 | New query hook module |
| `src/hooks/queries/use-candidates.ts` | hr-214.2.1 | New query hook module |
| `src/hooks/queries/use-dashboard.ts` | hr-214.2.1 | New query hook module |
| `src/app/jobs/jobs-table.tsx` | hr-214.2.3 | Replace fetch with useQuery |
| `src/app/candidates/candidates-table.tsx` | hr-214.2.4 | Replace fetch with useQuery |
| `src/components/dashboard/all-jobs-table.tsx` | hr-214.2.5 | Replace fetch with useQuery |
| Detail/mutation hooks | hr-214.2.6-8 | Optimistic updates |

### Track 3: Table Migration (hr-214.3.x)

| File | Task | Action |
|------|------|--------|
| `src/components/ui/data-table.tsx` | hr-214.3.1 | New shared adapter |
| `src/app/jobs/jobs-table.tsx` | hr-214.3.2 | Use createTable |
| `src/app/candidates/candidates-table.tsx` | hr-214.3.3 | Use createTable |
| `src/components/dashboard/all-jobs-table.tsx` | hr-214.3.4 | Use createTable |

### Track 4: Form Migration (hr-214.4.x)

| File | Task | Action |
|------|------|--------|
| `src/app/jobs/job-form.tsx` | hr-214.4.2 | useForm + zod |
| `src/app/candidates/candidate-form.tsx` | hr-214.4.3 | useForm + zod |
| `src/app/login/login-form.tsx` | hr-214.4.4 | Optional; keep current form unless shared validation needs emerge |

---

## 4. Acceptance Criteria

### Foundation (hr-214.1)

- [ ] TanStack Query, Table, Form packages installed
- [ ] QueryClientProvider wraps the app
- [ ] Typed API client with consistent error handling
- [ ] Query key factory with hierarchical keys (`['jobs', 'list', filters]`)
- [ ] `/api/jobs` accepts `page`, `limit` params, returns `{ data, meta: { total, page, pageSize, pageCount }}`
- [ ] `/api/candidates` accepts `page`, `limit` params, returns same shape

### Query Migration (hr-214.2)

- [ ] `useJobsQuery(filters)` hook replaces manual fetch in JobsTable
- [ ] `useCandidatesQuery(filters)` hook replaces manual fetch in CandidatesTable
- [ ] `useDashboardStatsQuery()` hook for dashboard
- [ ] Cache invalidation on create/update mutations
- [ ] Loading/error states preserved (no UX regression)
- [ ] URL params continue to drive filter state

### Table Migration (hr-214.3)

- [ ] Shared `DataTable` adapter wrapping TanStack Table
- [ ] Server-side sorting via `orderBy` query param
- [ ] Server-side filtering via existing params
- [ ] Server-side pagination via `page`/`limit` params
- [ ] Column definitions extracted and typed
- [ ] Accessibility: aria-sort attributes preserved

### Form Migration (hr-214.4)

- [ ] JobForm uses TanStack Form with zod schema
- [ ] Field-level validation errors display inline
- [ ] CandidateForm uses TanStack Form
- [ ] Resume upload integrates with form state
- [ ] LoginForm optionally migrated (low priority)

### Verification (hr-214.5)

- [ ] E2E tests pass (auth, jobs, candidates)
- [ ] No performance regression (LCP, FID)
- [ ] TypeScript strict mode passes
- [ ] ESLint passes
- [ ] Documentation updated

---

## 5. Sequencing Constraints

```
hr-214.1.1 (this blueprint)
    │
    ├── hr-214.1.2 (install deps, providers)
    │       │
    │       ├── hr-214.1.3 (API client, query keys)
    │       │       │
    │       │       └── hr-214.2.1 (query hook modules)
    │       │               │
    │       │               ├── hr-214.2.3 (JobsTable query)
    │       │               ├── hr-214.2.4 (CandidatesTable query)
    │       │               └── hr-214.2.5 (AllJobsTable query)
    │       │
    │       ├── hr-214.3.1 (DataTable adapter)
    │       │       │
    │       │       ├── hr-214.3.2 (JobsTable table)
    │       │       ├── hr-214.3.3 (CandidatesTable table)
    │       │       └── hr-214.3.4 (AllJobsTable table)
    │       │
    │       └── hr-214.4.1 (form foundation)
    │               │
    │               ├── hr-214.4.2 (JobForm)
    │               └── hr-214.4.3 (CandidateForm)
    │
    ├── hr-214.1.4 (jobs API pagination)
    │       │
    │       └── hr-214.2.3 (JobsTable query) [also needs this]
    │
    └── hr-214.1.5 (candidates API pagination)
            │
            └── hr-214.2.4 (CandidatesTable query) [also needs this]
```

### Parallel Execution Opportunities

These tracks can proceed in parallel once hr-214.1.2 is complete:

1. **Query Track:** 214.1.3 → 214.2.1 → 214.2.x
2. **Table Track:** 214.3.1 → 214.3.x
3. **Form Track:** 214.4.1 → 214.4.x
4. **API Track:** 214.1.4 + 214.1.5 (parallel)

---

## 6. Agent Ownership Slices

For multi-agent coordination, tasks are grouped by concern:

### Slice A: API & Backend

- hr-214.1.4: Add pagination to `/api/jobs`
- hr-214.1.5: Add pagination to `/api/candidates`
- Testing pagination edge cases

### Slice B: Query Infrastructure

- hr-214.1.2: Install deps, wire providers
- hr-214.1.3: API client, query key factory
- hr-214.2.1: Create query hook modules
- hr-214.2.6-8: Mutation hooks with optimistic updates

### Slice C: Table Components

- hr-214.3.1: DataTable adapter
- hr-214.3.2: JobsTable migration
- hr-214.3.3: CandidatesTable migration
- hr-214.3.4: AllJobsTable migration

### Slice D: Form Components

- hr-214.4.1: Form foundation
- hr-214.4.2: JobForm migration
- hr-214.4.3: CandidateForm migration
- hr-214.4.4: LoginForm (optional)

### Slice E: Integration & Polish

- hr-214.2.3-5: Wire query hooks into tables
- hr-214.5.x: Testing, docs, verification

---

## 7. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| URL state divergence | Maintain single source of truth in searchParams |
| Cache invalidation bugs | Conservative staleTime, explicit invalidation on mutations |
| Bundle size increase | Tree-shake TanStack packages, monitor with bundle analyzer |
| Breaking existing E2E tests | Run E2E suite after each component migration |
| Form validation UX change | Preserve existing validation messages |

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Lines of code | -20% reduction in table/form components |
| Data fetch race conditions | Zero after migration |
| Query deduplication | Active for same-key queries |
| E2E test pass rate | 100% (no regression) |
| TypeScript coverage | 100% strict mode |

---

## Appendix: Package Versions

```json
{
  "@tanstack/react-query": "^5.x",
  "@tanstack/react-table": "^8.x",
  "@tanstack/react-form": "^0.x",
  "@tanstack/zod-form-adapter": "^0.x"
}
```

---

## Changelog

- 2026-03-10: Initial blueprint (hr-214.1.1)
