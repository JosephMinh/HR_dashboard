import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { PIPELINE_HEALTH, STATUS_COLOR_CLASSES, type StatusColor } from '@/lib/status-config'

interface PipelineSummaryProps {
  ahead: number
  onTrack: number
  behind: number
  showBar?: boolean
  className?: string
}

export function PipelineSummary({
  ahead,
  onTrack,
  behind,
  showBar = false,
  className,
}: PipelineSummaryProps) {
  const total = ahead + onTrack + behind
  const items: Array<{ key: string; label: string; count: number; color: StatusColor }> = [
    { key: 'AHEAD', label: PIPELINE_HEALTH['AHEAD']?.label ?? 'Ahead', count: ahead, color: 'green' },
    { key: 'ON_TRACK', label: PIPELINE_HEALTH['ON_TRACK']?.label ?? 'On Track', count: onTrack, color: 'amber' },
    { key: 'BEHIND', label: PIPELINE_HEALTH['BEHIND']?.label ?? 'Behind', count: behind, color: 'red' },
  ]

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pipeline Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showBar && total > 0 && (
          <div className="flex h-3 overflow-hidden rounded-full">
            {items.map((item) => {
              const percentage = (item.count / total) * 100
              if (percentage === 0) return null
              const colorClasses = STATUS_COLOR_CLASSES[item.color]
              return (
                <div
                  key={item.key}
                  className={cn('h-full', colorClasses.bg)}
                  style={{ width: `${percentage}%` }}
                  title={`${item.label}: ${item.count}`}
                />
              )
            })}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {items.map((item) => {
            const colorClasses = STATUS_COLOR_CLASSES[item.color]
            return (
              <Link
                key={item.key}
                href={`/jobs?health=${item.key}`}
                className={cn(
                  'flex flex-col items-center rounded-lg p-3 transition-colors hover:bg-muted/50',
                  colorClasses.border,
                  'border'
                )}
              >
                <span className={cn('text-2xl font-bold', colorClasses.text)}>
                  {item.count}
                </span>
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
