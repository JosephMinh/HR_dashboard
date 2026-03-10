# List Workspace Contract

> Canonical patterns for list/table workspaces in HR Dashboard

**Status:** Active | **Version:** 1.0 | **Last Updated:** 2026-03-10

---

## Overview

This contract defines the shared patterns for all list workspaces (Jobs, Candidates, Dashboard tables). All list pages must follow these guidelines to ensure consistency and a cohesive user experience.

**Covered pages:**
- `/jobs` - Jobs index
- `/candidates` - Candidates index
- Dashboard "All Jobs" module
- Any future list views

---

## 1. State Management

### 1.1 URL-Driven Filters (Primary Rule)

**All filter state lives in URL search params, not local state.**

```typescript
// ✅ Correct - Read from URL
const searchParams = useSearchParams()
const status = searchParams.get('status') || ''
const search = searchParams.get('search') || ''
const page = parseInt(searchParams.get('page') || '1', 10)

// ❌ Wrong - Local state for filters
const [status, setStatus] = useState('')
```

**Why URL state:**
1. Shareable links - Users can share filtered views
2. Browser history - Back/forward navigation works
3. Refresh persistence - State survives page reload
4. Bookmarkable - Users can bookmark filtered views

### 1.2 URL Update Patterns

```typescript
const updateParams = useCallback((updates: Record<string, string | null>) => {
  const params = new URLSearchParams(searchParams.toString())
  
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  })
  
  // CRITICAL: Reset to page 1 when filters change
  if (!('page' in updates)) {
    params.delete('page')
  }
  
  const nextUrl = `/path?${params.toString()}`
  
  // Use replace for filter changes (no history entry)
  // Use push for pagination (creates history entry)
  if ('page' in updates) {
    router.push(nextUrl)
  } else {
    router.replace(nextUrl)
  }
}, [router, searchParams])
```

### 1.3 Supported URL Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | `''` | Free-text search query |
| `status` | enum | `''` | Entity status filter |
| `sort` | string | varies | Sort field name |
| `order` | `'asc'` \| `'desc'` | varies | Sort direction |
| `page` | number | `1` | Current page (1-indexed) |

Page-specific filters (like `pipelineHealth`, `critical`) follow the same pattern.

---

## 2. Search

### 2.1 Search Input Specification

```typescript
<SearchInput
  value={search}
  onChange={(value) => updateParams({ search: value })}
  placeholder="Search [entity]..."
  debounceMs={300}          // Default, do not change
  fullWidth={false}         // Use fixed width in filter bars
  className="w-64"          // Standard width: 256px
/>
```

### 2.2 Search Behavior

| Behavior | Specification |
|----------|---------------|
| Debounce | 300ms (hardcoded in component) |
| Clear | X button appears when input has value |
| Escape key | Clears input |
| Placeholder | "Search [entity]..." (entity-specific) |
| Icon | Search icon left-aligned inside input |
| Width | `w-64` (256px) for filter bars, `w-72` (288px) if primary search |

### 2.3 Search Placeholder Examples

| Page | Placeholder |
|------|-------------|
| Jobs | "Search jobs..." |
| Candidates | "Search by name or email..." |

---

## 3. Sorting

### 3.1 Sort UI Pattern

Sortable columns display a ghost button with sort indicator:

```tsx
<TableHead aria-sort={getAriaSort(field)}>
  <Button
    variant="ghost"
    size="sm"
    className="-ml-3"
    onClick={() => toggleSort(field)}
  >
    {label}
    {getSortIcon(field)}
  </Button>
</TableHead>
```

### 3.2 Sort Icons

| State | Icon |
|-------|------|
| Not sorted | `ArrowUpDown` (neutral) |
| Ascending | `ArrowUp` |
| Descending | `ArrowDown` |

Icon size: `h-3 w-3` with `ml-1` margin.

### 3.3 Sort Toggle Behavior

```typescript
const toggleSort = (field: string) => {
  if (sort === field) {
    // Same field: toggle direction
    updateParams({ order: order === 'asc' ? 'desc' : 'asc' })
  } else {
    // New field: set default direction
    // Text fields default to 'asc', date fields default to 'desc'
    const defaultOrder = isDateField(field) ? 'desc' : 'asc'
    updateParams({ sort: field, order: defaultOrder })
  }
}
```

### 3.4 ARIA Sort

Always include `aria-sort` on sortable headers:

```typescript
const getAriaSort = (field: string): 'ascending' | 'descending' | 'none' => {
  if (sort !== field) return 'none'
  return order === 'asc' ? 'ascending' : 'descending'
}
```

---

## 4. Pagination

### 4.1 Page Size

**Standard: 20 items per page**

```typescript
const ITEMS_PER_PAGE = 20
```

Do not vary page size between pages unless there's a specific UX reason.

### 4.2 Pagination Info Text

Format: `"Showing {start}-{end} of {total} {entity}"`

```typescript
const startIndex = (page - 1) * ITEMS_PER_PAGE
const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, total)

<p className="text-sm text-muted-foreground">
  Showing {startIndex + 1}-{endIndex} of {total} jobs
</p>
```

### 4.3 Pagination Controls

