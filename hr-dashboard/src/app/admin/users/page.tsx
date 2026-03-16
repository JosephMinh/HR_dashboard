'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UnauthorizedState } from '@/components/ui/unauthorized-state'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { canManageUsers } from '@/lib/permissions'
import { Plus, RotateCcw, Copy, Check, Search, Mail, AlertTriangle } from 'lucide-react'

interface User {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'RECRUITER' | 'VIEWER'
  active: boolean
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

interface UsersResponse {
  users: User[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const ROLES = ['ADMIN', 'RECRUITER', 'VIEWER'] as const

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

interface StatusBanner {
  type: 'success' | 'warning'
  message: string
  setupUrl?: string
}

function InviteStatusBanner({ status, onDismiss }: { status: StatusBanner; onDismiss: () => void }) {
  const isSuccess = status.type === 'success'
  return (
    <div className={`rounded-md border p-4 ${
      isSuccess
        ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
        : 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
    }`}>
      <div className="flex items-start gap-2">
        {isSuccess ? (
          <Mail className="mt-0.5 h-4 w-4 text-green-700 dark:text-green-400 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
        )}
        <div className="flex-1">
          <p className={`text-sm font-medium ${
            isSuccess
              ? 'text-green-800 dark:text-green-300'
              : 'text-amber-800 dark:text-amber-300'
          }`}>
            {status.message}
          </p>
          {status.setupUrl && (
            <div className="mt-2">
              <p className={`text-xs ${isSuccess ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                Setup link (share manually if needed):
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className={`rounded px-2 py-1 font-mono text-xs break-all ${
                  isSuccess
                    ? 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200'
                    : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                }`}>
                  {status.setupUrl}
                </code>
                <CopyButton text={status.setupUrl} />
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  )
}

function CreateUserDialog({ onCreated }: { onCreated: (user: User, invite: { status: string; setupUrl?: string; error?: string }) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<typeof ROLES[number]>('VIEWER')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setEmail('')
    setRole('VIEWER')
    setError(null)
    setSaving(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create user')
        return
      }

      onCreated(data, data.invite ?? { status: 'sent' })
      setOpen(false)
      reset()
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) reset() }}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        New User
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="create-name" className="block text-sm font-medium text-foreground">Name</label>
            <input
              id="create-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
              minLength={1}
              maxLength={100}
            />
          </div>
          <div>
            <label htmlFor="create-email" className="block text-sm font-medium text-foreground">Email</label>
            <input
              id="create-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label htmlFor="create-role" className="block text-sm font-medium text-foreground">Role</label>
            <select
              id="create-role"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof ROLES[number])}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({
  user,
  currentUserId,
  onUpdated,
}: {
  user: User
  currentUserId: string
  onUpdated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState(user.role)
  const [active, setActive] = useState(user.active)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSelf = user.id === currentUserId

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const body: Record<string, unknown> = {}
    if (name.trim() !== user.name) body.name = name.trim()
    if (role !== user.role) body.role = role
    if (active !== user.active) body.active = active

    if (Object.keys(body).length === 0) {
      setOpen(false)
      return
    }

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to update user')
        return
      }

      setOpen(false)
      onUpdated()
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={`edit-name-${user.id}`} className="block text-sm font-medium text-foreground">Name</label>
            <input
              id={`edit-name-${user.id}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
              minLength={1}
              maxLength={100}
            />
          </div>
          <div>
            <label htmlFor={`edit-role-${user.id}`} className="block text-sm font-medium text-foreground">Role</label>
            <select
              id={`edit-role-${user.id}`}
              value={role}
              onChange={(e) => setRole(e.target.value as typeof ROLES[number])}
              disabled={isSelf}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {isSelf && <p className="mt-1 text-xs text-muted-foreground">You cannot change your own role.</p>}
          </div>
          <div className="flex items-center gap-2">
            <input
              id={`edit-active-${user.id}`}
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={isSelf}
              className="rounded border-input"
            />
            <label htmlFor={`edit-active-${user.id}`} className="text-sm font-medium text-foreground">
              Active
            </label>
            {isSelf && <span className="text-xs text-muted-foreground">(cannot deactivate yourself)</span>}
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordButton({
  userId,
  userName,
  onReset,
}: {
  userId: string
  userName: string
  onReset: (result: { success: boolean; error?: string }) => void
}) {
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReset() {
    if (!confirm(`Reset password for ${userName}? A password reset email will be sent to their email address.`)) {
      return
    }

    setResetting(true)
    setError(null)

    try {
      const res = await fetch(`/api/users/${userId}/reset-password`, {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        const errMsg = data.error || 'Failed to reset password'
        setError(errMsg)
        onReset({ success: false, error: errMsg })
        return
      }

      onReset({ success: true })
    } catch {
      setError('An unexpected error occurred')
      onReset({ success: false, error: 'An unexpected error occurred' })
    } finally {
      setResetting(false)
    }
  }

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleReset}
        disabled={resetting}
      >
        <RotateCcw className="mr-1 h-3 w-3" />
        {resetting ? 'Sending...' : 'Reset PW'}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

function roleBadgeVariant(role: string) {
  switch (role) {
    case 'ADMIN': return 'default'
    case 'RECRUITER': return 'secondary'
    default: return 'outline'
  }
}

export default function AdminUsersPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'true' | 'false' | 'all'>('true')
  const [loading, setLoading] = useState(true)
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null)
  const pageSize = 20

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        active: activeFilter,
      })
      if (search.trim()) {
        params.set('search', search.trim())
      }

      const res = await fetch(`/api/users?${params}`)
      if (res.ok) {
        const data: UsersResponse = await res.json()
        setUsers(data.users)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      }
    } finally {
      setLoading(false)
    }
  }, [page, activeFilter, search])

  useEffect(() => {
    if (session?.user && canManageUsers(session.user.role)) {
      fetchUsers()
    }
  }, [fetchUsers, session])

  if (!session?.user) {
    router.push('/login')
    return null
  }

  if (!canManageUsers(session.user.role)) {
    return (
      <AppShell>
        <UnauthorizedState message="Only administrators can manage users." />
      </AppShell>
    )
  }

  function handleCreated(_user: User, invite: { status: string; setupUrl?: string; error?: string }) {
    if (invite.status === 'sent') {
      setStatusBanner({ type: 'success', message: 'User created. An onboarding invite email has been sent.', setupUrl: invite.setupUrl })
    } else {
      setStatusBanner({ type: 'warning', message: 'User created, but the invite email could not be sent. Share the setup link manually.', setupUrl: invite.setupUrl })
    }
    fetchUsers()
  }

  function handleResetPassword(result: { success: boolean; error?: string }) {
    if (result.success) {
      setStatusBanner({ type: 'success', message: 'Password reset email sent successfully.' })
    } else {
      setStatusBanner({ type: 'warning', message: result.error || 'Password reset email could not be sent. The existing password remains unchanged.' })
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
            <p className="text-sm text-muted-foreground">Manage user accounts, roles, and passwords</p>
          </div>
          <CreateUserDialog onCreated={handleCreated} />
        </div>

        {statusBanner && (
          <InviteStatusBanner status={statusBanner} onDismiss={() => setStatusBanner(null)} />
        )}

        {/* Search and filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <select
            value={activeFilter}
            onChange={(e) => { setActiveFilter(e.target.value as typeof activeFilter); setPage(1) }}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">All</option>
          </select>
        </div>

        {/* Users table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        Loading...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">
                          {user.name}
                          {user.id === session.user.id && (
                            <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                        <td className="px-4 py-3">
                          <Badge variant={roleBadgeVariant(user.role) as 'default' | 'secondary' | 'outline'}>
                            {user.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {user.active ? (
                              <Badge variant="outline" className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-400">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-red-300 text-red-700 dark:border-red-700 dark:text-red-400">
                                Inactive
                              </Badge>
                            )}
                            {user.mustChangePassword && (
                              <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
                                Pending Setup
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <EditUserDialog
                              user={user}
                              currentUserId={session.user.id}
                              onUpdated={fetchUsers}
                            />
                            {user.active && (
                              <ResetPasswordButton
                                userId={user.id}
                                userName={user.name}
                                onReset={handleResetPassword}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} users
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
