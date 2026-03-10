'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 text-center">
      {/* Subtle warning gradient */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `
            radial-gradient(1200px 540px at 10% -10%, rgba(239, 68, 68, 0.06), transparent 60%),
            radial-gradient(1000px 480px at 100% -20%, rgba(251, 146, 60, 0.04), transparent 55%)
          `,
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-md">
        {/* Error icon with premium treatment */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-100 dark:bg-red-950/50 dark:ring-red-900/50">
          <AlertTriangle className="h-8 w-8 text-red-500 dark:text-red-400" />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-muted-foreground">
          An unexpected error occurred. Please try again or contact support if the problem persists.
        </p>

        {error.digest && (
          <div className="mt-4 rounded-lg border border-border bg-muted/50 px-3 py-2">
            <p className="font-mono text-xs text-muted-foreground">
              Error ID: {error.digest}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={reset}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            <Home className="mr-2 h-4 w-4" />
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
