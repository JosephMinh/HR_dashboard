import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/layout'
import { PageHeader } from '@/components/ui/page-header'
import { TableSkeleton } from '@/components/ui/loading-skeleton'
import { HeadcountTable } from './headcount-table'

export default async function HeadcountPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <AppShell
      user={{
        name: session.user.name || 'User',
        email: session.user.email || '',
        role: session.user.role,
      }}
    >
      <div className="space-y-6">
        <PageHeader
          title="Headcount Projections"
          description="FP&A approved budget headcount by department and month"
        />

        <Suspense fallback={<TableSkeleton rows={10} columns={7} />}>
          <HeadcountTable />
        </Suspense>
      </div>
    </AppShell>
  )
}
