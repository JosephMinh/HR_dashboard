import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/layout'
import { PageHeader } from '@/components/ui/page-header'
import { buttonVariants } from '@/components/ui/button-variants'
import { TableSkeleton } from '@/components/ui/loading-skeleton'
import { Plus } from 'lucide-react'
import { canMutate } from '@/lib/permissions'
import { JobsTable } from './jobs-table'

export default async function JobsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const userCanMutate = canMutate(session.user.role)

  return (
    <AppShell
      user={{
        name: session.user.name || 'User',
        email: session.user.email || '',
        role: session.user.role,
      }}
    >
      <div className="space-y-6">
        <PageHeader title="Jobs" description="Manage open positions and track hiring progress">
          {userCanMutate ? (
            <Link href="/jobs/new" className={buttonVariants()}>
              <Plus className="h-4 w-4 mr-2" />
              New Job
            </Link>
          ) : null}
        </PageHeader>

        <Suspense fallback={<TableSkeleton rows={8} columns={7} />}>
          <JobsTable userCanMutate={userCanMutate} />
        </Suspense>
      </div>
    </AppShell>
  )
}
