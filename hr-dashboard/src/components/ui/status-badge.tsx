import { cn } from '@/lib/utils'
import {
  getStatusConfig,
  getStatusColorClasses,
  getEmphasisClasses,
  type StatusEmphasis,
} from '@/lib/status-config'
import {
  CircleDot,
  CheckCircle2,
  PauseCircle,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  UserPlus,
  FileSearch,
  MessageSquare,
  Star,
  Send,
  XCircle,
  MinusCircle,
  ChevronDown,
  Minus,
  ChevronUp,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react'

type StatusType = 'job' | 'pipeline' | 'stage' | 'priority'
type Size = 'sm' | 'md' | 'lg'
type Variant = 'badge' | 'dot' | 'pill'

interface StatusBadgeProps {
  type: StatusType
  value: string
  size?: Size
  variant?: Variant
  showIcon?: boolean
  emphasisOverride?: StatusEmphasis
  className?: string
}

// Icon mapping for status indicators
const ICON_MAP: Record<string, LucideIcon> = {
  CircleDot,
  CheckCircle2,
  PauseCircle,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  UserPlus,
  FileSearch,
  MessageSquare,
  Star,
  Send,
  XCircle,
  MinusCircle,
  ChevronDown,
  Minus,
  ChevronUp,
  AlertCircle,
}

// Size configuration for different contexts
const sizeClasses: Record<Size, {
  badge: string
  text: string
  icon: string
  dot: string
  gap: string
}> = {
  sm: {
    badge: 'px-1.5 py-0.5',
    text: 'text-xs',
    icon: 'h-3 w-3',
    dot: 'h-1.5 w-1.5',
    gap: 'gap-1',
  },
  md: {
    badge: 'px-2 py-1',
    text: 'text-sm',
    icon: 'h-3.5 w-3.5',
    dot: 'h-2 w-2',
    gap: 'gap-1.5',
  },
  lg: {
    badge: 'px-2.5 py-1.5',
    text: 'text-base',
    icon: 'h-4 w-4',
    dot: 'h-2.5 w-2.5',
    gap: 'gap-2',
  },
}

export function StatusBadge({
  type,
  value,
  size = 'md',
  variant = 'badge',
  showIcon = false,
  emphasisOverride,
  className,
}: StatusBadgeProps) {
  const config = getStatusConfig(value, type)
  const sizeConfig = sizeClasses[size]

  // Fallback for unknown status values
  if (!config) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-md font-medium',
          'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
          sizeConfig.badge,
          sizeConfig.text,
          className
        )}
      >
        {value}
      </span>
    )
  }

  const color = config.color ?? 'gray'
  const colorClasses = getStatusColorClasses(color)
  const emphasis = emphasisOverride ?? config.emphasis ?? 'standard'
  const emphasisClasses = getEmphasisClasses(emphasis)
  const IconComponent = config.icon ? ICON_MAP[config.icon] : null

  // Dot variant - minimal, just a colored dot with optional label
  if (variant === 'dot') {
    return (
      <span
        className={cn(
          'inline-flex items-center',
          sizeConfig.gap,
          sizeConfig.text,
          emphasisClasses.weight,
          emphasisClasses.opacity,
          className
        )}
        title={config.description}
      >
        <span
          className={cn(
            'rounded-full shrink-0',
            sizeConfig.dot,
            colorClasses.dot,
            emphasis === 'urgent' && 'motion-safe:animate-pulse motion-reduce:animate-none'
          )}
          aria-hidden="true"
        />
        <span className="text-foreground">{config.label}</span>
      </span>
    )
  }

  // Pill variant - more compact, no border emphasis
  if (variant === 'pill') {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full',
          sizeConfig.badge,
          sizeConfig.text,
          sizeConfig.gap,
          colorClasses.bg,
          colorClasses.text,
          emphasisClasses.weight,
          className
        )}
        title={config.description}
      >
        {showIcon && IconComponent && (
          <IconComponent className={cn(sizeConfig.icon, 'shrink-0')} aria-hidden="true" />
        )}
        {config.label}
      </span>
    )
  }

  // Badge variant (default) - full featured with emphasis-based styling
  const showBorder = emphasis === 'prominent' || emphasis === 'urgent'
  const showRing = emphasis === 'urgent'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md',
        sizeConfig.badge,
        sizeConfig.text,
        sizeConfig.gap,
        colorClasses.bg,
        colorClasses.text,
        emphasisClasses.weight,
        emphasisClasses.opacity,
        showBorder && [colorClasses.border, 'border'],
        showRing && [colorClasses.ring, 'ring-2'],
        className
      )}
      title={config.description}
    >
      {showIcon && IconComponent && (
        <IconComponent
          className={cn(
            sizeConfig.icon,
            'shrink-0',
            emphasis === 'urgent' && 'motion-safe:animate-pulse motion-reduce:animate-none'
          )}
          aria-hidden="true"
        />
      )}
      {config.label}
    </span>
  )
}

// Convenience components for specific types with smart defaults

export function JobStatusBadge({
  value,
  size,
  variant,
  showIcon,
  className,
}: Omit<StatusBadgeProps, 'type'>) {
  return (
    <StatusBadge
      type="job"
      value={value}
      size={size}
      variant={variant}
      showIcon={showIcon}
      className={className}
    />
  )
}

export function PipelineHealthBadge({
  value,
  size,
  variant = 'badge',
  showIcon = true, // Default to showing icon for pipeline health (operational scanning)
  className,
}: Omit<StatusBadgeProps, 'type'>) {
  return (
    <StatusBadge
      type="pipeline"
      value={value}
      size={size}
      variant={variant}
      showIcon={showIcon}
      className={className}
    />
  )
}

export function ApplicationStageBadge({
  value,
  size,
  variant = 'pill', // Pills work well for stage progression
  showIcon,
  className,
}: Omit<StatusBadgeProps, 'type'>) {
  return (
    <StatusBadge
      type="stage"
      value={value}
      size={size}
      variant={variant}
      showIcon={showIcon}
      className={className}
    />
  )
}

export function JobPriorityBadge({
  value,
  size,
  variant = 'dot', // Dot variant is clean for priority indicators
  showIcon,
  className,
}: Omit<StatusBadgeProps, 'type'>) {
  return (
    <StatusBadge
      type="priority"
      value={value}
      size={size}
      variant={variant}
      showIcon={showIcon}
      className={className}
    />
  )
}

// Status dot - minimal indicator without text
export function StatusDot({
  type,
  value,
  size = 'md',
  pulse = false,
  className,
}: {
  type: StatusType
  value: string
  size?: Size
  pulse?: boolean
  className?: string
}) {
  const config = getStatusConfig(value, type)
  const color = config?.color ?? 'gray'
  const colorClasses = getStatusColorClasses(color)
  const sizeConfig = sizeClasses[size]
  const shouldPulse = pulse || config?.emphasis === 'urgent'

  return (
    <span
      className={cn(
        'inline-block rounded-full',
        sizeConfig.dot,
        colorClasses.dot,
        shouldPulse && 'motion-safe:animate-pulse motion-reduce:animate-none',
        className
      )}
      title={config?.description ?? value}
      aria-label={config?.label ?? value}
    />
  )
}
