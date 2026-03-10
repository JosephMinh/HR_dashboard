import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/layout'
import { PageHeader } from '@/components/ui/page-header'
import { canMutate } from '@/lib/permissions'
import { JobForm } from '../job-form'

export default async function NewJobPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }
  if (!canMutate(session.user.role)) {
    redirect('/jobs')
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
          title="Create New Job"
          description="Define role basics, ownership, and pipeline signals for the new opening."
        />
        <JobForm mode="create" />
      </div>
    </AppShell>
  )
}
