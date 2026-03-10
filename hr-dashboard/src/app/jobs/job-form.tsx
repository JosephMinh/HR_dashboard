'use client'

import { useRouter } from 'next/navigation'
import { useForm } from '@tanstack/react-form'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createZodFormOptions, useFormDirtyGuard, useFormFeedback, getSubmitLabel } from '@/hooks/forms'
import { JOB_STATUS, JOB_PRIORITY, PIPELINE_HEALTH } from '@/lib/status-config'
import {
  useCreateJobMutation,
  useUpdateJobMutation,
  type CreateJobInput,
} from '@/hooks/queries'
import { CheckCircle2, Circle } from 'lucide-react'

// Field validation schemas
const titleSchema = z.string().min(3, 'Title must be at least 3 characters').max(200)
const departmentSchema = z.string().min(1, 'Department is required')
const descriptionSchema = z.string().min(10, 'Description must be at least 10 characters')

// Validator helper that returns error message or undefined
function validateField<T>(schema: z.ZodType<T>, value: unknown): string | undefined {
  const result = schema.safeParse(value)
  return result.success ? undefined : result.error.issues[0]?.message ?? 'Invalid'
}
const jobFormSchema = z
  .object({
    title: titleSchema,
    department: departmentSchema,
    description: descriptionSchema,
    location: z.string(),
    hiringManager: z.string(),
    recruiterOwner: z.string(),
    status: z.string(),
    priority: z.string(),
    pipelineHealth: z.string(),
    isCritical: z.boolean(),
    targetFillDate: z.string(),
  })
  .superRefine((value, context) => {
    if (value.status === 'OPEN' && value.pipelineHealth.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pipeline health is required for open jobs',
        path: ['pipelineHealth'],
      })
    }
  })

interface JobFormValues {
  title: string
  department: string
  description: string
  location: string
  hiringManager: string
  recruiterOwner: string
  status: string
  priority: string
  pipelineHealth: string
  isCritical: boolean
  targetFillDate: string
}

interface JobFormProps {
  initialData?: Partial<JobFormValues>
  jobId?: string
  mode: 'create' | 'edit'
}

const DEPARTMENTS = [
  'Engineering',
  'Product',
  'Design',
  'Marketing',
  'Sales',
  'Operations',
  'Human Resources',
  'Finance',
  'Legal',
  'Customer Support',
]

