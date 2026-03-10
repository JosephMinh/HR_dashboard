# TanStack Migration Playbook

Agent implementation guide for TanStack Query, Table, and Form patterns in the HR Dashboard.

**Status:** v1.0
**Created:** 2026-03-10
**Task:** hr-214.5.4

---

## 1. Query Key Catalog

All query keys are defined in `src/lib/query-keys.ts` using the factory pattern.

### Key Structure

```typescript
// Pattern: [scope, type, ...params]
queryKeys.jobs.all           // ['jobs']
queryKeys.jobs.lists()       // ['jobs', 'list']
queryKeys.jobs.list(filters) // ['jobs', 'list', { status: 'OPEN', ... }]
queryKeys.jobs.detail(id)    // ['jobs', 'detail', 'uuid-here']
```

### Complete Key Reference

| Key Factory | Result | Use Case |
|-------------|--------|----------|
| `queryKeys.jobs.all` | `['jobs']` | Invalidate all job queries |
| `queryKeys.jobs.lists()` | `['jobs', 'list']` | Invalidate all job list queries |
| `queryKeys.jobs.list(filters?)` | `['jobs', 'list', filters?]` | Fetch job list with filters |
| `queryKeys.jobs.details()` | `['jobs', 'detail']` | Invalidate all job details |
| `queryKeys.jobs.detail(id)` | `['jobs', 'detail', id]` | Fetch/invalidate single job |
| `queryKeys.candidates.all` | `['candidates']` | Invalidate all candidate queries |
| `queryKeys.candidates.lists()` | `['candidates', 'list']` | Invalidate all candidate lists |
| `queryKeys.candidates.list(filters?)` | `['candidates', 'list', filters?]` | Fetch candidate list |
| `queryKeys.candidates.detail(id)` | `['candidates', 'detail', id]` | Fetch single candidate |
| `queryKeys.candidates.resume(key)` | `['candidates', 'resume', key]` | Resume download URL |
| `queryKeys.applications.all` | `['applications']` | Invalidate all application queries |
| `queryKeys.applications.lists()` | `['applications', 'list']` | Invalidate all application lists |
| `queryKeys.applications.byJob(jobId)` | `['applications', 'byJob', jobId]` | Applications for a specific job |
| `queryKeys.applications.byCandidate(cId)` | `['applications', 'byCandidate', cId]` | Applications for a candidate |
| `queryKeys.dashboard.stats(filters?)` | `['dashboard', 'stats', filters?]` | Dashboard statistics |
| `queryKeys.users.all` | `['users']` | All user queries |
| `queryKeys.users.current()` | `['users', 'current']` | Current authenticated user |

---

## 2. Cache Invalidation Matrix

### Cache Policy Reference

Defined in `src/lib/query-keys.ts`:

| Query Type | staleTime | gcTime | maxRetries |
|------------|-----------|--------|------------|
| jobs.list | 20s | 5min | 2 |
| jobs.detail | 60s | 10min | 1 |
| candidates.list | 20s | 5min | 2 |
| candidates.detail | 60s | 10min | 1 |
| dashboard.stats | 2min | 10min | 1 |
| applications.list | 10s | 5min | 1 |
| applications.byJob | 10s | 5min | 1 |
| applications.byCandidate | 10s | 5min | 1 |

### Mutation Invalidation Map

| Mutation | Invalidates | Notes |
|----------|-------------|-------|
| **createJob** | `jobs.lists()` | New job appears in all list views |
| **updateJob** | `jobs.detail(id)`, `jobs.lists()` | Detail and lists refresh |
| **deleteJob** | `jobs.detail(id)` (remove), `jobs.lists()` | Cache entry removed |
| **createCandidate** | `candidates.lists()`, `applications.byJob(jobId)?`, `jobs.detail(jobId)?` | If linked to job, also invalidates job applications |
| **updateCandidate** | `candidates.detail(id)`, `candidates.lists()` | |
| **deleteCandidate** | `candidates.detail(id)` (remove), `candidates.lists()`, `applications.all` | Cascades to applications |
| **createApplication** | `applications.lists()`, `applications.byJob()`, `applications.byCandidate()`, `jobs.detail()`, `candidates.detail()`, `jobs.lists()`, `candidates.lists()` | Broad invalidation for pipeline sync |
| **updateApplication** | `applications.detail(id)`, `applications.byJob()`, `applications.byCandidate()`, `jobs.detail()`, `candidates.detail()` | Stage changes update counters |
| **deleteApplication** | `applications.detail(id)`, `applications.lists()`, `applications.byJob()?`, `jobs.detail()?`, `applications.byCandidate()?`, `candidates.detail()?` | Conditional based on provided IDs |

### Invalidation Strategy Rules

