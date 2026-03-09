import { AppShell } from '@/components/layout'
import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton } from '@/components/ui/loading-skeleton'

export default function JobsLoading() {
  return (
    <AppShell>
      <div className="space-y-6">
        {/* PageHeader */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-9 w-24 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Filter bar */}
        <div className="flex gap-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Table */}
        <TableSkeleton rows={8} columns={7} />
      </div>
    </AppShell>
  )
}
