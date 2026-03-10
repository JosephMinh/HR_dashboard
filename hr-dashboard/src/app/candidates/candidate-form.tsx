'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import {
  Briefcase,
  User,
  Building2,
  FileText,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ResumeUpload } from '@/components/ui/resume-upload'
import { CANDIDATE_SOURCE } from '@/lib/status-config'
import {
  useCreateCandidateMutation,
  useUpdateCandidateMutation,
  type CreateCandidateInput,
} from '@/hooks/queries'
import { useFormDirtyGuard, useFormFeedback } from '@/hooks/forms'
import { cn } from '@/lib/utils'

// Section wrapper for visual grouping
function FormSection({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-start gap-3 pb-2 border-b border-border/50">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="pl-11">{children}</div>
    </section>
  )
}

// Field validation schemas
const firstNameSchema = z.string().min(1, 'First name is required')
const lastNameSchema = z.string().min(1, 'Last name is required')
const emailSchema = z.string().email('Invalid email format').or(z.literal(''))
const linkedinUrlSchema = z.string().url('Invalid LinkedIn URL').or(z.literal(''))

interface CandidateFormValues {
  firstName: string
  lastName: string
  email: string
  phone: string
  linkedinUrl: string
  currentCompany: string
  location: string
  source: string
  notes: string
}

interface CandidateFormProps {
  initialData?: Partial<CandidateFormValues & { resumeKey: string | null; resumeName: string | null }>
  candidateId?: string
  mode: 'create' | 'edit'
  linkedJobId?: string
}

