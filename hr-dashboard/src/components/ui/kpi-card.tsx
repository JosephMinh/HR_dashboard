import { cn } from '@/lib/utils'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from './card'

interface KpiCardProps {
  title: string
  value: number | string
  icon?: LucideIcon
  trend?: {
    direction: 'up' | 'down'
    value: string
  }
  href?: string
  variant?: 'default' | 'alert'
  className?: string
}

export function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  href,
  variant = 'default',
  className,
}: KpiCardProps) {
  const content = (
    <Card
      className={cn(
        'transition-colors',
        href && 'hover:bg-muted/50 cursor-pointer',
        variant === 'alert' && 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20',
        className
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className={cn(
              'text-sm font-medium',
              variant === 'alert' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
            )}>
              {title}
            </p>
            <p className={cn(
              'text-3xl font-bold tracking-tight',
              variant === 'alert' && 'text-red-700 dark:text-red-300'
            )}>
              {value}
            </p>
            {trend && (
              <div className={cn(
                'flex items-center gap-1 text-xs font-medium',
                trend.direction === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}>
                {trend.direction === 'up' ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {trend.value}
              </div>
            )}
          </div>
          {Icon && (
            <div className={cn(
              'rounded-lg p-2',
              variant === 'alert'
                ? 'bg-red-100 dark:bg-red-900/30'
                : 'bg-muted'
            )}>
              <Icon className={cn(
                'h-5 w-5',
                variant === 'alert'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground'
              )} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
