import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/layout'
import { PageHeader } from '@/components/ui/page-header'
import { canMutate } from '@/lib/permissions'
import { CandidateForm } from '../candidate-form'

export default async function NewCandidatePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }
  if (!canMutate(session.user.role)) {
    redirect('/candidates')
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
          title="Add New Candidate"
          description="Add a new candidate to your pipeline"
        />
        <CandidateForm mode="create" />
      </div>
    </AppShell>
  )
}
