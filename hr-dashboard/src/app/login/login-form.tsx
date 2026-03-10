'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, AlertCircle, Loader2 } from 'lucide-react'

function isValidCallbackUrl(url: string | null): url is string {
  if (!url) return false
  // Only allow relative URLs starting with /
  // Reject absolute URLs, protocol-relative URLs, or URLs with encoded characters
  if (!url.startsWith('/')) return false
  if (url.startsWith('//')) return false
  if (url.includes('://')) return false
  // Reject URLs with backslashes (potential bypass)
  if (url.includes('\\')) return false
  return true
}

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawCallbackUrl = searchParams.get('callbackUrl')
  const callbackUrl = isValidCallbackUrl(rawCallbackUrl) ? rawCallbackUrl : '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
        setIsLoading(false)
        return
      }

      router.push(callbackUrl)
    } catch {
      setError('An error occurred. Please try again.')
      setIsLoading(false)
    }
  }

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

      {/* Subtle grid pattern for depth */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 0, 0, 1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 1) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Branding header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            HR Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recruiting operations platform
          </p>
        </div>

        {/* Login card with elevation */}
        <Card className="border-border/50 shadow-lg shadow-black/5 dark:shadow-black/20">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-semibold">Sign in</CardTitle>
            <CardDescription>
              Enter your credentials to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  id="login-error"
                  role="alert"
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                  className="h-10"
                  aria-required="true"
                  aria-invalid={!!error}
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="h-10"
                  aria-required="true"
                  aria-invalid={!!error}
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </div>
              <Button
                type="submit"
                className="h-10 w-full font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Protected by enterprise-grade security
        </p>
      </div>
    </div>
  )
}
