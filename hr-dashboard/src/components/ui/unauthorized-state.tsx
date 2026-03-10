import { cn } from '@/lib/utils'
import { Lock } from 'lucide-react'
import Link from 'next/link'
import { Button } from './button'

interface UnauthorizedStateProps {
  message?: string
  className?: string
}

export function UnauthorizedState({
  message = "You don't have permission to access this page.",
  className,
}: UnauthorizedStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-4 py-12 text-center',
        className
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40 ring-1 ring-border/60">
        <Lock className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">
        Access Denied
      </h3>
      <p className="max-w-sm text-sm text-muted-foreground mb-4">{message}</p>
      <Link href="/">
        <Button variant="outline">Back to home</Button>
      </Link>
    </div>
  )
}
