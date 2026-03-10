'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global application error:', error)
  }, [error])

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="relative flex min-h-screen flex-col items-center justify-center px-4 text-center">
          {/* Premium gradient background */}
          <div
            className="pointer-events-none fixed inset-0 bg-white dark:bg-zinc-950"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none fixed inset-0"
            style={{
              backgroundImage: `
                radial-gradient(1200px 540px at 10% -10%, rgba(239, 68, 68, 0.08), transparent 60%),
                radial-gradient(1000px 480px at 100% -20%, rgba(251, 146, 60, 0.06), transparent 55%)
              `,
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 max-w-md">
            {/* Error icon with ring treatment */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-100 dark:bg-red-950/50 dark:ring-red-900/50">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-red-500 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Something went wrong
            </h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              A critical error occurred. Please try refreshing the page or contact support if the problem persists.
            </p>

            {error.digest && (
              <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                Error ID: {error.digest}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={reset}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus:ring-zinc-100"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus:ring-zinc-100"
              >
                Go to dashboard
              </button>
            </div>
          </div>

          {/* Footer */}
          <p className="fixed bottom-6 left-0 right-0 text-center text-xs text-zinc-400 dark:text-zinc-600">
            HR Dashboard
          </p>
        </div>
      </body>
    </html>
  )
}
