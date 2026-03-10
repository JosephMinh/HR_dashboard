import { Suspense } from 'react'
import { LoginForm } from './login-form'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

function LoginSkeleton() {
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden bg-background">
      {/* Premium gradient background matching app chrome */}
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
          <Skeleton className="h-7 w-36" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>

        {/* Card skeleton */}
        <Card className="border-border/50 shadow-lg shadow-black/5 dark:shadow-black/20">
          <CardHeader className="space-y-1 pb-4">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-full" />
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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}
