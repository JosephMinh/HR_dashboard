'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { Home, Briefcase, Users, Shield, X, ArrowLeftRight, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canManageUsers } from '@/lib/permissions'
import type { Role } from '@/types/auth'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/candidates', label: 'Candidates', icon: Users },
  { href: '/tradeoffs', label: 'Tradeoffs', icon: ArrowLeftRight },
  { href: '/headcount', label: 'Headcount', icon: BarChart3 },
]

const adminItems = [
  { href: '/admin/users', label: 'Users', icon: Shield },
]

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const userRole = session?.user?.role as Role | undefined
  const showAdmin = canManageUsers(userRole)

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 flex h-full w-64 flex-col border-r border-sidebar-border/70 bg-sidebar/95 backdrop-blur-md transition-transform duration-200 ease-in-out lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border/70 px-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary shadow-premium-xs ring-1 ring-primary/15">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight text-foreground">Talent Dashboard</span>
              <span className="text-xs text-muted-foreground">Recruiting Ops</span>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="space-y-2 px-3 py-4" aria-label="Primary navigation">
          <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Workspace
          </div>
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-sidebar-accent text-foreground shadow-premium-xs ring-1 ring-sidebar-border/60'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                )}
              >
                {isActive ? (
                  <span
                    className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                ) : null}
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            )
          })}
          {showAdmin ? (
            <>
              <div className="mt-4 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Admin
              </div>
              {adminItems.map((item) => {
                const isActive = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-sidebar-accent text-foreground shadow-premium-xs ring-1 ring-sidebar-border/60'
                        : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                    )}
                  >
                    {isActive ? (
                      <span
                        className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    ) : null}
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                )
              })}
            </>
          ) : null}
        </nav>
      </aside>
    </>
  )
}
