'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  JobStatusBadge,
  PipelineHealthBadge,
  JobPriorityBadge,
} from '@/components/ui/status-badge'
import {
  Calendar,
  Clock,
  MapPin,
  Pencil,
  User,
  Users,
  Briefcase,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface JobHeroProps {
  job: {
    id: string
    title: string
    department: string
    location: string | null
    status: string
    priority: string
    pipelineHealth: string | null
    isCritical: boolean
    hiringManager: string | null
    recruiterOwner: string | null
    openedAt: Date | null
    targetFillDate: Date | null
  }
  activeCount: number
  userCanMutate: boolean
  actionSlot?: React.ReactNode // Slot for custom actions like AddCandidateDialog
}

function formatDate(date: Date | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getDaysUntil(date: Date | null): number | null {
  if (!date) return null
  const now = new Date()
  const target = new Date(date)
  const diffTime = target.getTime() - now.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function getDaysOpen(openedAt: Date | null): number {
  if (!openedAt) return 0
  const now = new Date()
  const opened = new Date(openedAt)
  const diffTime = now.getTime() - opened.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

export function JobHero({
  job,
  activeCount,
  userCanMutate,
  actionSlot,
}: JobHeroProps) {
  const daysUntilTarget = getDaysUntil(job.targetFillDate)
  const daysOpen = getDaysOpen(job.openedAt)
  const isOverdue = daysUntilTarget !== null && daysUntilTarget < 0
  const isUrgent = job.isCritical || isOverdue || (daysUntilTarget !== null && daysUntilTarget <= 7)

  return (
    <div
      className={cn(
        'rounded-xl border p-6',
        isUrgent
          ? 'border-red-200 bg-gradient-to-br from-red-50/80 to-background dark:border-red-900/50 dark:from-red-950/30'
          : 'border-border/70 bg-gradient-to-br from-card to-background'
      )}
    >
      {/* Top row: Title, Status, Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          {/* Critical indicator */}
          {job.isCritical && (
            <div className="flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400 mb-2">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
              Critical Role
            </div>
          )}

          {/* Title and department */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {job.title}
            </h1>
            <JobStatusBadge value={job.status} showIcon />
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            {job.department}
            {job.location && (
              <>
                <span className="text-border">·</span>
                <MapPin className="h-3.5 w-3.5" />
                {job.location}
              </>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {actionSlot}
          {userCanMutate && (
            <Link
              href={`/jobs/${job.id}/edit`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Link>
          )}
        </div>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-2 gap-4 mt-6 sm:grid-cols-4 lg:grid-cols-5">
        {/* Priority */}
        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Priority
          </span>
          <div>
            <JobPriorityBadge value={job.priority} variant="badge" showIcon />
          </div>
        </div>

        {/* Pipeline Health */}
        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pipeline
          </span>
          <div>
            {job.pipelineHealth ? (
              <PipelineHealthBadge value={job.pipelineHealth} showIcon />
            ) : (
              <span className="text-sm text-muted-foreground">-</span>
            )}
          </div>
        </div>

        {/* Active Candidates */}
        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Active
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-semibold tabular-nums">{activeCount}</span>
            <span className="text-sm text-muted-foreground">candidates</span>
          </div>
        </div>

        {/* Target Date */}
        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Target Fill
          </span>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span
              className={cn(
                'text-sm font-medium',
                isOverdue && 'text-red-600 dark:text-red-400',
                daysUntilTarget !== null &&
                  daysUntilTarget <= 7 &&
                  daysUntilTarget >= 0 &&
                  'text-amber-600 dark:text-amber-400'
              )}
            >
              {job.targetFillDate ? (
                <>
                  {formatDate(job.targetFillDate)}
                  {daysUntilTarget !== null && (
                    <span className="ml-1.5 text-xs">
                      ({isOverdue ? `${Math.abs(daysUntilTarget)}d overdue` : `${daysUntilTarget}d`})
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Not set</span>
              )}
            </span>
          </div>
        </div>

        {/* Days Open */}
        <div className="space-y-1 hidden lg:block">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Days Open
          </span>
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium tabular-nums">{daysOpen}</span>
          </div>
        </div>
      </div>

      {/* Ownership row */}
      {(job.recruiterOwner || job.hiringManager) && (
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border/50">
          {job.recruiterOwner && (
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary">
                <User className="h-3.5 w-3.5" />
              </div>
              <span className="text-muted-foreground">Recruiter:</span>
              <span className="font-medium">{job.recruiterOwner}</span>
            </div>
          )}
          {job.hiringManager && (
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Users className="h-3.5 w-3.5" />
              </div>
              <span className="text-muted-foreground">Hiring Manager:</span>
              <span className="font-medium">{job.hiringManager}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
