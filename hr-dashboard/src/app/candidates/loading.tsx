import { AppShell } from '@/components/layout'
import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton } from '@/components/ui/loading-skeleton'

export default function CandidatesLoading() {
  return (
    <AppShell>
      <div className="space-y-6">
        {/* PageHeader */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-9 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-36" />
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
