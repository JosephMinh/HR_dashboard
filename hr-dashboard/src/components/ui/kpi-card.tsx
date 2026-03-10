import { cn } from '@/lib/utils'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from './card'

interface KpiCardProps {
  title: string
  value: number | string
  description?: string
  icon?: LucideIcon
  trend?: {
    direction: 'up' | 'down'
    value: string
  }
  href?: string
  variant?: 'default' | 'alert' | 'success'
  className?: string
}

export function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  href,
  variant = 'default',
  className,
}: KpiCardProps) {
  const isAlert = variant === 'alert'
  const isSuccess = variant === 'success'
  let iconBackgroundClass = 'bg-muted'
  let iconColorClass = 'text-muted-foreground'

  if (isSuccess) {
    iconBackgroundClass = 'bg-status-ahead/10'
    iconColorClass = 'text-status-ahead'
  }

  if (isAlert) {
    iconBackgroundClass = 'bg-destructive/10'
    iconColorClass = 'text-destructive'
  }

  const content = (
    <Card
      className={cn(
        // Base premium styling
        'shadow-premium-sm transition-all duration-150',
        // Interactive states when clickable
        href && [
          'cursor-pointer',
          'hover:shadow-premium-md',
          'focus-visible:ring-2 focus-visible:ring-ring',
        ],
        // Variant-specific styling
        isAlert && 'ring-1 ring-destructive/30 bg-destructive/5 hover:ring-destructive/50',
        isSuccess && 'ring-1 ring-status-ahead/30 bg-status-ahead/5 hover:ring-status-ahead/50',
        !isAlert && !isSuccess && href && 'hover:ring-primary/20',
        className
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className={cn(
              'text-sm font-medium',
              isAlert ? 'text-destructive' : 'text-muted-foreground'
            )}>
              {title}
            </p>
            <p className={cn(
              'mt-2 text-3xl font-bold tracking-tight tabular-nums',
              isAlert && 'text-destructive',
              isSuccess && 'text-status-ahead'
            )}>
              {value}
            </p>
            {(description || trend) && (
              <div className="mt-1 flex items-center gap-2">
                {trend && (
                  <span className={cn(
                    'inline-flex items-center gap-1 text-xs font-medium',
                    trend.direction === 'up' ? 'text-status-ahead' : 'text-destructive'
                  )}>
                    {trend.direction === 'up' ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {trend.value}
                  </span>
                )}
                {description && (
                  <span className={cn(
                    'text-xs',
                    isAlert ? 'text-destructive/70' : 'text-muted-foreground'
                  )}>
                    {description}
                  </span>
                )}
              </div>
            )}
          </div>
          {Icon && (
            <div className={cn(
              'rounded-lg p-2.5',
              iconBackgroundClass
            )}>
              <Icon className={cn(
                'h-5 w-5',
                iconColorClass
              )} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="group block">
        {content}
      </Link>
    )
  }

  return content
}
