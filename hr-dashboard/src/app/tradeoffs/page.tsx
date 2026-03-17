import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AppShell } from '@/components/layout'
import { PageHeader } from '@/components/ui/page-header'
import { TableSkeleton } from '@/components/ui/loading-skeleton'
import { TradeoffsTable } from './tradeoffs-table'

export default async function TradeoffsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <AppShell
      user={{
        name: session.user.name || 'User',
        email: session.user.email || '',
        role: session.user.role,
      }}
    >
      <div className="space-y-6">
        <PageHeader
          title="Tradeoffs"
          description="Level tradeoff analysis between source and target positions"
        />

        <Suspense fallback={<TableSkeleton rows={8} columns={8} />}>
          <TradeoffsTable />
        </Suspense>
      </div>
    </AppShell>
  )
}
