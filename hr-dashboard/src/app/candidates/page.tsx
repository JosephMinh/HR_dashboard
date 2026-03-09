import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'

import { AppShell } from '@/components/layout'
import { buttonVariants } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/loading-skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { auth } from '@/lib/auth'
import { canMutate } from '@/lib/permissions'

import { CandidatesTable } from './candidates-table'

export default async function CandidatesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const showCreateAction = canMutate(session.user.role)

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
          title="Candidates"
          description="Search and manage people in the recruiting pipeline"
        >
          {showCreateAction ? (
            <Link href="/candidates/new" className={buttonVariants()}>
              <Plus className="mr-2 h-4 w-4" />
              New Candidate
            </Link>
          ) : null}
        </PageHeader>

        <Suspense fallback={<TableSkeleton rows={8} columns={7} />}>
          <CandidatesTable />
        </Suspense>
      </div>
    </AppShell>
  )
}
