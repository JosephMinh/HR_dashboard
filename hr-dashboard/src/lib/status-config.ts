// Centralized status configuration for consistent rendering across the app
//
// EMPHASIS RULES:
// - subtle: background information, terminal states, historical context
// - standard: normal workflow states, informational badges in tables
// - prominent: states requiring attention, decision points, active work
// - urgent: immediate action required, blockers, risk indicators
//
// VISUAL TREATMENT BY CONTEXT:
// - inline: compact, minimal decoration, flows with text
// - row: scannable, consistent height, works in dense tables
// - hero: large, can include icons and descriptions, primary focus

export type StatusVariant = 'default' | 'secondary' | 'outline' | 'destructive'
export type StatusColor = 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'purple' | 'indigo'
export type StatusEmphasis = 'subtle' | 'standard' | 'prominent' | 'urgent'
export type StatusIntent = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

interface StatusConfig {
  label: string
  variant?: StatusVariant
  color?: StatusColor
  description?: string
  order?: number
  emphasis?: StatusEmphasis
  intent?: StatusIntent
  icon?: string // Lucide icon name for quick recognition
}

// Job Status - workflow states for job openings
export const JOB_STATUS: Record<string, StatusConfig> = {
  OPEN: {
    label: 'Open',
    variant: 'default',
    color: 'green',
    description: 'Actively hiring',
    emphasis: 'prominent',
    intent: 'success',
    icon: 'CircleDot',
  },
  CLOSED: {
    label: 'Closed',
    variant: 'secondary',
    color: 'gray',
    description: 'Position filled or cancelled',
    emphasis: 'subtle',
    intent: 'neutral',
    icon: 'CheckCircle2',
  },
  ON_HOLD: {
    label: 'On Hold',
    variant: 'outline',
    color: 'amber',
    description: 'Temporarily paused',
    emphasis: 'standard',
    intent: 'warning',
    icon: 'PauseCircle',
  },
}

// Pipeline Health - operational risk indicators (should be highly scannable)
export const PIPELINE_HEALTH: Record<string, StatusConfig> = {
  AHEAD: {
    label: 'Ahead',
    color: 'green',
    description: 'Strong pipeline, likely early fill',
    emphasis: 'standard',
    intent: 'success',
    icon: 'TrendingUp',
  },
  ON_TRACK: {
    label: 'On Track',
    color: 'amber',
    description: 'Normal progress',
    emphasis: 'subtle',
    intent: 'warning',
    icon: 'ArrowRight',
  },
  BEHIND: {
    label: 'Behind',
    color: 'red',
    description: 'Weak pipeline, needs attention',
    emphasis: 'urgent',
    intent: 'danger',
    icon: 'AlertTriangle',
  },
}

// Application Stage - candidate progression tracking
export const APPLICATION_STAGE: Record<string, StatusConfig> = {
  NEW: {
    label: 'New',
    color: 'gray',
    order: 0,
    emphasis: 'standard',
    intent: 'neutral',
    icon: 'UserPlus',
  },
  SCREENING: {
    label: 'Screening',
    color: 'blue',
    order: 1,
    emphasis: 'standard',
    intent: 'info',
    icon: 'FileSearch',
  },
  INTERVIEWING: {
    label: 'Interviewing',
    color: 'amber',
    order: 2,
    emphasis: 'prominent',
    intent: 'warning',
    icon: 'MessageSquare',
  },
  FINAL_ROUND: {
    label: 'Final Round',
    color: 'purple',
    order: 3,
    emphasis: 'prominent',
    intent: 'info',
    icon: 'Star',
  },
  OFFER: {
    label: 'Offer',
    color: 'green',
    order: 4,
    emphasis: 'urgent',
    intent: 'success',
    icon: 'Send',
  },
  HIRED: {
    label: 'Hired',
    color: 'green',
    order: 5,
    emphasis: 'subtle',
    intent: 'success',
    icon: 'CheckCircle2',
  },
  REJECTED: {
    label: 'Rejected',
    color: 'red',
    order: 6,
    emphasis: 'subtle',
    intent: 'danger',
    icon: 'XCircle',
  },
  WITHDRAWN: {
    label: 'Withdrawn',
    color: 'gray',
    order: 7,
    emphasis: 'subtle',
    intent: 'neutral',
    icon: 'MinusCircle',
  },
}

// Job Priority - urgency indicators (prominent when high/critical)
export const JOB_PRIORITY: Record<string, StatusConfig> = {
  LOW: {
    label: 'Low',
    color: 'gray',
    emphasis: 'subtle',
    intent: 'neutral',
    icon: 'ChevronDown',
  },
  MEDIUM: {
    label: 'Medium',
    color: 'blue',
    emphasis: 'standard',
    intent: 'info',
    icon: 'Minus',
  },
  HIGH: {
    label: 'High',
    color: 'amber',
    emphasis: 'prominent',
    intent: 'warning',
    icon: 'ChevronUp',
  },
  CRITICAL: {
    label: 'Critical',
    color: 'red',
    emphasis: 'urgent',
    intent: 'danger',
    icon: 'AlertCircle',
  },
}

