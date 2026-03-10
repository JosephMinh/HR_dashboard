import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { JobStatusBadge, PipelineHealthBadge, JobPriorityBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { AlertTriangle, Calendar, MapPin, User, Users, Pencil } from 'lucide-react'
import { ApplicationStage } from '@/generated/prisma/client'
import { AddCandidateDialog } from './add-candidate-dialog'
import { CandidatesPipeline } from './candidates-pipeline'
import { canMutate } from '@/lib/permissions'

interface PageParams {
  params: Promise<{ jobId: string }>
}

const INACTIVE_STAGES: ApplicationStage[] = [
  ApplicationStage.REJECTED,
  ApplicationStage.WITHDRAWN,
]

export default async function JobDetailPage({ params }: PageParams) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const { jobId } = await params

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
        <div className="flex items-center gap-2">
          {job.isCritical && <AlertTriangle className="h-5 w-5 text-red-500" />}
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{job.department}</p>
          </div>
          {userCanMutate && (
            <AddCandidateDialog jobId={jobId} existingCandidateIds={existingCandidateIds} />
          )}
          {userCanMutate ? (
            <Link href={`/jobs/${jobId}/edit`} className={buttonVariants({ variant: 'outline' })}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Link>
          ) : null}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                <p className="text-sm whitespace-pre-wrap">{job.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {job.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {job.location}
                  </div>
                )}
                {job.targetFillDate && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Target: {new Date(job.targetFillDate).toLocaleDateString()}
                  </div>
                )}
                {job.hiringManager && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Hiring: {job.hiringManager}
                  </div>
                )}
                {job.recruiterOwner && (
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Recruiter: {job.recruiterOwner}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <JobStatusBadge value={job.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Priority</span>
                <JobPriorityBadge value={job.priority} />
              </div>
              {job.pipelineHealth && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Pipeline</span>
                  <PipelineHealthBadge value={job.pipelineHealth} />
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Candidates</span>
                <span className="font-medium">{activeApplications.length}</span>
              </div>
              {job.openedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Opened</span>
                  <span className="text-sm">{new Date(job.openedAt).toLocaleDateString()}</span>
                </div>
              )}
              {job.closedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Closed</span>
                  <span className="text-sm">{new Date(job.closedAt).toLocaleDateString()}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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
                userCanMutate={userCanMutate}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
