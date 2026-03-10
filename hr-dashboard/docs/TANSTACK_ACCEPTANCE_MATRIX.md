# TanStack Migration Acceptance Matrix

Quick-reference acceptance criteria for each migration task.

---

## Foundation Track (hr-214.1)

### hr-214.1.1: Design migration blueprint
- [x] Blueprint document created
- [x] Ownership map defined
- [x] Acceptance matrix created
- [x] Sequencing constraints documented

### hr-214.1.2: Install TanStack deps & providers
- [x] `@tanstack/react-query` installed
- [x] `@tanstack/react-table` installed
- [x] `@tanstack/react-form` installed
- [x] `@tanstack/zod-form-adapter` installed
- [x] `QueryClientProvider` wraps app in layout
- [x] Default QueryClient options configured (staleTime, gcTime)
- [x] DevTools added in development mode

### hr-214.1.3: API client & query keys
- [x] `src/lib/api-client.ts` created with typed fetch
- [x] Consistent error handling (ApiError class)
- [x] `src/lib/query-keys.ts` created
- [x] Query keys follow pattern: `[scope, type, ...params]`
- [x] Exported as `queryKeys.jobs.list(filters)`, etc.

### hr-214.1.4: Jobs API pagination
- [x] GET `/api/jobs` accepts `page` param (default: 1)
- [x] GET `/api/jobs` accepts `pageSize` param (default: 20, max: 100)
- [x] Response shape: `{ jobs, total, page, pageSize, totalPages }`
- [x] Invalid page returns 400 error
- [x] Existing filters (status, search, sort) still work

### hr-214.1.5: Candidates API pagination
- [x] GET `/api/candidates` accepts `page` param (default: 1)
- [x] GET `/api/candidates` accepts `pageSize` param (default: 20, max: 100)
- [x] Response shape: `{ candidates, total, page, pageSize, totalPages }`
- [x] Invalid page returns 400 error
- [x] Existing filters (search, sort) still work

---

## Query Track (hr-214.2)

### hr-214.2.1: Feature-scoped query hooks
- [x] `src/hooks/queries/use-jobs.ts` created
- [x] `src/hooks/queries/use-candidates.ts` created
- [x] `src/hooks/queries/use-dashboard.ts` created
- [x] Hooks use query key factory
- [x] Proper TypeScript generics for data/error

### hr-214.2.2: Dashboard stats query hook
- [x] `useDashboardStats()` hook created
- [x] Caches stats appropriately
- [x] Error state handled

### hr-214.2.3: JobsTable useQuery migration
- [x] Manual fetch removed from JobsTable
- [x] `useJobsQuery(filters)` integrated
- [x] Loading state uses TanStack Query `isLoading`
- [x] Error state uses TanStack Query `error`
- [x] URL params continue to drive filters
- [x] Server-side pagination enabled

### hr-214.2.4: CandidatesTable useQuery migration
- [x] Manual fetch removed from CandidatesTable
- [x] `useCandidatesQuery(filters)` integrated
- [x] Loading/error states from TanStack Query
- [x] URL params continue to drive filters
- [x] Server-side pagination enabled

### hr-214.2.5: AllJobsTable useQuery migration
- [x] Manual fetch removed from AllJobsTable
- [x] `useJobsQuery(filters)` integrated
- [x] Multi-status filter preserved
- [x] Multi-department filter preserved
- [x] Local filter state maintained (dashboard doesn't use URL)

### hr-214.2.6: Job mutations with invalidation
- [ ] `useCreateJob()` mutation hook
- [ ] `useUpdateJob()` mutation hook
- [ ] Invalidates `['jobs', 'list']` on success
- [ ] Optimistic updates for status changes

### hr-214.2.7: Candidate mutations with invalidation
- [ ] `useCreateCandidate()` mutation hook
- [ ] `useUpdateCandidate()` mutation hook
- [ ] Invalidates `['candidates', 'list']` on success

### hr-214.2.8: Application mutations
- [ ] `useCreateApplication()` mutation hook
- [ ] `useUpdateApplicationStage()` mutation hook
- [ ] Invalidates related job/candidate queries

---

## Table Track (hr-214.3)

### hr-214.3.1: DataTable adapter
- [ ] `src/components/ui/data-table.tsx` created
- [ ] Uses TanStack Table headless API
- [ ] Accepts column definitions as prop
- [ ] Handles sorting state
- [ ] Handles pagination state
- [ ] Accessible (aria-sort, keyboard nav)

### hr-214.3.2: JobsTable to TanStack Table
- [ ] Column definitions extracted
- [ ] Uses DataTable adapter
- [ ] Server-side sorting via API
- [ ] Server-side pagination via API
- [ ] Critical job indicator preserved
- [ ] All existing columns displayed

### hr-214.3.3: CandidatesTable to TanStack Table
- [ ] Column definitions extracted
- [ ] Uses DataTable adapter
- [ ] Server-side sorting via API
- [ ] Server-side pagination via API
- [ ] Resume indicator preserved

### hr-214.3.4: AllJobsTable to TanStack Table
- [ ] Column definitions extracted
- [ ] Uses DataTable adapter
- [ ] Multi-filter preserved
- [ ] Sorting preserved

---

## Form Track (hr-214.4)

### hr-214.4.1: Form foundation
- [x] TanStack Form with Zod adapter configured
- [x] Shared form styles/utilities
- [x] Field error display component

### hr-214.4.2: JobForm migration
- [ ] Uses `useForm` from TanStack Form
- [ ] Zod schema validates all fields
- [ ] Field-level errors display inline
- [ ] Create mode works
- [ ] Edit mode pre-populates
- [ ] Submit disables during pending

### hr-214.4.3: CandidateForm migration
- [ ] Uses `useForm` from TanStack Form
- [ ] Zod schema validates all fields
- [ ] Resume upload integration preserved
- [ ] Linked job selection preserved
- [ ] Create/Edit modes work

### hr-214.4.4: LoginForm migration (optional)
- [x] Decision: keep LoginForm as-is (simple flow, minimal validation)
- [ ] Uses `useForm` from TanStack Form (deferred)
- [ ] Simple email/password validation
- [ ] NextAuth integration unchanged

---

## Verification Track (hr-214.5)

### hr-214.5.2: E2E list+mutation scenarios
- [x] Jobs list sort/filter/search scenarios exist
- [x] Candidates list sort/search scenarios exist
- [x] Application pipeline mutation scenarios exist (attach, stage change, unlink)
- [ ] End-to-end execution in this environment (currently blocked: test DB runtime unavailable)

### hr-214.5.3: Performance and network verification
- [x] Static before/after fetch + refresh deltas documented
- [x] Current `npm test` runtime captured
- [x] Current `npm run build` runtime captured
- [ ] Full browser-level network benchmark completed (blocked until E2E DB runtime is available)

### hr-214.5.4: Documentation
- [x] Migration playbook created
- [x] Cache policy/invalidation matrix documented
- [x] Query hook usage templates documented

---

## Quick Reference: Priority Order

1. **hr-214.1.2** - Install deps (unblocks everything)
2. **hr-214.1.3** - API client (unblocks query hooks)
3. **hr-214.1.4 + hr-214.1.5** - API pagination (parallel)
4. **hr-214.2.1** - Query hooks (unblocks table migrations)
5. **hr-214.3.1** - DataTable adapter (unblocks table migrations)
6. **hr-214.2.3-5 + hr-214.3.2-4** - Table migrations (can parallel)
7. **hr-214.4.1-3** - Form migrations (can parallel with above)
8. **hr-214.5.x** - Verification (after all migrations)
