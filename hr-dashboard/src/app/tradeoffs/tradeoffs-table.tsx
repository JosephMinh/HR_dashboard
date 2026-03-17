'use client'

import Link from 'next/link'
import { useTradeoffsQuery } from '@/hooks/queries'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { EmptyStateSurface, ErrorStateSurface } from '@/components/ui/state-surface'
import { TableSkeleton } from '@/components/ui/loading-skeleton'
import { cn } from '@/lib/utils'

function rowTypeBadgeVariant(rowType: string) {
  switch (rowType) {
    case 'PAIR':
      return 'default'
    case 'SOURCE_ONLY':
      return 'secondary'
    case 'NOTE':
      return 'outline'
    default:
      return 'outline'
  }
}

export function TradeoffsTable() {
  // Small dataset (~17 records), fetch all at once
  const { data, isLoading, isError, error } = useTradeoffsQuery({ pageSize: 100 })

  if (isLoading) {
    return <TableSkeleton rows={8} columns={8} />
  }

  if (isError) {
    return <ErrorStateSurface error={error as Error & { status?: number }} message="Failed to load tradeoffs" />
  }

  const tradeoffs = data?.data ?? []

  if (tradeoffs.length === 0) {
    return <EmptyStateSurface resource="tradeoffs" />
  }

  // Summary stats
  const pairCount = tradeoffs.filter(t => t.rowType === 'PAIR').length
  const sourceOnlyCount = tradeoffs.filter(t => t.rowType === 'SOURCE_ONLY').length
  const noteCount = tradeoffs.filter(t => t.rowType === 'NOTE').length
  const totalLevelDiff = tradeoffs.reduce((sum, t) => sum + (t.levelDifference ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 rounded-lg border bg-card p-4 text-sm">
        <div>
          <span className="text-muted-foreground">Total: </span>
          <span className="font-medium">{tradeoffs.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Pairs: </span>
          <span className="font-medium">{pairCount}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Source Only: </span>
          <span className="font-medium">{sourceOnlyCount}</span>
        </div>
        {noteCount > 0 && (
          <div>
            <span className="text-muted-foreground">Notes: </span>
            <span className="font-medium">{noteCount}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Net Level Diff: </span>
          <span className={cn('font-medium', totalLevelDiff > 0 ? 'text-green-600' : totalLevelDiff < 0 ? 'text-red-600' : '')}>
            {totalLevelDiff > 0 ? '+' : ''}{totalLevelDiff}
          </span>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Source Dept</TableHead>
            <TableHead>Source Level</TableHead>
            <TableHead>Source Title</TableHead>
            <TableHead className="text-center">→</TableHead>
            <TableHead>Target Dept</TableHead>
            <TableHead>Target Level</TableHead>
            <TableHead>Target Title</TableHead>
            <TableHead className="text-right">Level Diff</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tradeoffs.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <Badge variant={rowTypeBadgeVariant(t.rowType)}>
                  {t.rowType}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{t.sourceDepartment ?? '—'}</TableCell>
              <TableCell>{t.sourceLevel ?? '—'}</TableCell>
              <TableCell>
                {t.sourceJob ? (
                  <Link href={`/jobs/${t.sourceJob.id}`} className="text-primary hover:underline">
                    {t.sourceTitle ?? t.sourceJob.title}
                  </Link>
                ) : (
                  <span className={t.sourceTempJobId ? 'text-amber-600' : 'text-muted-foreground'}>
                    {t.sourceTitle ?? '—'}
                    {t.sourceTempJobId && !t.sourceJob ? ' (unmatched)' : ''}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-center text-muted-foreground">→</TableCell>
              <TableCell className="text-muted-foreground">{t.targetDepartment ?? '—'}</TableCell>
              <TableCell>{t.targetLevel ?? '—'}</TableCell>
              <TableCell>
                {t.targetJob ? (
                  <Link href={`/jobs/${t.targetJob.id}`} className="text-primary hover:underline">
                    {t.targetTitle ?? t.targetJob.title}
                  </Link>
                ) : (
                  <span className={t.targetTempJobId ? 'text-amber-600' : 'text-muted-foreground'}>
                    {t.targetTitle ?? '—'}
                    {t.targetTempJobId && !t.targetJob ? ' (unmatched)' : ''}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {t.levelDifference !== null ? (
                  <span className={cn(
                    'font-medium',
                    t.levelDifference > 0 ? 'text-green-600' : t.levelDifference < 0 ? 'text-red-600' : ''
                  )}>
                    {t.levelDifference > 0 ? '+' : ''}{t.levelDifference}
                  </span>
                ) : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">{t.status ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
