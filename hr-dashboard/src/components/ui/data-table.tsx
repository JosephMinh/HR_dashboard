'use client'

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type OnChangeFn,
  type RowSelectionState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  // Sorting (controlled)
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  // Pagination (controlled)
  pagination?: PaginationState
  onPaginationChange?: OnChangeFn<PaginationState>
  pageCount?: number
  // Row selection (optional)
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  // Display options
  isLoading?: boolean
  isFetching?: boolean
  emptyMessage?: string
  // Total count for pagination info
  totalCount?: number
  entityLabel?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
  pageCount,
  rowSelection,
  onRowSelectionChange,
  isLoading = false,
  isFetching = false,
  emptyMessage = 'No results.',
  totalCount,
  entityLabel = 'results',
}: DataTableProps<TData, TValue>) {
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table hook returns non-memoizable functions; React Compiler warning is expected here.
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // Controlled sorting
    manualSorting: true,
    state: {
      sorting: sorting ?? [],
      pagination: pagination ?? { pageIndex: 0, pageSize: 20 },
      rowSelection: rowSelection ?? {},
    },
    onSortingChange,
    // Controlled pagination
    manualPagination: true,
    pageCount: pageCount ?? -1,
    onPaginationChange,
    // Row selection
    enableRowSelection: !!onRowSelectionChange,
    onRowSelectionChange,
  })

  const { pageIndex, pageSize } = table.getState().pagination
  const startRow = pageIndex * pageSize + 1
  const endRow = Math.min((pageIndex + 1) * pageSize, totalCount ?? data.length)

  return (
    <div className="space-y-4">
      <div className={cn(
        "overflow-auto rounded-lg border shadow-premium-sm transition-opacity duration-150",
        isFetching && !isLoading && "opacity-60"
      )}>
        <Table className="min-w-[900px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  const headerLabel =
                    typeof header.column.columnDef.header === 'string'
                      ? header.column.columnDef.header
                      : header.column.id

                  return (
                    <TableHead
                      key={header.id}
                      className={header.column.columnDef.meta?.headerClassName}
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-3"
                          onClick={() => header.column.toggleSorting()}
                          aria-label={
                            sorted === 'asc'
                              ? `Sorted by ${headerLabel}, ascending. Activate to sort descending.`
                              : sorted === 'desc'
                                ? `Sorted by ${headerLabel}, descending. Activate to clear sorting.`
                                : `Sort by ${headerLabel}`
                          }
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {sorted === 'asc' ? (
                            <ArrowUp className="ml-1 h-3 w-3" aria-hidden="true" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="ml-1 h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="ml-1 h-3 w-3" aria-hidden="true" />
                          )}
                        </Button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton rows
              Array.from({ length: pageSize }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  {columns.map((_, colIndex) => (
                    <TableCell key={`skeleton-cell-${colIndex}`}>
                      <div className="h-4 w-full rounded bg-muted motion-safe:animate-pulse motion-reduce:animate-none" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cell.column.columnDef.meta?.cellClassName}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && pageCount && pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {startRow}-{endRow} of {totalCount ?? 'many'} {entityLabel}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </Button>
            <span className="min-w-20 text-center text-xs text-muted-foreground">
              <span className="hidden sm:inline">Page </span>
              {pageIndex + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Column helper for type-safe column definitions
export { createColumnHelper } from '@tanstack/react-table'

// Re-export types for convenience
export type { ColumnDef, SortingState, PaginationState, RowSelectionState }

// Extend column meta for custom styling
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    headerClassName?: string
    cellClassName?: string
  }
}
