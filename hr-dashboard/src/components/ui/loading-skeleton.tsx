import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

interface CardSkeletonProps {
  className?: string
}

export function CardSkeleton({ className }: CardSkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-xl bg-card p-6 ring-1 ring-border/60 shadow-premium-sm space-y-3',
        className
      )}
    >
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-8 w-1/3 mt-4" />
    </div>
  )
}

interface TableRowSkeletonProps {
  columns?: number
  className?: string
}

export function TableRowSkeleton({ columns = 4, className }: TableRowSkeletonProps) {
  return (
    <tr className={cn('border-b border-border/60', className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

interface TableSkeletonProps {
  rows?: number
  columns?: number
  className?: string
}

export function TableSkeleton({ rows = 5, columns = 4, className }: TableSkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-xl bg-card ring-1 ring-border/60 shadow-premium-sm overflow-hidden',
        className
      )}
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-3 py-3 text-left">
                <Skeleton className="h-4 w-24" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface TextBlockSkeletonProps {
  lines?: number
  className?: string
}

const TEXT_LINE_WIDTHS = ['w-full', 'w-5/6', 'w-2/3', 'w-3/4'] as const

export function TextBlockSkeleton({ lines = 3, className }: TextBlockSkeletonProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', TEXT_LINE_WIDTHS[i % TEXT_LINE_WIDTHS.length])}
        />
      ))}
    </div>
  )
}

interface FormSkeletonProps {
  fields?: number
  className?: string
}

export function FormSkeleton({ fields = 4, className }: FormSkeletonProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-32" />
    </div>
  )
}
