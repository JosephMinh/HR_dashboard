import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getDashboardStats } from '@/lib/dashboard'
import { canMutate } from '@/lib/permissions'
import { AppShell } from '@/components/layout'
import { Card, CardContent } from '@/components/ui/card'
import { PipelineSummary } from '@/components/ui/pipeline-summary'
import { TableSkeleton } from '@/components/ui/loading-skeleton'
import { AttentionQueue } from '@/components/dashboard/attention-queue'
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

        {/* KPI Cards - Premium treatment with urgency hierarchy */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Open Jobs - Primary metric */}
          <Link href="/jobs?status=OPEN" className="group block">
            <Card className="shadow-premium-sm transition-all duration-150 group-hover:shadow-premium-md group-hover:ring-1 group-hover:ring-primary/20 group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Open Jobs</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.jobsOpen}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <span>Active positions</span>
                      <span className="opacity-0 transition-opacity group-hover:opacity-100">→</span>
                    </p>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-2.5 transition-transform group-hover:scale-105">
                    <Briefcase className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Active Candidates - Secondary metric */}
          <Link href="/candidates" className="group block">
            <Card className="shadow-premium-sm transition-all duration-150 group-hover:shadow-premium-md group-hover:ring-1 group-hover:ring-primary/20 group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Active Candidates</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.activeCandidates}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <span>In open pipelines</span>
                      <span className="opacity-0 transition-opacity group-hover:opacity-100">→</span>
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted p-2.5 transition-transform group-hover:scale-105">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Critical Jobs - Alert metric with urgency styling */}
          <Link href="/jobs?critical=true" className="group block">
            <Card className={`shadow-premium-sm transition-all duration-150 group-hover:shadow-premium-md group-focus-visible:ring-2 group-focus-visible:ring-ring ${stats.activeCriticalJobs > 0 ? 'ring-1 ring-destructive/30 bg-destructive/5 group-hover:ring-destructive/50' : 'group-hover:ring-1 group-hover:ring-primary/20'}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`text-sm font-medium ${stats.activeCriticalJobs > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      Critical Jobs
                    </p>
                    <p className={`mt-2 text-3xl font-bold tracking-tight tabular-nums ${stats.activeCriticalJobs > 0 ? 'text-destructive' : ''}`}>
                      {stats.activeCriticalJobs}
                    </p>
                    <p className={`mt-1 flex items-center gap-1 text-xs ${stats.activeCriticalJobs > 0 ? 'text-destructive/70' : 'text-muted-foreground'}`}>
                      <span>{stats.activeCriticalJobs > 0 ? 'Need attention' : 'All on track'}</span>
                      <span className="opacity-0 transition-opacity group-hover:opacity-100">→</span>
                    </p>
                  </div>
                  <div className={`rounded-lg p-2.5 transition-transform group-hover:scale-105 ${stats.activeCriticalJobs > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                    <AlertTriangle className={`h-5 w-5 ${stats.activeCriticalJobs > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Closed Jobs - Success metric */}
          <Link href="/jobs?status=CLOSED" className="group block">
            <Card className="shadow-premium-sm transition-all duration-150 group-hover:shadow-premium-md group-hover:ring-1 group-hover:ring-primary/20 group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Closed Jobs</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.jobsClosed}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <span>Successfully filled</span>
                      <span className="opacity-0 transition-opacity group-hover:opacity-100">→</span>
                    </p>
                  </div>
                  <div className="rounded-lg bg-status-ahead/10 p-2.5 transition-transform group-hover:scale-105">
                    <TrendingUp className="h-5 w-5 text-status-ahead" />
                  </div>
                </div>
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
            className="shadow-premium-sm"
          />

          <AttentionQueue criticalJobs={stats.criticalJobs} />
        </div>

        <Suspense fallback={<TableSkeleton rows={5} columns={8} />}>
          <DashboardJobsTable userCanMutate={canMutate(session.user.role)} />
        </Suspense>
      </div>
    </AppShell>
  )
}
