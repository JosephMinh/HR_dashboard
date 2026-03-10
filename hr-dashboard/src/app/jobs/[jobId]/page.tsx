import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Users } from 'lucide-react'
import { ApplicationStage } from '@/generated/prisma/client'
import { AddCandidateDialog } from './add-candidate-dialog'
import { CandidatesPipeline } from './candidates-pipeline'
import { JobHero } from './job-hero'
import { JobDetailsPanel } from './job-details-panel'
import { canMutate } from '@/lib/permissions'

interface PageParams {
  params: Promise<{ jobId: string }>
  searchParams?: Promise<{ candidateAdded?: string }>
}

const INACTIVE_STAGES: ApplicationStage[] = [
  ApplicationStage.REJECTED,
  ApplicationStage.WITHDRAWN,
]

export default async function JobDetailPage({ params, searchParams }: PageParams) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const { jobId } = await params
  const { candidateAdded } = searchParams ? await searchParams : { candidateAdded: undefined }
  const highlightCandidateId = candidateAdded?.trim() || null

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      applications: {
        include: {
          candidate: true,
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
  })

  if (!job) {
    return notFound()
  }

  const activeApplications = job.applications.filter(
    app => !INACTIVE_STAGES.includes(app.stage)
  )

  const existingCandidateIds = job.applications.map(app => app.candidateId)
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
        {/* Hero: Role identity, urgency, ownership, key dates, actions */}
        <JobHero
          job={{
            id: job.id,
            title: job.title,
            department: job.department,
            location: job.location,
            status: job.status,
            priority: job.priority,
            pipelineHealth: job.pipelineHealth,
            isCritical: job.isCritical,
            hiringManager: job.hiringManager,
            recruiterOwner: job.recruiterOwner,
            openedAt: job.openedAt,
            targetFillDate: job.targetFillDate,
          }}
          activeCount={activeApplications.length}
          userCanMutate={userCanMutate}
          actionSlot={
            userCanMutate ? (
              <AddCandidateDialog jobId={jobId} existingCandidateIds={existingCandidateIds} />
            ) : undefined
          }
        />

        {/* Role Details: Description + Context */}
        <JobDetailsPanel
          job={{
            description: job.description,
            department: job.department,
            location: job.location,
            openedAt: job.openedAt,
            closedAt: job.closedAt,
            targetFillDate: job.targetFillDate,
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle>Candidates ({job.applications.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {job.applications.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No candidates yet"
                description="Candidates will appear here once they apply to this job"
              />
            ) : (
              <CandidatesPipeline
                jobId={jobId}
                initialApplications={job.applications.map(app => ({
                  id: app.id,
                  stage: app.stage,
                  stageUpdatedAt: app.stageUpdatedAt.toISOString(),
                  candidate: {
                    id: app.candidate.id,
                    firstName: app.candidate.firstName,
                    lastName: app.candidate.lastName,
                    email: app.candidate.email,
                    currentCompany: app.candidate.currentCompany,
                  },
                }))}
                highlightCandidateId={highlightCandidateId ?? undefined}
                userCanMutate={userCanMutate}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
