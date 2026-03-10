'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Building2,
  Calendar,
  Clock,
  FileText,
  Info,
  MapPin,
  Target,
} from 'lucide-react'

interface JobDetailsPanelProps {
  job: {
    description: string | null
    department: string
    location: string | null
    openedAt: Date | null
    closedAt: Date | null
    targetFillDate: Date | null
  }
  className?: string
}

function formatDate(date: Date | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getDaysOpen(openedAt: Date | null): number | null {
  if (!openedAt) return null
  const now = new Date()
  const opened = new Date(openedAt)
  const diffTime = now.getTime() - opened.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

interface DetailItemProps {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  muted?: boolean
}

function DetailItem({ icon: Icon, label, value, muted }: DetailItemProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={cn('text-sm font-medium', muted && 'text-muted-foreground')}>
          {value}
        </p>
      </div>
    </div>
  )
}

export function JobDetailsPanel({ job, className }: JobDetailsPanelProps) {
  const daysOpen = getDaysOpen(job.openedAt)

  return (
    <div className={cn('grid gap-6 lg:grid-cols-3', className)}>
      {/* Role Description - Primary focus */}
      {job.description && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-muted-foreground" />
              About This Role
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {job.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Context Panel - Supporting details */}
      <Card className={cn(!job.description && 'lg:col-span-3')}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-muted-foreground" />
            Role Context
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <DetailItem
              icon={Building2}
              label="Department"
              value={job.department}
            />

            {job.location && (
              <DetailItem
                icon={MapPin}
                label="Location"
                value={job.location}
              />
            )}

            <DetailItem
              icon={Calendar}
              label="Opened"
              value={
                job.openedAt ? (
                  <span>
                    {formatDate(job.openedAt)}
                    {daysOpen !== null && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({daysOpen} days ago)
                      </span>
                    )}
                  </span>
                ) : (
                  '-'
                )
              }
            />

            {job.targetFillDate && (
              <DetailItem
                icon={Target}
                label="Target Fill"
                value={formatDate(job.targetFillDate)}
              />
            )}

            {job.closedAt && (
              <DetailItem
                icon={Clock}
                label="Closed"
                value={formatDate(job.closedAt)}
              />
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
