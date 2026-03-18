import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { JobStatusBadge, ApplicationStageBadge } from '@/components/ui/status-badge'
import { CANDIDATE_SOURCE } from '@/lib/status-config'
import { canMutate } from '@/lib/permissions'
import {
  Mail,
  Phone,
  Linkedin,
  Building,
  MapPin,
  Pencil,
  Briefcase,
  ExternalLink,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { ResumeCard } from './resume-card'
import { cn } from '@/lib/utils'

// Helper: format relative time with recency indicator
function formatRelativeTime(date: Date): { text: string; isRecent: boolean } {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return { text: 'just now', isRecent: true }
  if (diffMins < 60) return { text: `${diffMins}m ago`, isRecent: true }
  if (diffHours < 24) return { text: `${diffHours}h ago`, isRecent: diffHours < 4 }
  if (diffDays === 1) return { text: 'yesterday', isRecent: false }
  if (diffDays < 7) return { text: `${diffDays}d ago`, isRecent: false }
  if (diffDays < 30) return { text: `${Math.floor(diffDays / 7)}w ago`, isRecent: false }
  return { text: date.toLocaleDateString(), isRecent: false }
}

interface PageParams {
  params: Promise<{ candidateId: string }>
}

export default async function CandidateDetailPage({ params }: PageParams) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const { candidateId } = await params

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      applications: {
        include: {
          job: true,
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
  })

  if (!candidate) {
    return notFound()
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
        {/* Hero Section - Premium candidate identity and quick actions */}
        <div className="rounded-xl bg-card shadow-premium-sm ring-1 ring-border p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            {/* Identity Block */}
            <div className="flex items-start gap-4">
              {/* Avatar/Initials */}
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary text-xl font-semibold">
                {candidate.firstName[0]}{candidate.lastName[0]}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {candidate.firstName} {candidate.lastName}
                </h1>
                {(candidate.currentCompany || candidate.location) && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {candidate.currentCompany && (
                      <span className="flex items-center gap-1.5">
                        <Building className="h-3.5 w-3.5" />
                        {candidate.currentCompany}
                      </span>
                    )}
                    {candidate.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {candidate.location}
                      </span>
                    )}
                  </div>
                )}
                {/* Source badge */}
                {candidate.source && (
                  <div className="mt-2">
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {CANDIDATE_SOURCE[candidate.source]?.label ?? candidate.source}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Primary Actions */}
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              {userCanMutate && (
                <Link href={`/candidates/${candidateId}/edit`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  <Pencil className="h-4 w-4 mr-1.5" />
                  Edit
                </Link>
              )}
            </div>
          </div>

          {/* Contact Quick Actions - Primary contact methods inline */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/50 pt-5">
            {candidate.email && (
              <a
                href={`mailto:${candidate.email}`}
                className="inline-flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Mail className="h-4 w-4 text-muted-foreground" />
                {candidate.email}
              </a>
            )}
            {candidate.phone && (
              <a
                href={`tel:${candidate.phone}`}
                className="inline-flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Phone className="h-4 w-4 text-muted-foreground" />
                {candidate.phone}
              </a>
            )}
            {candidate.linkedinUrl && (
              <a
                href={candidate.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Linkedin className="h-4 w-4 text-muted-foreground" />
                LinkedIn
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main content area */}
          <div className="space-y-6 lg:col-span-2">
            {/* Notes Card */}
            {candidate.notes && (
              <Card className="shadow-premium-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{candidate.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Supporting Sidebar - Candidate dossier modules */}
          <aside className="space-y-6">
            {/* Section header for sidebar context */}
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>Candidate Dossier</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            {/* Documents - Primary artifact */}
            <div className="space-y-2">
              <ResumeCard
                candidateId={candidateId}
                resumeKey={candidate.resumeKey}
                resumeName={candidate.resumeName}
                userCanMutate={userCanMutate}
              />
              {/* Future: Additional document types could go here */}
            </div>

            {/* Activity Summary Card */}
            <Card className="border-border/50 shadow-lg shadow-black/5 dark:shadow-black/20">
              <CardHeader className="border-b border-border/50 bg-muted/30 pb-3">
                <CardTitle className="text-base font-semibold">Activity</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Applications</span>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold tabular-nums text-primary">
                      {candidate.applications.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/50 pt-3">
                    <span className="text-sm text-muted-foreground">Added</span>
                    <span className="text-sm tabular-nums text-foreground">{new Date(candidate.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Last Updated</span>
                    <span className="text-sm tabular-nums text-foreground">{new Date(candidate.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>

        {/* Application History - Recruiter Activity Context */}
        <Card className="shadow-premium-sm overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/30 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                Pipeline Activity
              </CardTitle>
              {candidate.applications.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary tabular-nums">
                  {candidate.applications.length} {candidate.applications.length === 1 ? 'job' : 'jobs'}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {candidate.applications.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border">
                  <Briefcase className="h-7 w-7 text-muted-foreground/60" />
                </div>
                <h3 className="font-medium text-foreground">No applications yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This candidate has not been added to any job pipelines
                </p>
                {userCanMutate && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Add this candidate to a job from the job detail page
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {candidate.applications.map((app) => {
                  const { text: relativeTime, isRecent } = formatRelativeTime(new Date(app.stageUpdatedAt))
                  const isActiveJob = app.job.status !== 'HIRED' && app.job.status !== 'HIRED_CW'

                  return (
                    <div
                      key={app.id}
                      className={cn(
                        'group px-6 py-4 transition-colors hover:bg-muted/30',
                        isRecent && 'bg-primary/[0.02]'
                      )}
                    >
                      {/* Top row: Job title and stage */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/jobs/${app.job.id}`}
                              className="font-semibold text-foreground hover:text-primary hover:underline transition-colors truncate"
                            >
                              {app.job.title}
                            </Link>
                            {!isActiveJob && (
                              <JobStatusBadge value={app.job.status} size="sm" />
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {app.job.department}
                            {app.job.location && (
                              <span className="text-border"> · </span>
                            )}
                            {app.job.location}
                          </p>
                        </div>

                        {/* Stage badge - emphasized */}
                        <div className="shrink-0">
                          <ApplicationStageBadge value={app.stage} size="md" showIcon />
                        </div>
                      </div>

                      {/* Bottom row: Activity timestamp */}
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        {isRecent && (
                          <Sparkles className="h-3 w-3 text-primary" />
                        )}
                        <Clock className="h-3 w-3 text-muted-foreground/60" />
                        <span
                          className={cn(
                            'tabular-nums',
                            isRecent ? 'font-medium text-foreground' : 'text-muted-foreground'
                          )}
                          title={new Date(app.stageUpdatedAt).toLocaleString()}
                        >
                          Stage updated {relativeTime}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground/40 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