export function JobForm({ initialData, jobId, mode }: JobFormProps) {
  const router = useRouter()
  const createMutation = useCreateJobMutation()
  const updateMutation = useUpdateJobMutation()

  // Form feedback for success/error states
  const feedback = useFormFeedback({
    entityType: 'job',
    action: mode === 'create' ? 'create' : 'update',
  })

  const form = useForm({
    ...createZodFormOptions(jobFormSchema, { timing: 'standard' }),
    defaultValues: {
      title: initialData?.title ?? '',
      department: initialData?.department ?? '',
      description: initialData?.description ?? '',
      location: initialData?.location ?? '',
      hiringManager: initialData?.hiringManager ?? '',
      recruiterOwner: initialData?.recruiterOwner ?? '',
      status: initialData?.status ?? 'OPEN',
      priority: initialData?.priority ?? 'MEDIUM',
      pipelineHealth: initialData?.pipelineHealth ?? '',
      isCritical: initialData?.isCritical ?? false,
      targetFillDate: initialData?.targetFillDate ?? '',
    } satisfies JobFormValues,
    onSubmit: async ({ value }) => {
      feedback.setSubmitting()

      const payload: CreateJobInput = {
        title: value.title,
        department: value.department,
        description: value.description,
        location: value.location || undefined,
        hiringManager: value.hiringManager || undefined,
        recruiterOwner: value.recruiterOwner || undefined,
        status: value.status,
        priority: value.priority,
        pipelineHealth: value.pipelineHealth || undefined,
        isCritical: value.isCritical,
        targetFillDate: value.targetFillDate || undefined,
      }

      try {
        let result
        if (mode === 'create') {
          result = await createMutation.mutateAsync(payload)
        } else {
          if (!jobId) {
            throw new Error('Job ID is required for edit mode')
          }
          result = await updateMutation.mutateAsync({ id: jobId, ...payload })
        }

        feedback.setSuccess(value.title)
        router.push(`/jobs/${result.id}`)
      } catch (error) {
        feedback.setError(error instanceof Error ? error : undefined)
      }
    },
  })

  // Dirty state protection - warn before leaving with unsaved changes
  const cancelPath = mode === 'edit' && jobId ? `/jobs/${jobId}` : '/jobs'
  const { navigateWithGuard } = useFormDirtyGuard({
    enabled: form.state.isDirty && !feedback.isSubmitting,
    message: 'You have unsaved changes to this job. Are you sure you want to leave?',
  })

  const isSubmitting = feedback.isSubmitting
  const mutationError = createMutation.error || updateMutation.error
  const submitLabel = getSubmitLabel(feedback.status, mode === 'create' ? 'create' : 'update', 'Job')

  const values = form.state.values
  const completionItems = [
    {
      label: 'Job title',
      complete: values.title.trim().length >= 3,
    },
    {
      label: 'Department',
      complete: values.department.trim().length > 0,
    },
    {
      label: 'Description',
      complete: values.description.trim().length >= 10,
    },
    {
      label: 'Pipeline health',
      complete: values.status !== 'OPEN' || values.pipelineHealth.trim().length > 0,
      optional: values.status !== 'OPEN',
    },
  ]
  const completedCount = completionItems.filter((item) => item.complete).length

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void form.handleSubmit()
      }}
      className="max-w-3xl space-y-8"
    >
      {mutationError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {mutationError.message}
        </div>
      )}

      <div className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-premium-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Completion</p>
            <p className="text-xs text-muted-foreground">
              Required fields to publish a clean opening.
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {completedCount}/{completionItems.length} required
          </Badge>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {completionItems.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              {item.complete ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={item.complete ? 'text-foreground' : 'text-muted-foreground'}>
                {item.label}
                {item.optional ? ' (optional)' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      <section className="space-y-4 rounded-xl border border-border/70 bg-card/60 p-5 shadow-premium-xs">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Role basics</h2>
          <p className="text-xs text-muted-foreground">
            Define the role and the responsibilities candidates will see first.
          </p>
        </div>

        <form.Field
          name="title"
          validators={{
            onBlur: ({ value }) => validateField(titleSchema, value),
            onSubmit: ({ value }) => validateField(titleSchema, value),
          }}
        >
          {(field) => {
            const hasError = field.state.meta.errors.length > 0
            return (
              <div className="space-y-2">
                <Label htmlFor="title">Job Title *</Label>
                <Input
                  id="title"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. Senior Software Engineer"
                  aria-required="true"
                  aria-invalid={hasError}
                  aria-describedby={hasError ? 'title-error' : 'title-hint'}
                />
                <p id="title-hint" className="text-xs text-muted-foreground">
                  Use the candidate-facing role title.
                </p>
                {hasError && (
                  <p id="title-error" role="alert" className="text-xs text-destructive">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
              </div>
            )
          }}
        </form.Field>

        <form.Field
          name="department"
          validators={{
            onBlur: ({ value }) => validateField(departmentSchema, value),
            onSubmit: ({ value }) => validateField(departmentSchema, value),
          }}
        >
          {(field) => {
            const hasError = field.state.meta.errors.length > 0
            return (
              <div className="space-y-2">
                <Label htmlFor="department">Department *</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value ?? '')}
                  required
                >
                  <SelectTrigger
                    id="department"
                    className="w-full"
                    aria-required="true"
                    aria-invalid={hasError}
                    aria-describedby={hasError ? 'department-error' : undefined}
                  >
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasError && (
                  <p id="department-error" role="alert" className="text-xs text-destructive">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
              </div>
            )
          }}
        </form.Field>

        <form.Field
          name="description"
          validators={{
            onBlur: ({ value }) => validateField(descriptionSchema, value),
            onSubmit: ({ value }) => validateField(descriptionSchema, value),
          }}
        >
          {(field) => {
            const hasError = field.state.meta.errors.length > 0
            return (
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <textarea
                  id="description"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Job description and requirements..."
                  rows={5}
                  aria-required="true"
                  aria-invalid={hasError}
                  aria-describedby={hasError ? 'description-error' : 'description-hint'}
                  className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p id="description-hint" className="text-xs text-muted-foreground">
                  Highlight scope, key responsibilities, and success criteria.
                </p>
                {hasError && (
                  <p id="description-error" role="alert" className="text-xs text-destructive">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
              </div>
            )
          }}
        </form.Field>
      </section>

      <section className="space-y-4 rounded-xl border border-border/70 bg-card/60 p-5 shadow-premium-xs">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Planning & ownership</h2>
          <p className="text-xs text-muted-foreground">
            Clarify who owns the search and the target timeline.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <form.Field name="targetFillDate">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="targetFillDate">Target Fill Date</Label>
                <Input
                  id="targetFillDate"
                  type="date"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                <p className="text-xs text-muted-foreground">
                  Optional, used for urgency and planning cues.
                </p>
              </div>
            )}
          </form.Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <form.Field name="hiringManager">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="hiringManager">Hiring Manager</Label>
                <Input
                  id="hiringManager"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. John Doe"
                />
              </div>
            )}
          </form.Field>

          <form.Field name="recruiterOwner">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="recruiterOwner">Recruiter Owner</Label>
                <Input
                  id="recruiterOwner"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="e.g. Jane Smith"
                />
              </div>
            )}
          </form.Field>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border/70 bg-card/60 p-5 shadow-premium-xs">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Pipeline & priority</h2>
          <p className="text-xs text-muted-foreground">
            Set urgency signals and define how the role appears in reporting.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <form.Field name="status">
            {(field) => (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value ?? 'OPEN')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(JOB_STATUS).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field name="priority">
            {(field) => (
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value ?? 'MEDIUM')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(JOB_PRIORITY).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field
            name="pipelineHealth"
            validators={{
              onSubmit: ({ value, fieldApi }) => {
                const status = fieldApi.form.getFieldValue('status')
                if (status === 'OPEN' && !value) {
                  return 'Pipeline health is required for open jobs'
                }
                return undefined
              },
            }}
          >
            {(field) => {
              const hasError = field.state.meta.errors.length > 0
              return (
                <div className="space-y-2">
                  <Label htmlFor="pipelineHealth">Pipeline Health</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value ?? '')}
                  >
                    <SelectTrigger
                      id="pipelineHealth"
                      aria-invalid={hasError}
                      aria-describedby={hasError ? 'pipelineHealth-error' : 'pipelineHealth-hint'}
                    >
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Not set</SelectItem>
                      {Object.entries(PIPELINE_HEALTH).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p id="pipelineHealth-hint" className="text-xs text-muted-foreground">
                    Required when the status is Open.
                  </p>
                  {hasError && (
                    <p id="pipelineHealth-error" role="alert" className="text-xs text-destructive">
                      {String(field.state.meta.errors[0])}
                    </p>
                  )}
                </div>
              )
            }}
          </form.Field>
        </div>

        <form.Field name="isCritical">
          {(field) => (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isCritical"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Label htmlFor="isCritical" className="text-sm font-normal">
                Mark as critical hire
              </Label>
            </div>
          )}
        </form.Field>
      </section>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigateWithGuard(cancelPath)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
