import { cn } from '@/lib/utils'

interface FormFieldErrorProps {
  error?: string | null
  touched?: boolean
  className?: string
}

export function FormFieldError({ error, touched = true, className }: FormFieldErrorProps) {
  if (!touched || !error) {
    return null
  }

  return (
    <p role="alert" className={cn('text-sm text-destructive', className)}>
      {error}
    </p>
  )
}
