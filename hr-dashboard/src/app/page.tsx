import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getDashboardStats } from '@/lib/dashboard'
import { canMutate } from '@/lib/permissions'
import { AppShell } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PipelineSummary } from '@/components/ui/pipeline-summary'
import { PipelineHealthBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { TableSkeleton } from '@/components/ui/loading-skeleton'
import { DashboardJobsTable } from './dashboard-jobs-table'
import { Briefcase, Users, AlertTriangle, TrendingUp } from 'lucide-react'

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const stats = await getDashboardStats()

  return (
    <AppShell
      user={{
        name: session.user.name || 'User',
        email: session.user.email || '',
        role: session.user.role,
      }}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your recruiting pipeline
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link href="/jobs?status=OPEN" className="block">
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Jobs</CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.jobsOpen}</div>
                <p className="text-xs text-muted-foreground">
                  Active job postings
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/candidates" className="block">
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Candidates</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeCandidates}</div>
                <p className="text-xs text-muted-foreground">
                  In open job pipelines
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/jobs?critical=true" className="block">
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Critical Jobs</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeCriticalJobs}</div>
                <p className="text-xs text-muted-foreground">
                  Require immediate attention
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/jobs?status=CLOSED" className="block">
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Closed Jobs</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.jobsClosed}</div>
                <p className="text-xs text-muted-foreground">
                  Successfully filled
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <PipelineSummary
            ahead={stats.pipelineHealth.ahead}
            onTrack={stats.pipelineHealth.onTrack}
            behind={stats.pipelineHealth.behind}
            showBar
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Critical Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.criticalJobs.length === 0 ? (
                <EmptyState
                  icon={AlertTriangle}
                  title="No critical jobs"
                  description="All jobs are on track"
                  className="py-6"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Pipeline</TableHead>
                      <TableHead className="text-right">Candidates</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.criticalJobs.slice(0, 5).map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <Link
                            href={`/jobs/${job.id}`}
                            className="font-medium hover:underline"
                          >
                            {job.title}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {job.department}
                          </div>
                        </TableCell>
                        <TableCell>
                          {job.pipelineHealth ? (
                            <PipelineHealthBadge value={job.pipelineHealth} size="sm" />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {job.activeCandidateCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Suspense fallback={<TableSkeleton rows={5} columns={8} />}>
          <DashboardJobsTable userCanMutate={canMutate(session.user.role)} />
        </Suspense>
      </div>
    </AppShell>
  )
}
