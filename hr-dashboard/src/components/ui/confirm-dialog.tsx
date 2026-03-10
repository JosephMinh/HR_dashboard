'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { Button } from './button'
import { AlertTriangle, Trash2, CheckCircle2, Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type ConfirmVariant = 'default' | 'destructive' | 'warning'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
  icon?: LucideIcon
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

// Visual treatment based on variant
const variantConfig: Record<ConfirmVariant, {
  icon: LucideIcon
  iconBg: string
  iconColor: string
  buttonVariant: 'default' | 'destructive' | 'outline'
}> = {
  default: {
    icon: CheckCircle2,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    buttonVariant: 'default',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-50 dark:bg-amber-950/50',
    iconColor: 'text-amber-600 dark:text-amber-400',
    buttonVariant: 'default',
  },
  destructive: {
    icon: Trash2,
    iconBg: 'bg-red-50 dark:bg-red-950/50',
    iconColor: 'text-red-600 dark:text-red-400',
    buttonVariant: 'destructive',
  },
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  icon: CustomIcon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const config = variantConfig[variant]
  const IconComponent = CustomIcon ?? config.icon

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isLoading && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex flex-col items-center text-center sm:items-start sm:text-left">
          {/* Icon with variant-based styling */}
          <div
            className={cn(
              'mb-4 flex h-12 w-12 items-center justify-center rounded-xl',
              config.iconBg
            )}
          >
            <IconComponent className={cn('h-6 w-6', config.iconColor)} />
          </div>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={config.buttonVariant}
            onClick={handleConfirm}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Convenience wrapper for delete confirmations
export function DeleteConfirmDialog({
  open,
  entityName,
  entityType = 'item',
  onConfirm,
  onCancel,
}: {
  open: boolean
  entityName: string
  entityType?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}) {
  return (
    <ConfirmDialog
      open={open}
      variant="destructive"
      title={`Delete ${entityType}?`}
      message={`Are you sure you want to delete "${entityName}"? This action cannot be undone.`}
      confirmLabel="Delete"
      cancelLabel="Keep it"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