// Candidate Source
export const CANDIDATE_SOURCE: Record<string, StatusConfig> = {
  REFERRAL: { label: 'Referral' },
  LINKEDIN: { label: 'LinkedIn' },
  CAREERS_PAGE: { label: 'Careers Page' },
  AGENCY: { label: 'Agency' },
  OTHER: { label: 'Other' },
}

// Color mapping to Tailwind classes with enhanced contrast
export const STATUS_COLOR_CLASSES: Record<StatusColor, {
  bg: string
  text: string
  border: string
  dot: string      // For status dot indicators
  ring: string     // For focus/attention rings
  bgSolid: string  // Solid background for prominent/urgent emphasis
}> = {
  gray: {
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-700 dark:text-zinc-300',
    border: 'border-zinc-300 dark:border-zinc-600',
    dot: 'bg-zinc-500 dark:bg-zinc-400',
    ring: 'ring-zinc-400/30 dark:ring-zinc-500/30',
    bgSolid: 'bg-zinc-600 dark:bg-zinc-500',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-300 dark:border-blue-700',
    dot: 'bg-blue-500 dark:bg-blue-400',
    ring: 'ring-blue-400/40 dark:ring-blue-500/40',
    bgSolid: 'bg-blue-600 dark:bg-blue-500',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-700',
    dot: 'bg-amber-500 dark:bg-amber-400',
    ring: 'ring-amber-400/40 dark:ring-amber-500/40',
    bgSolid: 'bg-amber-600 dark:bg-amber-500',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/40',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-300 dark:border-green-700',
    dot: 'bg-green-500 dark:bg-green-400',
    ring: 'ring-green-400/40 dark:ring-green-500/40',
    bgSolid: 'bg-green-600 dark:bg-green-500',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-300 dark:border-red-700',
    dot: 'bg-red-500 dark:bg-red-400',
    ring: 'ring-red-400/50 dark:ring-red-500/50',
    bgSolid: 'bg-red-600 dark:bg-red-500',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-300 dark:border-purple-700',
    dot: 'bg-purple-500 dark:bg-purple-400',
    ring: 'ring-purple-400/40 dark:ring-purple-500/40',
    bgSolid: 'bg-purple-600 dark:bg-purple-500',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-300 dark:border-indigo-700',
    dot: 'bg-indigo-500 dark:bg-indigo-400',
    ring: 'ring-indigo-400/40 dark:ring-indigo-500/40',
    bgSolid: 'bg-indigo-600 dark:bg-indigo-500',
  },
}

// Emphasis-based styling modifiers
export const EMPHASIS_CLASSES: Record<StatusEmphasis, {
  weight: string
  opacity: string
  border: string
  ring: string
}> = {
  subtle: {
    weight: 'font-normal',
    opacity: 'opacity-80',
    border: '',
    ring: '',
  },
  standard: {
    weight: 'font-medium',
    opacity: '',
    border: '',
    ring: '',
  },
  prominent: {
    weight: 'font-semibold',
    opacity: '',
    border: 'border',
    ring: '',
  },
  urgent: {
    weight: 'font-semibold',
    opacity: '',
    border: 'border',
    ring: 'ring-2',
  },
}

// Helper functions
export type StatusType = 'job' | 'pipeline' | 'stage' | 'priority' | 'source'

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

export function getStatusColorClasses(color: StatusColor): typeof STATUS_COLOR_CLASSES[StatusColor] {
  return STATUS_COLOR_CLASSES[color]
}

export function getStatusEmphasis(status: string, type: StatusType): StatusEmphasis {
  return getStatusConfig(status, type)?.emphasis ?? 'standard'
}

export function getStatusIntent(status: string, type: StatusType): StatusIntent {
  return getStatusConfig(status, type)?.intent ?? 'neutral'
}

export function getStatusIcon(status: string, type: StatusType): string | undefined {
  return getStatusConfig(status, type)?.icon
}

export function getEmphasisClasses(emphasis: StatusEmphasis): typeof EMPHASIS_CLASSES[StatusEmphasis] {
  return EMPHASIS_CLASSES[emphasis]
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

// Check if a status requires immediate attention
export function isUrgentStatus(status: string, type: StatusType): boolean {
  const config = getStatusConfig(status, type)
  return config?.emphasis === 'urgent' || config?.intent === 'danger'
}

// Check if a status is an active/in-progress state
export function isActiveStatus(status: string, type: StatusType): boolean {
  const config = getStatusConfig(status, type)
  return config?.emphasis === 'prominent' || config?.emphasis === 'urgent'
}

// Get statuses that need recruiter attention for operational dashboards
export function getAttentionStatuses(type: StatusType): string[] {
  const map = STATUS_MAPS[type]
  if (!map) return []
  return Object.entries(map)
    .filter(([, config]) => config.emphasis === 'urgent' || config.emphasis === 'prominent')
    .map(([key]) => key)
}
