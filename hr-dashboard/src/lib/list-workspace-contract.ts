/**
 * LIST WORKSPACE CONTRACT
 * =======================
 * Canonical patterns for all list/table workspaces in the HR Dashboard.
 * This contract ensures consistency across Jobs, Candidates, Dashboard, and future list surfaces.
 *
 * VISUAL RHYTHM
 * - Container: space-y-4 between major sections (filter bar, table, pagination)
 * - Table border: rounded-md border
 * - Filter bar: rounded-xl border-border/70 bg-card/70 p-2.5
 *
 * FILTER PERSISTENCE STRATEGY
 * - Index pages (Jobs, Candidates): URL params for shareability and bookmarking
 * - Embedded tables (Dashboard widgets): Local state for session-scoped, ephemeral filtering
 * - Rule: If users might share or bookmark the view, use URL params
 *
 * URL VS LOCAL STATE
 * - URL state: search, sort, order, page, filters (status, department, etc.)
 * - Local state: row selection, expanded rows, column visibility
 * - URL changes use router.replace for filters, router.push for pagination
 * - Reset page to 1 when filters change (except explicit page navigation)
 *
 * SEARCH
 * - Placement: Left-aligned in FilterBar, before other filters
 * - Width: w-60 to w-72 depending on content type
 * - Debounce: 300ms (handled by SearchInput component)
 * - Clear: X button and Escape key
 * - Placeholder: "Search {resource}..." or "Search by {field}..."
 *
 * SORT AFFORDANCES
 * - Interactive columns: Ghost button with sort icon
 * - Icon states: ArrowUpDown (none) → ArrowUp (asc) → ArrowDown (desc)
 * - Click behavior: Toggle asc/desc, or switch field and use sensible default
 * - Default order: desc for dates/timestamps, asc for names/titles
 * - Accessibility: aria-sort attribute on sortable headers
 *
 * PAGINATION
 * - Language: "Showing {start}-{end} of {total} {resource}"
 * - Controls: Previous / "Page X of Y" / Next
 * - Position: Bottom of table, flex justify-between
 * - Page size: 20 items (consistent default)
 * - Hide pagination when totalPages <= 1
 *
 * EMPTY STATE
 * - Component: EmptyState with icon, title, description
 * - With filters: "No {resource} found. Try adjusting your filters."
 * - Without filters: "{Resource} will appear here once added." + action button
 *
 * LOADING STATE
 * - Full table loading: TableSkeleton component
 * - Inline loading: Skeleton rows with animate-pulse
 * - Row count: Match page size (typically 8 or pageSize)
 *
 * ERROR STATE
 * - Component: ErrorState with message and retry action
 * - Message: Display error.message from API
 * - Action: Retry button calling refetch()
 *
 * ROW INTERACTIONS
 * - Primary click: Link on primary column (title/name) to detail page
 * - Link style: font-medium hover:underline
 * - Row actions: Optional last column with DropdownMenu
 * - Selection: Optional checkbox column (leftmost)
 *
 * RESPONSIVE DESIGN
 * - Column visibility via meta.headerClassName / meta.cellClassName
 * - Breakpoints: hidden md:table-cell, hidden lg:table-cell, hidden xl:table-cell
 * - Mobile: Show essential columns (primary field, key status)
 * - Secondary info on mobile: Inline in primary cell as text-xs text-muted-foreground
 *
 * STATUS DISPLAY
 * - Use StatusBadge variants per context:
 *   - JobStatusBadge: badge variant (default)
 *   - PipelineHealthBadge: badge with icons (showIcon=true)
 *   - JobPriorityBadge: dot variant
 *   - ApplicationStageBadge: pill variant
 * - Size: sm for table cells
 *
 * DATE FORMATTING
 * - Display: toLocaleDateString() for user's locale
 * - Missing values: Display "-"
 * - Invalid values: Display "-"
 */

import { useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Constants
export const DEFAULT_PAGE_SIZE = 20
export const SEARCH_DEBOUNCE_MS = 300

// Type definitions
export type SortOrder = 'asc' | 'desc'

export interface ListState<TSortField extends string = string> {
  search: string
  sort: TSortField
  order: SortOrder
  page: number
  filters: Record<string, string | string[] | undefined>
}

export interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
  startIndex: number
  endIndex: number
}

