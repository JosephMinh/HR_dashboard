'use client'

import { useRouter } from 'next/navigation'
import { useForm } from '@tanstack/react-form'
import * as z from 'zod'
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
import { createZodFormOptions } from '@/hooks/forms'
import { JOB_STATUS, JOB_PRIORITY, PIPELINE_HEALTH } from '@/lib/status-config'
import {
  useCreateJobMutation,
  useUpdateJobMutation,
  type CreateJobInput,
} from '@/hooks/queries'

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

  const form = useForm({
    ...createZodFormOptions(jobFormSchema),
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

      const result =
        mode === 'create'
          ? await createMutation.mutateAsync(payload)
          : await updateMutation.mutateAsync({ id: jobId!, ...payload })

      router.push(`/jobs/${result.id}`)
    },
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending
  const mutationError = createMutation.error || updateMutation.error
  const cancelPath = mode === 'edit' && jobId ? `/jobs/${jobId}` : '/jobs'
  let submitLabel = 'Save Changes'
  if (isSubmitting) {
    submitLabel = 'Saving...'
  } else if (mode === 'create') {
    submitLabel = 'Create Job'
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void form.handleSubmit()
      }}
      className="max-w-3xl space-y-6"
    >
      {mutationError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {mutationError.message}
        </div>
      )}

      <div className="space-y-4">
        <form.Field
          name="title"
          validators={{
            onBlur: ({ value }) => validateField(titleSchema, value),
            onSubmit: ({ value }) => validateField(titleSchema, value),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="title">Job Title *</Label>
              <Input
                id="title"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="e.g. Senior Software Engineer"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">{String(field.state.meta.errors[0])}</p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="department"
          validators={{
            onBlur: ({ value }) => validateField(departmentSchema, value),
            onSubmit: ({ value }) => validateField(departmentSchema, value),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="department">Department *</Label>
              <Select
                value={field.state.value}
                onValueChange={(value) => field.handleChange(value ?? '')}
              >
                <SelectTrigger className="w-full">
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
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">{String(field.state.meta.errors[0])}</p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field
          name="description"
          validators={{
            onBlur: ({ value }) => validateField(descriptionSchema, value),
            onSubmit: ({ value }) => validateField(descriptionSchema, value),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <textarea
                id="description"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Job description and requirements..."
                rows={5}
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">{String(field.state.meta.errors[0])}</p>
              )}
            </div>
          )}
        </form.Field>

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
            {(field) => (
              <div className="space-y-2">
                <Label>Pipeline Health</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value ?? '')}
                >
                  <SelectTrigger>
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
                {field.state.meta.errors.length > 0 && (
                  <p className="text-xs text-destructive">{String(field.state.meta.errors[0])}</p>
                )}
              </div>
            )}
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
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isCritical" className="text-sm font-normal">
                Mark as critical hire
              </Label>
            </div>
          )}
        </form.Field>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
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
