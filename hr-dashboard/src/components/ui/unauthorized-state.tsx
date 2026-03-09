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
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      <div className="rounded-full bg-muted p-4 mb-4">
        <Lock className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">Access Denied</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{message}</p>
      <Link href="/">
        <Button variant="outline">Back to home</Button>
      </Link>
    </div>
  )
}