/**
 * Hook for URL-based list state management.
 * Use this for main index pages (Jobs, Candidates) where URLs should be shareable.
 */
export function useUrlListState<TSortField extends string>(config: {
  basePath: string
  defaultSort: TSortField
  defaultOrder?: SortOrder
  filterKeys?: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { basePath, defaultSort, defaultOrder = 'desc', filterKeys = [] } = config

  // Parse current state from URL
  const state = useMemo(() => {
    const search = searchParams.get('search') ?? ''
    const sort = (searchParams.get('sort') ?? defaultSort) as TSortField
    const order = (searchParams.get('order') ?? defaultOrder) as SortOrder
    const parsedPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

    const filters: Record<string, string | undefined> = {}
    for (const key of filterKeys) {
      filters[key] = searchParams.get(key) ?? undefined
    }

    return { search, sort, order, page, filters }
  }, [searchParams, defaultSort, defaultOrder, filterKeys])

  // Update URL params
  const updateParams = useCallback(
    (updates: Record<string, string | null>, options?: { resetPage?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString())

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }

      // Reset to page 1 when filters change (unless explicitly setting page)
      if (options?.resetPage !== false && !('page' in updates)) {
        params.delete('page')
      }

      const nextUrl = `${basePath}?${params.toString()}`

      // Use push for pagination (back button works), replace for filters
      if ('page' in updates) {
        router.push(nextUrl)
      } else {
        router.replace(nextUrl)
      }
    },
    [router, searchParams, basePath]
  )

  // Convenience methods
  const setSearch = useCallback(
    (value: string) => updateParams({ search: value }),
    [updateParams]
  )

  const setSort = useCallback(
    (field: TSortField, newOrder?: SortOrder) => {
      if (state.sort === field && !newOrder) {
        // Toggle order
        updateParams({ order: state.order === 'asc' ? 'desc' : 'asc' })
      } else {
        // New field or explicit order
        const orderToUse = newOrder ?? defaultOrder
        updateParams({ sort: field, order: orderToUse })
      }
    },
    [state.sort, state.order, updateParams, defaultOrder]
  )

  const setPage = useCallback(
    (page: number) => updateParams({ page: String(page) }, { resetPage: false }),
    [updateParams]
  )

  const setFilter = useCallback(
    (key: string, value: string | null) => updateParams({ [key]: value }),
    [updateParams]
  )

  const clearFilters = useCallback(
    () => router.push(basePath),
    [router, basePath]
  )

  const hasFilters = useMemo(() => {
    return (
      state.search.trim().length > 0 ||
      Object.values(state.filters).some((v) => v && v.length > 0)
    )
  }, [state.search, state.filters])

  return {
    ...state,
    hasFilters,
    setSearch,
    setSort,
    setPage,
    setFilter,
    clearFilters,
    updateParams,
  }
}

/**
 * Calculate pagination display info.
 */
export function getPaginationInfo(
  page: number,
  pageSize: number,
  total: number
): PaginationInfo {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const startIndex = (page - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, total)

  return {
    page,
    pageSize,
    total,
    totalPages,
    startIndex,
    endIndex,
  }
}

/**
 * Format date for table display.
 * Returns "-" for null/undefined/invalid dates.
 */
export function formatTableDate(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

/**
 * Get aria-sort attribute value for a column.
 */
export function getAriaSort(
  currentSort: string,
  currentOrder: SortOrder,
  columnField: string
): 'ascending' | 'descending' | 'none' {
  if (currentSort !== columnField) return 'none'
  return currentOrder === 'asc' ? 'ascending' : 'descending'
}

/**
 * Get default sort order for a field type.
 * - Dates/timestamps: desc (most recent first)
 * - Names/titles: asc (alphabetical)
 */
export function getDefaultSortOrder(field: string): SortOrder {
  const descFields = [
    'createdAt',
    'updatedAt',
    'openedAt',
    'closedAt',
    'date',
    'timestamp',
  ]
  return descFields.some((df) => field.toLowerCase().includes(df.toLowerCase()))
    ? 'desc'
    : 'asc'
}
