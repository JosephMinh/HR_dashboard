'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PASSWORD_REQUIREMENTS } from '@/lib/validations/password'
import {
  KeyRound,
  AlertCircle,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff,
  CheckCircle2,
  ShieldAlert,
  Clock,
  ShieldCheck,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Token validation states
// ---------------------------------------------------------------------------

type TokenState =
  | { status: 'loading' }
  | { status: 'valid'; emailMasked: string }
  | { status: 'invalid'; reason: 'expired' | 'used' | 'invalid' }
  | { status: 'missing' }
  | { status: 'error'; message: string }

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PasswordInput({
  id,
  label,
  value,
  onChange,
  disabled,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          required
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function PolicyHints({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {PASSWORD_REQUIREMENTS.map((req) => {
        const met = password.length > 0 && req.test(password)
        return (
          <li
            key={req.key}
            className={`flex items-center gap-1 ${met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}
          >
            {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {req.label}
          </li>
        )
      })}
    </ul>
  )
}

function GradientBackground() {
  return (
    <>
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
    </>
  )
}

function Branding() {
  return (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
        <KeyRound className="h-7 w-7 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Set Your Password
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        HR Dashboard
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Error / status cards
// ---------------------------------------------------------------------------

function TokenErrorCard({ reason }: { reason: 'expired' | 'used' | 'invalid' }) {
  const config = {
    expired: {
      icon: Clock,
      title: 'Link Expired',
      message: 'This password setup link has expired. Please contact your administrator to send a new invite.',
      iconColor: 'text-amber-500',
    },
    used: {
      icon: ShieldCheck,
      title: 'Already Used',
      message: 'This link has already been used to set a password. If you need to reset your password, please contact your administrator.',
      iconColor: 'text-blue-500',
    },
    invalid: {
      icon: ShieldAlert,
      title: 'Invalid Link',
      message: 'This password setup link is not valid. Please check the link in your email or contact your administrator.',
      iconColor: 'text-destructive',
    },
  }

  const { icon: Icon, title, message, iconColor } = config[reason]

  return (
    <Card className="border-border/50 shadow-lg shadow-black/5 dark:shadow-black/20">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 rounded-full bg-muted p-3">
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          {reason === 'used' && (
            <a
              href="/login"
              className="mt-4 text-sm font-medium text-primary hover:text-primary/80"
            >
              Go to login
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function MissingTokenCard() {
  return (
    <Card className="border-border/50 shadow-lg shadow-black/5 dark:shadow-black/20">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 rounded-full bg-muted p-3">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Missing Token</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No setup token was provided. Please use the link from your invitation email.
            If you don&apos;t have one, contact your administrator.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function SuccessCard() {
  return (
    <Card className="border-border/50 shadow-lg shadow-black/5 dark:shadow-black/20">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 rounded-full bg-green-100 p-3 dark:bg-green-900/30">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Password Set Successfully</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your password has been set. You can now sign in with your new credentials.
          </p>
          <a
            href="/login"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            Sign in
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function SetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [tokenState, setTokenState] = useState<TokenState>(
    token ? { status: 'loading' } : { status: 'missing' }
  )
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const passwordsMatch = useMemo(
    () => newPassword.length > 0 && newPassword === confirmPassword,
    [newPassword, confirmPassword]
  )

  const allRequirementsMet = useMemo(
    () => PASSWORD_REQUIREMENTS.every((req) => req.test(newPassword)),
    [newPassword]
  )

  const canSubmit = allRequirementsMet && passwordsMatch && !submitting

  // Validate token on mount
  const validateToken = useCallback(async () => {
    if (!token) {
      setTokenState({ status: 'missing' })
      return
    }

    setTokenState({ status: 'loading' })

    try {
      const res = await fetch(`/api/password-setup?token=${encodeURIComponent(token)}`)
      const data = await res.json()

      if (data.valid) {
        setTokenState({ status: 'valid', emailMasked: data.emailMasked || '' })
      } else {
        const reason = data.reason as 'expired' | 'used' | 'invalid'
        setTokenState({ status: 'invalid', reason: reason || 'invalid' })
      }
    } catch {
      setTokenState({ status: 'error', message: 'Unable to validate your link. Please try again.' })
    }
  }, [token])

  useEffect(() => {
    validateToken()
  }, [validateToken])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !token) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/password-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      })

      if (!res.ok) {
        const data = await res.json()
        if (data.reason === 'expired' || data.reason === 'used' || data.reason === 'invalid') {
          setTokenState({ status: 'invalid', reason: data.reason })
          return
        }
        setSubmitError(data.error || 'Failed to set password. Please try again.')
        return
      }

      setSuccess(true)
    } catch {
      setSubmitError('An unexpected error occurred. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden bg-background">
      <GradientBackground />

      <div className="relative z-10 w-full max-w-md">
        <Branding />

        {/* Loading state */}
        {tokenState.status === 'loading' && (
          <Card className="border-border/50 shadow-lg shadow-black/5 dark:shadow-black/20">
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Validating your link...</span>
            </CardContent>
          </Card>
        )}

        {/* Missing token */}
        {tokenState.status === 'missing' && <MissingTokenCard />}

        {/* Invalid/expired/used token */}
        {tokenState.status === 'invalid' && <TokenErrorCard reason={tokenState.reason} />}

        {/* Network error */}
        {tokenState.status === 'error' && (
          <Card className="border-border/50 shadow-lg shadow-black/5 dark:shadow-black/20">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 rounded-full bg-muted p-3">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">Something Went Wrong</h2>
                <p className="mt-2 text-sm text-muted-foreground">{tokenState.message}</p>
                <Button variant="outline" className="mt-4" onClick={() => validateToken()}>
                  Try again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success */}
        {success && <SuccessCard />}

        {/* Valid token — show password form */}
        {tokenState.status === 'valid' && !success && (
          <Card className="border-border/50 shadow-lg shadow-black/5 dark:shadow-black/20">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl font-semibold">Create your password</CardTitle>
              <CardDescription>
                {tokenState.emailMasked
                  ? `Setting password for ${tokenState.emailMasked}`
                  : 'Choose a strong password for your account'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <PasswordInput
                    id="newPassword"
                    label="New Password"
                    value={newPassword}
                    onChange={setNewPassword}
                    disabled={submitting}
                    autoComplete="new-password"
                  />
                  <PolicyHints password={newPassword} />
                </div>

                <div>
                  <PasswordInput
                    id="confirmPassword"
                    label="Confirm Password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    disabled={submitting}
                    autoComplete="new-password"
                  />
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
                  )}
                </div>

                {submitError && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{submitError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="h-10 w-full font-medium"
                  disabled={!canSubmit}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting password...
                    </>
                  ) : (
                    'Set Password'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Protected by enterprise-grade security
        </p>
      </div>
    </div>
  )
}