```tsx
{totalPages > 1 && (
  <div className="flex items-center gap-2">
    <Button
      variant="outline"
      size="sm"
      onClick={() => updateParams({ page: String(page - 1) })}
      disabled={page <= 1}
    >
      <ChevronLeft className="h-4 w-4" />
      Previous
    </Button>
    <span className="min-w-20 text-center text-xs text-muted-foreground">
      Page {page} of {totalPages}
    </span>
    <Button
      variant="outline"
      size="sm"
      onClick={() => updateParams({ page: String(page + 1) })}
      disabled={page >= totalPages}
    >
      Next
      <ChevronRight className="h-4 w-4" />
    </Button>
  </div>
)}
```

### 4.4 Pagination Layout

```
[Info text]                        [Prev] Page X of Y [Next]
```

Use `flex items-center justify-between` for layout.

---

## 5. Loading State

### 5.1 Table Skeleton

Use `TableSkeleton` component with appropriate dimensions:

```tsx
{isLoading && (
  <TableSkeleton rows={8} columns={columnCount} />
)}
```

Row count should match expected page size or slightly less.

### 5.2 Suspense Boundary

Wrap table components in Suspense at the page level:

```tsx
<Suspense fallback={<TableSkeleton rows={8} columns={7} />}>
  <JobsTable />
</Suspense>
```

---

## 6. Empty State

### 6.1 EmptyState Component

```tsx
<EmptyState
  icon={EntityIcon}        // Lucide icon for the entity
  title="No [entity] found"
  description={hasFilters 
    ? 'Try adjusting your filters' 
    : 'Create your first [entity] to get started'
  }
  action={!hasFilters && userCanMutate ? {
    label: 'Create [Entity]',
    onClick: () => router.push('/[entity]/new'),
  } : undefined}
/>
```

### 6.2 Empty State Messages

| Context | Title | Description |
|---------|-------|-------------|
| No results, no filters | "No [entity] found" | "Create your first [entity] to get started" |
| No results, has filters | "No [entity] found" | "Try adjusting your filters" |

---

## 7. Error State

### 7.1 ErrorState Component

```tsx
{error && (
  <ErrorState 
    message={error.message} 
    onRetry={() => void refetch()} 
  />
)}
```

Always provide a retry action when using TanStack Query.

---

## 8. Row Interactions

### 8.1 Primary Column Link

The first (or most important) column should be a clickable link to the detail page:

```tsx
<TableCell>
  <Link
    href={`/[entity]/${item.id}`}
    className="font-medium hover:underline"
  >
    {item.name}
  </Link>
</TableCell>
```

### 8.2 Row Hover

Tables use default hover behavior from the `Table` component. Do not add custom row hover unless implementing row selection.

### 8.3 Row Actions

If row actions exist, place them in the last column:
- Use `DropdownMenu` for multiple actions
- Use icon buttons for single common actions

---

## 9. Filter Bar Layout

### 9.1 FilterBar Component

```tsx
<FilterBar 
  showClearAll={!!hasFilters} 
  onClearAll={clearFilters}
  className="justify-between"
>
  <SearchInput ... />
  <Select ... />
  {/* Additional filters */}
</FilterBar>
```

### 9.2 Filter Placement

| Element | Position |
|---------|----------|
| Search input | Left |
| Status/Type filters | Right of search |
| Clear All button | Auto (from FilterBar) |

---

## 10. Responsive Behavior

### 10.1 Table Scrolling

Tables should scroll horizontally on small screens:

```tsx
<div className="rounded-md border overflow-auto">
  <Table className="min-w-[800px]">
    ...
  </Table>
</div>
```

### 10.2 Filter Stacking

On mobile, filters may stack vertically. Use responsive classes:

```tsx
<FilterBar className="flex-col sm:flex-row gap-2 sm:gap-4">
```

### 10.3 Pagination on Mobile

Pagination controls should remain horizontal but may reduce text:

```tsx
<span className="hidden sm:inline">Page</span> {page} of {totalPages}
```

---

## 11. Implementation Checklist

When building a new list workspace:

- [ ] Filter state is URL-driven (not local state)
- [ ] Search uses `SearchInput` with 300ms debounce
- [ ] Search width is `w-64` or `w-72`
- [ ] Sort columns have `aria-sort` attribute
- [ ] Page resets to 1 when filters change
- [ ] Page size is 20 items
- [ ] Pagination shows "Showing X-Y of Z [entity]"
- [ ] Loading uses `TableSkeleton` 
- [ ] Empty state uses `EmptyState` component
- [ ] Error state uses `ErrorState` with retry
- [ ] Primary column is a link to detail page
- [ ] Table wraps with horizontal scroll on mobile

---

## 12. Query Hook Pattern

Use TanStack Query with this pattern:

```typescript
const { data, isLoading, error, refetch } = useEntityQuery({
  search: search || undefined,
  status: status || undefined,
  sort,
  order,
  page,
  limit: ITEMS_PER_PAGE,
  includeCount: true, // For pagination
})

const items = data?.items ?? []
const total = data?.total ?? 0
const totalPages = data?.totalPages ?? 1
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-10 | Initial contract definition |
