// Centralized status configuration for consistent rendering across the app

export type StatusVariant = 'default' | 'secondary' | 'outline' | 'destructive'
export type StatusColor = 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'purple'

interface StatusConfig {
  label: string
  variant?: StatusVariant
  color?: StatusColor
  description?: string
  order?: number
}

// Job Status
export const JOB_STATUS: Record<string, StatusConfig> = {
  OPEN: { label: 'Open', variant: 'default', description: 'Actively hiring' },
  CLOSED: { label: 'Closed', variant: 'secondary', description: 'Position filled or cancelled' },
  ON_HOLD: { label: 'On Hold', variant: 'outline', description: 'Temporarily paused' },
}

// Pipeline Health
export const PIPELINE_HEALTH: Record<string, StatusConfig> = {
  AHEAD: { label: 'Ahead', color: 'green', description: 'Strong pipeline, likely early fill' },
  ON_TRACK: { label: 'On Track', color: 'amber', description: 'Normal progress' },
  BEHIND: { label: 'Behind', color: 'red', description: 'Weak pipeline, needs attention' },
}

// Application Stage
export const APPLICATION_STAGE: Record<string, StatusConfig> = {
  NEW: { label: 'New', color: 'gray', order: 0 },
  SCREENING: { label: 'Screening', color: 'blue', order: 1 },
  INTERVIEWING: { label: 'Interviewing', color: 'amber', order: 2 },
  FINAL_ROUND: { label: 'Final Round', color: 'purple', order: 3 },
  OFFER: { label: 'Offer', color: 'green', order: 4 },
  HIRED: { label: 'Hired', color: 'green', order: 5 },
  REJECTED: { label: 'Rejected', color: 'red', order: 6 },
  WITHDRAWN: { label: 'Withdrawn', color: 'gray', order: 7 },
}

// Job Priority
export const JOB_PRIORITY: Record<string, StatusConfig> = {
  LOW: { label: 'Low', color: 'gray' },
  MEDIUM: { label: 'Medium', color: 'blue' },
  HIGH: { label: 'High', color: 'amber' },
  CRITICAL: { label: 'Critical', color: 'red' },
}

// Candidate Source
export const CANDIDATE_SOURCE: Record<string, StatusConfig> = {
  REFERRAL: { label: 'Referral' },
  LINKEDIN: { label: 'LinkedIn' },
  CAREERS_PAGE: { label: 'Careers Page' },
  AGENCY: { label: 'Agency' },
  OTHER: { label: 'Other' },
}

// Color mapping to Tailwind classes
export const STATUS_COLOR_CLASSES: Record<StatusColor, { bg: string; text: string; border: string }> = {
  gray: {
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-700 dark:text-zinc-300',
    border: 'border-zinc-200 dark:border-zinc-700',
  },
  blue: {
    bg: 'bg-blue-100 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
  amber: {
    bg: 'bg-amber-100 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-200 dark:border-green-800',
  },
  red: {
    bg: 'bg-red-100 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/20',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
  },
}

// Helper functions
type StatusType = 'job' | 'pipeline' | 'stage' | 'priority' | 'source'

const STATUS_MAPS: Record<StatusType, Record<string, StatusConfig>> = {
  job: JOB_STATUS,
  pipeline: PIPELINE_HEALTH,
  stage: APPLICATION_STAGE,
  priority: JOB_PRIORITY,
  source: CANDIDATE_SOURCE,
}

export function getStatusConfig(status: string, type: StatusType): StatusConfig | undefined {
  return STATUS_MAPS[type]?.[status]
}

export function getStatusLabel(status: string, type: StatusType): string {
  return getStatusConfig(status, type)?.label ?? status
}

export function getStatusColor(status: string, type: StatusType): StatusColor | undefined {
  return getStatusConfig(status, type)?.color
}

export function getStatusColorClasses(color: StatusColor): { bg: string; text: string; border: string } {
  return STATUS_COLOR_CLASSES[color]
}

export function getStageOrder(stage: string): number {
  return APPLICATION_STAGE[stage]?.order ?? 999
}

// Get all stages in order
export function getOrderedStages(): Array<{ key: string; config: StatusConfig }> {
  return Object.entries(APPLICATION_STAGE)
    .map(([key, config]) => ({ key, config }))
    .sort((a, b) => (a.config.order ?? 999) - (b.config.order ?? 999))
}
