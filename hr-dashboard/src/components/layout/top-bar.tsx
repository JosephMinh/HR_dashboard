'use client'

import { signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, LogOut, User, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

interface TopBarProps {
  user?: {
    name: string
    email: string
    role: 'ADMIN' | 'RECRUITER' | 'VIEWER'
  }
  onMenuClick: () => void
}

type RouteMeta = {
  title: string
  subtitle?: string
}

function getRouteMeta(pathname: string): RouteMeta {
  if (pathname === '/') {
    return { title: 'Dashboard', subtitle: 'Pipeline overview' }
  }

  if (pathname === '/jobs') {
    return { title: 'Jobs', subtitle: 'Openings and pipeline health' }
  }

  if (pathname === '/jobs/new') {
    return { title: 'New Job', subtitle: 'Create an opening' }
  }

  if (/^\/jobs\/[^/]+\/edit$/.test(pathname)) {
    return { title: 'Edit Job', subtitle: 'Update role details' }
  }

  if (/^\/jobs\/[^/]+$/.test(pathname)) {
    return { title: 'Job Overview', subtitle: 'Recruiting workspace' }
  }

  if (pathname === '/candidates') {
    return { title: 'Candidates', subtitle: 'Talent pipeline' }
  }

  if (pathname === '/candidates/new') {
    return { title: 'New Candidate', subtitle: 'Add profile and resume' }
  }

  if (/^\/candidates\/[^/]+\/edit$/.test(pathname)) {
    return { title: 'Edit Candidate', subtitle: 'Update profile' }
  }

  if (/^\/candidates\/[^/]+$/.test(pathname)) {
    return { title: 'Candidate Profile', subtitle: 'Recruiter dossier' }
  }

  if (pathname === '/settings/profile') {
    return { title: 'Profile', subtitle: 'Your account details' }
  }

  if (pathname === '/settings/password') {
    return { title: 'Change Password', subtitle: 'Update your credentials' }
  }

  if (pathname === '/admin/users') {
    return { title: 'User Management', subtitle: 'Manage team access' }
  }

  return { title: 'Workspace' }
}

const roleColors = {
  ADMIN: 'bg-destructive/10 text-destructive',
  RECRUITER: 'bg-primary/10 text-primary',
  VIEWER: 'bg-muted text-muted-foreground',
}

export function TopBar({ user, onMenuClick }: TopBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const routeMeta = getRouteMeta(pathname)

  const initials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('')
    : 'U'

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-md lg:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Recruiting Workspace
          </span>
          <span className="text-base font-semibold tracking-tight text-foreground">
            {routeMeta.title}
          </span>
          {routeMeta.subtitle ? (
            <span className="text-xs text-muted-foreground">
              {routeMeta.subtitle}
            </span>
          ) : null}
        </div>
      </div>

      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/70 px-2.5 py-1.5 shadow-premium-xs transition-colors hover:bg-accent"
            aria-label="Open user menu"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {initials}
            </div>
            <div className="hidden flex-col items-start text-sm leading-tight sm:flex">
              <span className="font-medium">{user.name}</span>
              <Badge className={roleColors[user.role]} variant="secondary">
                {user.role}
              </Badge>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-muted-foreground">
              {user.email}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings/profile')}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/settings/password')}>
              <KeyRound className="mr-2 h-4 w-4" />
              Change Password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="h-10 w-24 rounded-md bg-muted motion-safe:animate-pulse motion-reduce:animate-none" />
      )}
    </header>
  )
}
