'use client'

import Link from 'next/link'
import { AlertTriangle, Clock, TrendingDown, Users, ChevronRight, Briefcase } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { PipelineHealthBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import type { CriticalJobSummary } from '@/lib/dashboard'

interface AttentionItem {
  id: string
  type: 'critical_behind' | 'low_candidates' | 'deadline_soon'
  job: CriticalJobSummary
  urgencyLevel: 'high' | 'medium'
  actionLabel: string
}

function categorizeAttentionItems(criticalJobs: CriticalJobSummary[]): AttentionItem[] {
  const items: AttentionItem[] = []
  const now = new Date()
  const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  for (const job of criticalJobs) {
    // Critical + Behind pipeline = highest urgency
    if (job.pipelineHealth === 'BEHIND') {
      items.push({
        id: `${job.id}-behind`,
        type: 'critical_behind',
        job,
        urgencyLevel: 'high',
        actionLabel: 'Add candidates',
      })
      continue // Don't add multiple entries for same job
    }

    // Near deadline (within 2 weeks) with low candidates
    if (job.targetFillDate) {
      const targetDate = new Date(job.targetFillDate)
      if (targetDate <= twoWeeksFromNow && job.activeCandidateCount < 3) {
        items.push({
          id: `${job.id}-deadline`,
          type: 'deadline_soon',
          job,
          urgencyLevel: 'high',
          actionLabel: 'Review timeline',
        })
        continue
      }
    }

    // Low candidate count (< 2)
    if (job.activeCandidateCount < 2) {
      items.push({
        id: `${job.id}-low`,
        type: 'low_candidates',
        job,
        urgencyLevel: 'medium',
        actionLabel: 'Source candidates',
      })
    }
  }

  // Sort by urgency level (high first) then by candidate count (lowest first)
  return items.sort((a, b) => {
    if (a.urgencyLevel !== b.urgencyLevel) {
      return a.urgencyLevel === 'high' ? -1 : 1
    }
    return a.job.activeCandidateCount - b.job.activeCandidateCount
  })
}

function getTypeIcon(type: AttentionItem['type']) {
  switch (type) {
    case 'critical_behind':
      return TrendingDown
    case 'deadline_soon':
      return Clock
    case 'low_candidates':
      return Users
    default:
      return AlertTriangle
  }
}

function getTypeLabel(type: AttentionItem['type']) {
  switch (type) {
    case 'critical_behind':
      return 'Weak pipeline'
    case 'deadline_soon':
      return 'Deadline approaching'
    case 'low_candidates':
      return 'Low candidates'
    default:
      return 'Needs attention'
  }
}

interface AttentionQueueProps {
  criticalJobs: CriticalJobSummary[]
  className?: string
}

export function AttentionQueue({ criticalJobs, className }: AttentionQueueProps) {
  const attentionItems = categorizeAttentionItems(criticalJobs)

  if (attentionItems.length === 0) {
    return (
      <Card className={cn('shadow-premium-sm', className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Attention Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-status-ahead/10 p-3 mb-3">
              <Briefcase className="h-6 w-6 text-status-ahead" aria-hidden="true" />
            </div>
            <p className="font-medium text-foreground">All clear</p>
            <p className="text-sm text-muted-foreground mt-1">
              No jobs require immediate attention
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn('shadow-premium-sm', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
            Attention Queue
            <span className="ml-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              {attentionItems.length}
            </span>
          </CardTitle>
          <Link
            href="/jobs?critical=true"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="View all critical jobs"
          >
            View all →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2" role="list">
        {attentionItems.slice(0, 5).map((item) => {
          const Icon = getTypeIcon(item.type)
          const isHighUrgency = item.urgencyLevel === 'high'

          return (
            <div
              key={item.id}
              className={cn(
                'group flex items-center gap-3 rounded-lg border p-3 transition-all',
                isHighUrgency
                  ? 'border-destructive/30 bg-destructive/5 hover:border-destructive/50'
                  : 'border-border/50 hover:border-border hover:bg-muted/30'
              )}
              role="listitem"
            >
              {/* Urgency indicator */}
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  isHighUrgency ? 'bg-destructive/10' : 'bg-muted'
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4',
                    isHighUrgency ? 'text-destructive' : 'text-muted-foreground'
                  )}
                  aria-hidden="true"
                />
              </div>

              {/* Job info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/jobs/${item.job.id}`}
                    className="truncate font-medium text-foreground hover:underline"
                    aria-label={`View job: ${item.job.title}`}
                  >
                    {item.job.title}
                  </Link>
                  {item.job.pipelineHealth && (
                    <PipelineHealthBadge value={item.job.pipelineHealth} size="sm" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{getTypeLabel(item.type)}</span>
                  <span>·</span>
                  <span>{item.job.activeCandidateCount} candidates</span>
                </div>
              </div>

              {/* Action button */}
              <Link
                href={`/jobs/${item.job.id}`}
                className={buttonVariants({
                  variant: isHighUrgency ? 'default' : 'outline',
                  size: 'sm',
                  className: 'shrink-0 gap-1',
                })}
                aria-label={`${item.actionLabel} for ${item.job.title}`}
              >
                {item.actionLabel}
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          )
        })}

        {attentionItems.length > 5 && (
          <div className="pt-2 text-center">
            <Link
              href="/jobs?critical=true"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              +{attentionItems.length - 5} more items needing attention
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
