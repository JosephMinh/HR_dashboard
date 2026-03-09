import { AppShell } from '@/components/layout'
import { Skeleton } from '@/components/ui/skeleton'
import { FormSkeleton } from '@/components/ui/loading-skeleton'

export default function EditCandidateLoading() {
  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        <div>
          <Skeleton className="h-9 w-40 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <FormSkeleton fields={8} />
      </div>
    </AppShell>
  )
}
