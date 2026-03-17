'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Layers,
  Tag,
  Users2,
  Milestone,
  Brain,
  ArrowLeftRight,
  FileSpreadsheet,
  Clipboard,
  Hash,
} from 'lucide-react'

interface WfpMetadataPanelProps {
  job: {
    function: string | null
    employeeType: string | null
    level: string | null
    horizon: string | null
    isTradeoff: boolean
    recruitingStatus: string | null
    functionalPriority: string | null
    corporatePriority: string | null
    asset: string | null
    keyCapability: string | null
    milestone: string | null
    talentAssessment: string | null
    fpaLevel: string | null
    fpaTiming: string | null
    fpaNote: string | null
    fpaApproved: string | null
    hiredName: string | null
    hibobId: number | null
    notes: string | null
    // Import provenance
    sourceSheet: string | null
    sourceRow: number | null
    tempJobId: number | null
  }
  className?: string
}

interface MetaItemProps {
  label: string
  value: React.ReactNode
  icon?: React.ElementType
  fullWidth?: boolean
}

function MetaItem({ label, value, icon: Icon, fullWidth }: MetaItemProps) {
  if (value == null || value === '') return null
  return (
    <div className={cn('min-w-0', fullWidth && 'sm:col-span-2 lg:col-span-3')}>
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-0.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </dt>
      <dd className={cn(
        'text-sm',
        fullWidth ? 'whitespace-pre-wrap' : 'truncate',
      )}>
        {value}
      </dd>
    </div>
  )
}

function hasFpaData(job: WfpMetadataPanelProps['job']): boolean {
  return !!(job.fpaLevel || job.fpaTiming || job.fpaNote || job.fpaApproved)
}

function hasAnyWfpData(job: WfpMetadataPanelProps['job']): boolean {
  return !!(
    job.function ||
    job.employeeType ||
    job.level ||
    job.horizon ||
    job.recruitingStatus ||
    job.functionalPriority ||
    job.corporatePriority ||
    job.asset ||
    job.keyCapability ||
    job.milestone ||
    job.talentAssessment ||
    job.hiredName ||
    job.notes ||
    job.sourceSheet ||
    hasFpaData(job)
  )
}

export function WfpMetadataPanel({ job, className }: WfpMetadataPanelProps) {
  if (!hasAnyWfpData(job)) return null

  return (
    <div className={cn('grid gap-6 lg:grid-cols-2', className)}>
      {/* Role Classification */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-muted-foreground" />
            Workforce Planning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetaItem icon={Tag} label="Function" value={job.function} />
            <MetaItem label="Employee Type" value={job.employeeType} />
            <MetaItem label="Level" value={job.level} />
            <MetaItem label="Horizon" value={job.horizon} />
            <MetaItem label="Functional Priority" value={job.functionalPriority} />
            <MetaItem label="Corporate Priority" value={job.corporatePriority} />
            <MetaItem label="Asset" value={job.asset} />
            <MetaItem label="Recruiting Status" value={job.recruitingStatus} />
            {job.isTradeoff && (
              <MetaItem
                icon={ArrowLeftRight}
                label="Tradeoff"
                value={<span className="text-amber-600 dark:text-amber-400 font-medium">Yes</span>}
              />
            )}
            {job.hiredName && (
              <MetaItem icon={Users2} label="Hired Name" value={job.hiredName} />
            )}
            {job.hibobId != null && (
              <MetaItem icon={Hash} label="HiBob ID" value={String(job.hibobId)} />
            )}
          </dl>

          {/* Key Capability & Milestone */}
          {(job.keyCapability || job.milestone || job.talentAssessment) && (
            <dl className="mt-4 space-y-3 border-t pt-3">
              {job.keyCapability && (
                <MetaItem
                  icon={Brain}
                  label="Key Capability"
                  value={job.keyCapability}
                  fullWidth
                />
              )}
              {job.milestone && (
                <MetaItem
                  icon={Milestone}
                  label="Milestone / Trigger"
                  value={job.milestone}
                  fullWidth
                />
              )}
              {job.talentAssessment && (
                <MetaItem
                  label="Talent Assessment"
                  value={job.talentAssessment}
                  fullWidth
                />
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* FP&A + Provenance */}
      <div className="space-y-6">
        {hasFpaData(job) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clipboard className="h-4 w-4 text-muted-foreground" />
                FP&A Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-2">
                <MetaItem label="FP&A Level" value={job.fpaLevel} />
                <MetaItem label="FP&A Timing" value={job.fpaTiming} />
                <MetaItem label="FP&A Note" value={job.fpaNote} fullWidth />
                <MetaItem label="255 Approved" value={job.fpaApproved} />
              </dl>
            </CardContent>
          </Card>
        )}

        {job.notes && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap text-foreground/90">{job.notes}</p>
            </CardContent>
          </Card>
        )}

        {job.sourceSheet && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" />
                Import Source
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 sm:grid-cols-3">
                <MetaItem label="Sheet" value={job.sourceSheet} />
                <MetaItem label="Row" value={job.sourceRow != null ? String(job.sourceRow) : null} />
                <MetaItem label="Temp Job ID" value={job.tempJobId != null ? String(job.tempJobId) : null} />
              </dl>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
