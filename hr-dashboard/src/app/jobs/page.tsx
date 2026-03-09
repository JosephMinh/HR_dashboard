import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/layout'
import { PageHeader } from '@/components/ui/page-header'
import { buttonVariants } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/loading-skeleton'
import { Plus } from 'lucide-react'
import { JobsTable } from './jobs-table'

export default async function JobsPage() {
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
        <PageHeader title="Jobs" description="Manage open positions and track hiring progress">
          <Link href="/jobs/new" className={buttonVariants()}>
            <Plus className="h-4 w-4 mr-2" />
            New Job
          </Link>
        </PageHeader>

        <Suspense fallback={<TableSkeleton rows={8} columns={7} />}>
          <JobsTable />
        </Suspense>
      </div>
    </AppShell>
  )
}
