'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Briefcase } from 'lucide-react'
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

      if (mode === 'create') {
        const result = await createMutation.mutateAsync(payload)
        if (linkedJobId) {
          router.push(`/jobs/${linkedJobId}`)
        } else {
          router.push(`/candidates/${result.candidate.id}`)
        }
      } else {
        const result = await updateMutation.mutateAsync({ id: candidateId!, ...payload })
        router.push(`/candidates/${result.id}`)
      }
    },
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error || updateMutation.error
  const displayError = mutationError?.message || resumeUploadError

  const cancelPath =
    mode === 'edit' && candidateId
      ? `/candidates/${candidateId}`
      : linkedJobId
        ? `/jobs/${linkedJobId}`
        : '/candidates'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void form.handleSubmit()
      }}
      className="space-y-6 max-w-2xl"
    >
      {mode === 'create' && linkedJobId ? (
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <Briefcase className="mt-0.5 h-4 w-4 text-primary" />
          <p className="text-muted-foreground">
            This candidate will be automatically added to the selected job after creation.
          </p>
        </div>
      ) : null}

      {displayError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {displayError}
        </div>
      )}

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
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. John"
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-xs text-destructive">{String(field.state.meta.errors[0])}</p>
                )}
              </div>
            )}
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
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. Doe"
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-xs text-destructive">{String(field.state.meta.errors[0])}</p>
                )}
              </div>
            )}
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
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. john@example.com"
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-xs text-destructive">{String(field.state.meta.errors[0])}</p>
                )}
              </div>
            )}
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
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
              <Input
                id="linkedinUrl"
                type="url"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="e.g. https://linkedin.com/in/johndoe"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">{String(field.state.meta.errors[0])}</p>
              )}
            </div>
          )}
        </form.Field>

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
              <Label>Source</Label>
              <Select
                value={field.state.value}
                onValueChange={(value) => field.handleChange(value ?? '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select source" />
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
            </div>
          )}
        </form.Field>

        <form.Field name="notes">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Additional notes about the candidate..."
                rows={4}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          )}
        </form.Field>

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
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create Candidate' : 'Save Changes'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(cancelPath)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