1. **Prefer targeted invalidation** - Use specific keys like `jobs.detail(id)` over broad `jobs.all`
2. **Always invalidate lists after mutations** - Users expect to see changes immediately
3. **Use `removeQueries` for deletes** - Prevents stale cache entries from persisting
4. **Cascade invalidation for relationships** - Application changes affect job/candidate counts

---

## 3. Standard Templates

### Query Hook Template

```typescript
// src/hooks/queries/use-[entity].ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, buildUrl, createRetryPolicy } from '@/lib/api-client'
import { queryCachePolicy, queryKeys, type EntityFilters } from '@/lib/query-keys'

// List query with filters
export function useEntityListQuery(filters?: EntityFilters) {
  return useQuery({
    queryKey: queryKeys.entity.list(filters),
    queryFn: async () => {
      const url = buildUrl('/api/entity', {
        search: filters?.search,
        sort: filters?.sort,
        order: filters?.order,
        page: filters?.page,
        pageSize: filters?.limit,
      })
      return api.get<EntityListResponse>(url)
    },
    staleTime: queryCachePolicy.entity.list.staleTime,
    gcTime: queryCachePolicy.entity.list.gcTime,
    retry: createRetryPolicy(queryCachePolicy.entity.list.maxRetries),
  })
}

// Detail query
export function useEntityQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.entity.detail(id ?? ''),
    queryFn: async () => {
      if (!id) throw new Error('Entity ID is required')
      return api.get<Entity>(`/api/entity/${id}`)
    },
    enabled: !!id,
    staleTime: queryCachePolicy.entity.detail.staleTime,
    gcTime: queryCachePolicy.entity.detail.gcTime,
  })
}

// Create mutation
export function useCreateEntityMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEntityInput) => {
      return api.post<Entity>('/api/entity', input)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.entity.lists() })
    },
  })
}

// Update mutation
export function useUpdateEntityMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateEntityInput) => {
      return api.patch<Entity>(`/api/entity/${id}`, input)
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.entity.detail(data.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.entity.lists() })
    },
  })
}

// Delete mutation
export function useDeleteEntityMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      return api.delete<void>(`/api/entity/${id}`)
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.entity.detail(id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.entity.lists() })
    },
  })
}
```

### DataTable Usage Template

```tsx
// Component using DataTable with controlled state

import { useState } from 'react'
import type { ColumnDef, SortingState, PaginationState } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { useEntityQuery } from '@/hooks/queries'

const columns: ColumnDef<Entity>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    enableSorting: true,
    cell: ({ row }) => <span>{row.original.name}</span>,
    meta: { headerClassName: 'w-[200px]' },
  },
  // ... more columns
]

export function EntityTable() {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updatedAt', desc: true },
  ])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })

  // Derive API params from table state
  const sortField = sorting[0]?.id ?? 'updatedAt'
  const sortOrder = sorting[0]?.desc ? 'desc' : 'asc'

  const { data, isLoading, error } = useEntityQuery({
    sort: sortField,
    order: sortOrder,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  })

  return (
    <DataTable
      columns={columns}
      data={data?.items ?? []}
      sorting={sorting}
      onSortingChange={setSorting}
      pagination={pagination}
      onPaginationChange={setPagination}
      pageCount={data?.totalPages ?? 1}
      totalCount={data?.total}
      isLoading={isLoading}
      emptyMessage="No items found"
    />
  )
}
```

### Form with Mutation Template

```tsx
// Form component with TanStack Form + mutation

import { useForm } from '@tanstack/react-form'
import { useCreateEntityMutation } from '@/hooks/queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormFieldError } from '@/components/ui/form-field-error'

export function EntityForm({ onSuccess }: { onSuccess?: () => void }) {
  const createMutation = useCreateEntityMutation()

  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
    },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync(value)
      onSuccess?.()
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) => !value ? 'Name is required' : undefined,
        }}
      >
        {(field) => (
          <div>
            <Input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
            <FormFieldError errors={field.state.meta.errors} />
          </div>
        )}
      </form.Field>

      <Button
        type="submit"
        disabled={createMutation.isPending}
      >
        {createMutation.isPending ? 'Saving...' : 'Save'}
      </Button>
    </form>
  )
}
```

---

## 4. Anti-Patterns to Avoid

### Manual Fetch with useEffect

```tsx
// BAD - Race conditions, no caching, manual loading state
function BadComponent() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/items')
      .then((res) => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  // ...
}

// GOOD - Use query hook
function GoodComponent() {
  const { data, isLoading, error } = useItemsQuery()
  // ...
}
```

### router.refresh() After Mutations

```tsx
// BAD - Full page refresh, loses client state
const handleSubmit = async (data) => {
  await fetch('/api/items', { method: 'POST', body: JSON.stringify(data) })
  router.refresh() // DON'T DO THIS
}

// GOOD - Targeted cache invalidation
const mutation = useCreateItemMutation()
// Mutation hook already handles invalidation in onSuccess
```

