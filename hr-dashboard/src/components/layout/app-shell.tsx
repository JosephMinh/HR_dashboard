'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'

interface AppShellProps {
  children: React.ReactNode
  user?: {
    name: string
    email: string
    role: 'ADMIN' | 'RECRUITER' | 'VIEWER'
  }
}

export function AppShell({ children, user }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-48 bg-gradient-to-b from-primary/10 to-transparent" />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="relative z-10 lg:pl-64">
        <TopBar user={user} onMenuClick={() => setSidebarOpen(true)} />

        <main className="mx-auto w-full max-w-[1480px] px-4 py-5 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
