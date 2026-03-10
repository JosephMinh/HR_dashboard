'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { FileQuestion, ArrowLeft, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 text-center">
      {/* Subtle gradient background */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `
            radial-gradient(1200px 540px at 10% -10%, rgba(59, 130, 246, 0.06), transparent 60%),
            radial-gradient(1000px 480px at 100% -20%, rgba(139, 92, 246, 0.05), transparent 55%)
          `,
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-md">
        {/* Icon with premium treatment */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border">
          <FileQuestion className="h-8 w-8 text-muted-foreground" />
        </div>

        {/* Large 404 indicator */}
        <div className="mb-4 text-7xl font-bold tracking-tighter text-muted-foreground/20">
          404
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved to a different location.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/" className={buttonVariants()}>
            <Home className="mr-2 h-4 w-4" />
            Go to dashboard
          </Link>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go back
          </Button>
        </div>
      </div>

      {/* Footer branding */}
      <p className="fixed bottom-6 left-0 right-0 text-center text-xs text-muted-foreground/60">
        HR Dashboard
      </p>
    </div>
  )
}
