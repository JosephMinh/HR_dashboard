import { Suspense } from 'react'
import { SetPasswordForm } from './set-password-form'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

function SetPasswordSkeleton() {
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden bg-background">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `
            radial-gradient(1200px 540px at 10% -10%, rgba(59, 130, 246, 0.12), transparent 60%),
            radial-gradient(1000px 480px at 100% -20%, rgba(16, 185, 129, 0.08), transparent 55%)
          `,
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Branding skeleton */}
        <div className="mb-8 flex flex-col items-center">
          <Skeleton className="mb-4 h-14 w-14 rounded-2xl" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-4 w-24" />
        </div>

        {/* Card skeleton */}
        <Card className="border-border/50 shadow-lg shadow-black/5 dark:shadow-black/20">
          <CardContent className="flex items-center justify-center py-12">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="ml-2 h-4 w-36" />
          </CardContent>
        </Card>

        {/* Footer skeleton */}
        <div className="mt-6 flex justify-center">
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<SetPasswordSkeleton />}>
      <SetPasswordForm />
    </Suspense>
  )
}