### Manual Abort Controllers

```tsx
// BAD - Manual abort management
useEffect(() => {
  const controller = new AbortController()
  fetch('/api/items', { signal: controller.signal })
    .then(...)
  return () => controller.abort()
}, [filters])

// GOOD - TanStack Query handles this automatically
const { data } = useItemsQuery(filters)
```

### Polling with setInterval

```tsx
// BAD - Manual polling
useEffect(() => {
  const interval = setInterval(() => {
    fetchData()
  }, 5000)
  return () => clearInterval(interval)
}, [])

// GOOD - Use refetchInterval option
const { data } = useQuery({
  queryKey: ['items'],
  queryFn: fetchItems,
  refetchInterval: 5000,
})
```

### Duplicate State

```tsx
// BAD - Duplicating server state in local state
const [items, setItems] = useState([])
useEffect(() => {
  fetchItems().then(setItems)
}, [])

// GOOD - Query IS the state
const { data: items } = useItemsQuery()
```

### Manual Deduplication

```tsx
// BAD - Fetching same data in multiple components
function ComponentA() {
  const [data, setData] = useState(null)
  useEffect(() => { fetch('/api/items').then(...) }, [])
}

function ComponentB() {
  const [data, setData] = useState(null)
  useEffect(() => { fetch('/api/items').then(...) }, []) // DUPLICATE!
}

// GOOD - Both components share the same cached query
function ComponentA() {
  const { data } = useItemsQuery() // Shared cache
}

function ComponentB() {
  const { data } = useItemsQuery() // Same cache, no extra request
}
```

---

## 5. Debugging Tips

### Query Devtools

Add to layout for development:

```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

// In your layout
<QueryClientProvider client={queryClient}>
  {children}
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

### Manual Cache Inspection

```typescript
// In browser console or component
const queryClient = useQueryClient()

// View all cached queries
console.log(queryClient.getQueryCache().getAll())

// Get specific query data
console.log(queryClient.getQueryData(queryKeys.jobs.list()))

// Force refetch
queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all })
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Data not updating after mutation | Missing invalidation | Add `invalidateQueries` in `onSuccess` |
| Infinite refetching | Missing dependency in queryKey | Include all filters in key factory |
| Stale data flashing | staleTime too short | Increase staleTime or use `placeholderData` |
| Memory leak warnings | gcTime too long | Reduce gcTime or use `removeQueries` |

---

## 6. Migration Checklist

When migrating a component:

- [ ] Replace `useState` + `useEffect` fetch pattern with query hook
- [ ] Remove manual loading/error state management
- [ ] Remove `router.refresh()` calls in favor of `invalidateQueries`
- [ ] Verify query key includes all dynamic parameters
- [ ] Add appropriate `staleTime`/`gcTime` via `queryCachePolicy`
- [ ] Handle loading state with `isLoading` from query
- [ ] Handle error state with `error` from query
- [ ] Test that mutations properly invalidate related queries
- [ ] Verify no duplicate fetches in React Query Devtools

---

## 7. Performance and Network Evidence (hr-214.5.3)

Collected on **2026-03-10** in this workspace.

### Before/After Indicators (Git Snapshot vs Current Workspace)

Baseline snapshot: `9b3250f` (`main` HEAD at measurement time).

| Metric | Baseline (`9b3250f`) | Current Workspace | Delta |
|--------|-----------------------|-------------------|-------|
| Direct `fetch()` calls in migrated list tables (`jobs-table`, `candidates-table`, `all-jobs-table`) | 3 | 0 | -3 |
| `useJobsQuery`/`useCandidatesQuery` references in migrated list tables | 0 | 6 | +6 |
| `router.refresh()` calls under `src/app` | 7 | 0 | -7 |

### Runtime Measurements (Current Workspace)

| Command | Result |
|---------|--------|
| `npm test` | 126 tests passed in ~5.17s (wall clock ~5.92s) |
| `npm run build` | Success; Turbopack compile ~4.7s, total wall clock ~22.04s |

### E2E/Network Measurement Status

- Attempted targeted Playwright run (`Jobs List Page`) failed during global setup because test database did not become reachable (`Database not ready after maximum retries`).
- `npm run test:db:up` fails in this environment because `docker compose` is unavailable (`unknown shorthand flag: 'f' in -f`).

### Interpretation

- Static source deltas show migration goals are materially met on key list surfaces: direct client `fetch()` loops are removed and replaced by query-hook usage.
- `router.refresh()` elimination in app code indicates reduced full-route invalidation churn and more targeted cache invalidation behavior.
- Build and unit-test runtimes are stable and passing in the current workspace.
- Full browser-level network-request-count benchmarking is pending environment support for the E2E test database runtime.
