import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/layout'
import { PageHeader } from '@/components/ui/page-header'
import { canMutate } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { CandidateForm } from '../candidate-form'

interface NewCandidatePageProps {
  searchParams: Promise<{ jobId?: string }>
}

export default async function NewCandidatePage({ searchParams }: NewCandidatePageProps) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }
  if (!canMutate(session.user.role)) {
    redirect('/candidates')
  }

  const { jobId } = await searchParams
  const normalizedJobId = jobId?.trim() || null
  const linkedJob = normalizedJobId
    ? await prisma.job.findUnique({
        where: { id: normalizedJobId },
        select: { id: true, title: true },
      })
    : null

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
          description={
            linkedJob
              ? `Create a new candidate and add them to ${linkedJob.title}`
              : 'Add a new candidate to your pipeline'
          }
        />
        <CandidateForm mode="create" linkedJobId={linkedJob?.id} />
      </div>
    </AppShell>
  )
}
