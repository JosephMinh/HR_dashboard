'use client'

import { signOut } from 'next-auth/react'
import { Menu, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

interface TopBarProps {
  user?: {
    name: string
    email: string
    role: 'ADMIN' | 'RECRUITER' | 'VIEWER'
  }
  onMenuClick: () => void
}

const roleColors = {
  ADMIN: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  RECRUITER: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  VIEWER: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400',
}

export function TopBar({ user, onMenuClick }: TopBarProps) {
  const initials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('')
    : 'U'

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md lg:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/70 px-2.5 py-1.5 transition-colors hover:bg-accent">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {initials}
            </div>
            <div className="flex flex-col items-start text-sm leading-tight">
              <span className="font-medium">{user.name}</span>
              <Badge className={roleColors[user.role]} variant="secondary">
                {user.role}
              </Badge>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-zinc-500">
              {user.email}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-red-600 dark:text-red-400"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="h-10 w-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
      )}
    </header>
  )
}
