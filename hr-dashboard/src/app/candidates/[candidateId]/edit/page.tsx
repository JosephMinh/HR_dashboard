import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout'
import { PageHeader } from '@/components/ui/page-header'
import { canMutate } from '@/lib/permissions'
import { CandidateForm } from '../../candidate-form'

interface PageParams {
  params: Promise<{ candidateId: string }>
}

export default async function EditCandidatePage({ params }: PageParams) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }
  if (!canMutate(session.user.role)) {
    redirect('/candidates')
  }

  const { candidateId } = await params

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
  })

  if (!candidate) {
    return notFound()
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
          title="Edit Candidate"
          description={`${candidate.firstName} ${candidate.lastName}`}
        />
        <CandidateForm
          mode="edit"
          candidateId={candidate.id}
          initialData={{
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            email: candidate.email || '',
            phone: candidate.phone || '',
            linkedinUrl: candidate.linkedinUrl || '',
            currentCompany: candidate.currentCompany || '',
            location: candidate.location || '',
            source: candidate.source || '',
            notes: candidate.notes || '',
            resumeKey: candidate.resumeKey,
            resumeName: candidate.resumeName,
          }}
        />
      </div>
    </AppShell>
  )
}
