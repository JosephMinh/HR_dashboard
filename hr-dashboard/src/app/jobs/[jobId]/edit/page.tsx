import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout'
import { PageHeader } from '@/components/ui/page-header'
import { canMutate } from '@/lib/permissions'
import { JobForm } from '../../job-form'

interface PageParams {
  params: Promise<{ jobId: string }>
}

export default async function EditJobPage({ params }: PageParams) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }
  if (!canMutate(session.user.role)) {
    redirect('/jobs')
  }

  const { jobId } = await params

  const job = await prisma.job.findUnique({
    where: { id: jobId },
  })

  if (!job) {
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
          title="Edit Job"
          description={`Update ${job.title} details, ownership, and pipeline signals.`}
        />
        <JobForm
          mode="edit"
          jobId={job.id}
          initialData={{
            title: job.title,
            department: job.department,
            description: job.description,
            location: job.location || '',
            hiringManager: job.hiringManager || '',
            recruiterOwner: job.recruiterOwner || '',
            status: job.status,
            priority: job.priority,
            pipelineHealth: job.pipelineHealth || '',
            isCritical: job.isCritical,
            targetFillDate: job.targetFillDate?.toISOString().split('T')[0] || '',
          }}
        />
      </div>
    </AppShell>
  )
}
