import { cn } from '@/lib/utils'
import {
  getStatusConfig,
  getStatusColorClasses,
} from '@/lib/status-config'

type StatusType = 'job' | 'pipeline' | 'stage' | 'priority'
type Size = 'sm' | 'md' | 'lg'

interface StatusBadgeProps {
  type: StatusType
  value: string
  size?: Size
  className?: string
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-sm',
  lg: 'px-2.5 py-1.5 text-base',
}

export function StatusBadge({ type, value, size = 'md', className }: StatusBadgeProps) {
  const config = getStatusConfig(value, type)
  
  if (!config) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-md font-medium',
          'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
          sizeClasses[size],
          className
        )}
      >
        {value}
      </span>
    )
  }

  const color = config.color
  const colorClasses = color ? getStatusColorClasses(color) : null

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-medium',
        colorClasses ? `${colorClasses.bg} ${colorClasses.text}` : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
        sizeClasses[size],
        className
      )}
      title={config.description}
    >
      {config.label}
    </span>
  )
}

// Convenience components for specific types
export function JobStatusBadge({ value, size, className }: Omit<StatusBadgeProps, 'type'>) {
  return <StatusBadge type="job" value={value} size={size} className={className} />
}

export function PipelineHealthBadge({ value, size, className }: Omit<StatusBadgeProps, 'type'>) {
  return <StatusBadge type="pipeline" value={value} size={size} className={className} />
}

export function ApplicationStageBadge({ value, size, className }: Omit<StatusBadgeProps, 'type'>) {
  return <StatusBadge type="stage" value={value} size={size} className={className} />
}

export function JobPriorityBadge({ value, size, className }: Omit<StatusBadgeProps, 'type'>) {
  return <StatusBadge type="priority" value={value} size={size} className={className} />
}
