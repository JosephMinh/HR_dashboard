import { AppShell } from '@/components/layout'
import { Skeleton } from '@/components/ui/skeleton'
import { FormSkeleton } from '@/components/ui/loading-skeleton'

export default function EditJobLoading() {
  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        <div>
          <Skeleton className="h-9 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <FormSkeleton fields={6} />
      </div>
    </AppShell>
  )
}
