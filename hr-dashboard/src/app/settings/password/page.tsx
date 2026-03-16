'use client'

import { useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PASSWORD_REQUIREMENTS } from '@/lib/validations/password'
import { Eye, EyeOff, Check, X } from 'lucide-react'

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
          <li key={req.key} className={`flex items-center gap-1 ${met ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
            {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {req.label}
          </li>
        )
      })}
    </ul>
  )
}

export default function ChangePasswordPage() {
  const { data: session, update } = useSession()
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mustChange = session?.user?.mustChangePassword === true

  const passwordsMatch = useMemo(
    () => newPassword.length > 0 && newPassword === confirmPassword,
    [newPassword, confirmPassword]
  )

  const allRequirementsMet = useMemo(
    () => PASSWORD_REQUIREMENTS.every((req) => req.test(newPassword)),
    [newPassword]
  )

  const canSubmit = currentPassword.length > 0 && allRequirementsMet && passwordsMatch && !saving

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to change password')
        return
      }

      // Refresh session to clear mustChangePassword
      await update()
      router.push('/')
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  if (!session?.user) {
    router.push('/login')
    return null
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        {mustChange && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            You must change your password to continue using the application.
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <PasswordInput
                id="currentPassword"
                label="Current Password"
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
              />

              <div>
                <PasswordInput
                  id="newPassword"
                  label="New Password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                />
                <PolicyHints password={newPassword} />
              </div>

              <div>
                <PasswordInput
                  id="confirmPassword"
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
                )}
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={!canSubmit}>
                {saving ? 'Changing...' : 'Change Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