export function CandidateForm({ initialData, candidateId, mode, linkedJobId }: CandidateFormProps) {
  const router = useRouter()
  const createMutation = useCreateCandidateMutation()
  const updateMutation = useUpdateCandidateMutation()
  const [resumeUploadError, setResumeUploadError] = useState<string | null>(null)

  // Resume state managed separately (for async upload callbacks)
  const [resumeKey, setResumeKey] = useState<string | null>(initialData?.resumeKey ?? null)
  const [resumeName, setResumeName] = useState<string | null>(initialData?.resumeName ?? null)

  // Form feedback for success/error states
  const feedback = useFormFeedback({
    entityType: 'candidate',
    action: mode === 'create' ? 'create' : 'update',
  })

  const form = useForm({
    defaultValues: {
      firstName: initialData?.firstName ?? '',
      lastName: initialData?.lastName ?? '',
      email: initialData?.email ?? '',
      phone: initialData?.phone ?? '',
      linkedinUrl: initialData?.linkedinUrl ?? '',
      currentCompany: initialData?.currentCompany ?? '',
      location: initialData?.location ?? '',
      source: initialData?.source ?? '',
      notes: initialData?.notes ?? '',
    } satisfies CandidateFormValues,
    onSubmit: async ({ value }) => {
      feedback.setSubmitting()

      const payload: CreateCandidateInput = {
        firstName: value.firstName,
        lastName: value.lastName,
        email: value.email || undefined,
        phone: value.phone || undefined,
        linkedinUrl: value.linkedinUrl || undefined,
        currentCompany: value.currentCompany || undefined,
        location: value.location || undefined,
        source: value.source || undefined,
        notes: value.notes || undefined,
        resumeKey,
        resumeName,
        ...(mode === 'create' && linkedJobId ? { jobId: linkedJobId } : {}),
      }

      try {
        if (mode === 'create') {
          const result = await createMutation.mutateAsync(payload)
          feedback.setSuccess(`${value.firstName} ${value.lastName}`)
          if (linkedJobId) {
            router.push(`/jobs/${linkedJobId}?candidateAdded=${result.candidate.id}`)
          } else {
            router.push(`/candidates/${result.candidate.id}`)
          }
        } else {
          if (!candidateId) {
            throw new Error('Candidate ID is required for edit mode')
          }
          const result = await updateMutation.mutateAsync({ id: candidateId, ...payload })
          feedback.setSuccess(`${value.firstName} ${value.lastName}`)
          router.push(`/candidates/${result.id}`)
        }
      } catch (error) {
        feedback.setError(error instanceof Error ? error : undefined)
      }
    },
  })

  // Dirty state protection - warn before leaving with unsaved changes
  const cancelPath =
    mode === 'edit' && candidateId
      ? `/candidates/${candidateId}`
      : linkedJobId
        ? `/jobs/${linkedJobId}`
        : '/candidates'

  const { navigateWithGuard } = useFormDirtyGuard({
    enabled: form.state.isDirty && !feedback.isSubmitting,
    message: 'You have unsaved changes to this candidate. Are you sure you want to leave?',
  })

  const isSubmitting = feedback.isSubmitting
  const mutationError = createMutation.error || updateMutation.error
  const displayError = mutationError?.message || resumeUploadError

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void form.handleSubmit()
      }}
      className="space-y-8 max-w-2xl"
    >
      {/* Linked Job Context Banner */}
      {mode === 'create' && linkedJobId && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Briefcase className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Creating candidate for a job
            </p>
            <p className="text-sm text-muted-foreground">
              This candidate will be added to the job pipeline. After saving, you will return to the job and the
              candidate will be highlighted.
            </p>
          </div>
        </div>
      )}

      {/* Error Display */}
      {displayError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{displayError}</span>
        </div>
      )}

      {/* Section 1: Identity & Contact */}
      <FormSection
        icon={User}
        title="Identity & Contact"
        description="Basic information to identify and reach this candidate"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <form.Field
              name="firstName"
              validators={{
                onBlur: ({ value }) => {
                  const result = firstNameSchema.safeParse(value)
                  return result.success ? undefined : result.error.issues[0]?.message ?? 'Invalid'
                },
              }}
            >
              {(field) => {
                const hasError = field.state.meta.errors.length > 0
                return (
                  <div className="space-y-2">
                    <Label htmlFor="firstName">
                      First Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="firstName"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="e.g. John"
                      aria-required="true"
                      aria-invalid={hasError}
                      aria-describedby={hasError ? 'firstName-error' : undefined}
                    />
                    {hasError && (
                      <p id="firstName-error" className="text-xs text-destructive" role="alert">
                        {String(field.state.meta.errors[0])}
                      </p>
                    )}
                  </div>
                )
              }}
            </form.Field>

            <form.Field
              name="lastName"
              validators={{
                onBlur: ({ value }) => {
                  const result = lastNameSchema.safeParse(value)
                  return result.success ? undefined : result.error.issues[0]?.message ?? 'Invalid'
                },
              }}
            >
              {(field) => {
                const hasError = field.state.meta.errors.length > 0
                return (
                  <div className="space-y-2">
                    <Label htmlFor="lastName">
                      Last Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="lastName"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="e.g. Doe"
                      aria-required="true"
                      aria-invalid={hasError}
                      aria-describedby={hasError ? 'lastName-error' : undefined}
                    />
                    {hasError && (
                      <p id="lastName-error" className="text-xs text-destructive" role="alert">
                        {String(field.state.meta.errors[0])}
                      </p>
                    )}
                  </div>
                )
              }}
            </form.Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <form.Field
              name="email"
              validators={{
                onBlur: ({ value }) => {
                  if (!value) return undefined
                  const result = emailSchema.safeParse(value)
                  return result.success ? undefined : result.error.issues[0]?.message ?? 'Invalid'
                },
              }}
            >
              {(field) => {
                const hasError = field.state.meta.errors.length > 0
                return (
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="e.g. john@example.com"
                      aria-invalid={hasError}
                      aria-describedby={hasError ? 'email-error' : undefined}
                    />
                    {hasError && (
                      <p id="email-error" className="text-xs text-destructive" role="alert">
                        {String(field.state.meta.errors[0])}
                      </p>
                    )}
                  </div>
                )
              }}
            </form.Field>

            <form.Field name="phone">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="e.g. +1 (555) 123-4567"
                  />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field
            name="linkedinUrl"
            validators={{
              onBlur: ({ value }) => {
                if (!value) return undefined
                const result = linkedinUrlSchema.safeParse(value)
                return result.success ? undefined : result.error.issues[0]?.message ?? 'Invalid'
              },
            }}
          >
            {(field) => {
              const hasError = field.state.meta.errors.length > 0
              return (
                <div className="space-y-2">
                  <Label htmlFor="linkedinUrl">LinkedIn Profile</Label>
                  <Input
                    id="linkedinUrl"
                    type="url"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="e.g. https://linkedin.com/in/johndoe"
                    aria-invalid={hasError}
                    aria-describedby={hasError ? 'linkedinUrl-error' : undefined}
                  />
                  {hasError && (
                    <p id="linkedinUrl-error" className="text-xs text-destructive" role="alert">
                      {String(field.state.meta.errors[0])}
                    </p>
                  )}
                </div>
              )
            }}
          </form.Field>
        </div>
      </FormSection>

      {/* Section 2: Professional Background */}
      <FormSection
        icon={Building2}
        title="Professional Background"
        description="Current role and how you found this candidate"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <form.Field name="currentCompany">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="currentCompany">Current Company</Label>
                  <Input
                    id="currentCompany"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="e.g. Acme Inc"
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="location">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="e.g. San Francisco, CA"
                  />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="source">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="source">Sourcing Channel</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value ?? '')}
                >
                  <SelectTrigger id="source" className="w-full sm:w-[280px]">
                    <SelectValue placeholder="How did you find this candidate?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Not specified</SelectItem>
                    {Object.entries(CANDIDATE_SOURCE).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Tracking source helps measure recruiting channel effectiveness
                </p>
              </div>
            )}
          </form.Field>
        </div>
      </FormSection>

      {/* Section 3: Documents & Notes */}
      <FormSection
        icon={FileText}
        title="Documents & Notes"
        description="Resume and any additional context about this candidate"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Resume</Label>
            <ResumeUpload
              currentResume={resumeKey && resumeName ? { key: resumeKey, name: resumeName } : null}
              onUploadComplete={(key, name) => {
                setResumeKey(key)
                setResumeName(name)
              }}
              onError={(err) => setResumeUploadError(err)}
              disabled={isSubmitting}
            />
          </div>

          <form.Field name="notes">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Key qualifications, interview notes, or anything else relevant..."
                  rows={4}
                  className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  These notes are visible to all team members
                </p>
              </div>
            )}
          </form.Field>
        </div>
      </FormSection>

      {/* Form Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-border/50">
        <Button type="submit" disabled={isSubmitting} className="min-w-[140px]">
          {feedback.isSubmitting
            ? 'Saving...'
            : feedback.isSuccess
              ? 'Saved!'
              : mode === 'create'
                ? linkedJobId
                  ? 'Create & Return'
                  : 'Create Candidate'
                : 'Save Changes'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigateWithGuard(cancelPath)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        {mode === 'create' && linkedJobId && (
          <span className="ml-auto text-xs text-muted-foreground">
            Returns to the job with the new candidate highlighted
          </span>
        )}
      </div>
    </form>
  )
}
