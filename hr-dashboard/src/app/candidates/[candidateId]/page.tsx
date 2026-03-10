import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { JobStatusBadge, ApplicationStageBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { CANDIDATE_SOURCE } from '@/lib/status-config'
import { canMutate } from '@/lib/permissions'
import { Mail, Phone, Linkedin, Building, MapPin, Pencil, Briefcase, ExternalLink } from 'lucide-react'
import { ResumeCard } from './resume-card'

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
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {candidate.firstName} {candidate.lastName}
            </h1>
            {candidate.currentCompany && (
              <p className="text-sm text-muted-foreground mt-1">{candidate.currentCompany}</p>
            )}
          </div>
          {userCanMutate ? (
            <Link href={`/candidates/${candidateId}/edit`} className={buttonVariants({ variant: 'outline' })}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Link>
          ) : null}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {candidate.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${candidate.email}`} className="hover:underline">
                      {candidate.email}
                    </a>
                  </div>
                )}
                {candidate.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${candidate.phone}`} className="hover:underline">
                      {candidate.phone}
                    </a>
                  </div>
                )}
                {candidate.linkedinUrl && (
                  <div className="flex items-center gap-2 text-sm">
                    <Linkedin className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={candidate.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex items-center gap-1"
                    >
                      LinkedIn
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {candidate.currentCompany && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    {candidate.currentCompany}
                  </div>
                )}
                {candidate.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {candidate.location}
                  </div>
                )}
              </div>

              {candidate.notes && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Notes</h4>
                  <p className="text-sm whitespace-pre-wrap">{candidate.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Source</span>
                  <span className="text-sm">
                    {candidate.source ? (CANDIDATE_SOURCE[candidate.source]?.label ?? candidate.source) : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Applications</span>
                  <span className="font-medium">{candidate.applications.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Added</span>
                  <span className="text-sm">{new Date(candidate.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Last Updated</span>
                  <span className="text-sm">{new Date(candidate.updatedAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>

            <ResumeCard
              candidateId={candidateId}
              resumeKey={candidate.resumeKey}
              resumeName={candidate.resumeName}
              userCanMutate={userCanMutate}
            />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Applications ({candidate.applications.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {candidate.applications.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No applications yet"
                description="This candidate hasn't been added to any jobs"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Job Status</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidate.applications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell>
                        <Link
                          href={`/jobs/${app.job.id}`}
                          className="font-medium hover:underline"
                        >
                          {app.job.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {app.job.department}
                      </TableCell>
                      <TableCell>
                        <JobStatusBadge value={app.job.status} size="sm" />
                      </TableCell>
                      <TableCell>
                        <ApplicationStageBadge value={app.stage} size="sm" />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(app.stageUpdatedAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
