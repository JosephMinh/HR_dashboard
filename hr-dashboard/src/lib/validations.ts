import { z } from 'zod'

// Enums matching Prisma schema
export const JobStatus = z.enum(['OPEN', 'CLOSED', 'ON_HOLD'])
export const JobPriority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export const PipelineHealth = z.enum(['AHEAD', 'ON_TRACK', 'BEHIND'])
export const CandidateSource = z.enum(['REFERRAL', 'LINKEDIN', 'CAREERS_PAGE', 'AGENCY', 'OTHER'])
export const ApplicationStage = z.enum([
  'NEW',
  'SCREENING',
  'INTERVIEWING',
  'FINAL_ROUND',
  'OFFER',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
])

// Job schema
export const JobSchema = z
  .object({
    title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title must be at most 200 characters'),
    department: z.string().min(1, 'Department is required'),
    description: z.string().min(10, 'Description must be at least 10 characters'),
    location: z.string().optional().nullable(),
    hiringManager: z.string().optional().nullable(),
    recruiterOwner: z.string().optional().nullable(),
    status: JobStatus.default('OPEN'),
    priority: JobPriority.default('MEDIUM'),
    pipelineHealth: PipelineHealth.optional().nullable(),
    isCritical: z.boolean().default(false),
    openedAt: z.coerce.date().optional().nullable(),
    targetFillDate: z.coerce.date().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.openedAt && data.targetFillDate) {
        return data.targetFillDate >= data.openedAt
      }
      return true
    },
    {
      message: 'Target fill date must be on or after opened date',
      path: ['targetFillDate'],
    }
  )
  .refine(
    (data) => {
      if (data.status === 'OPEN') {
        return data.pipelineHealth !== null && data.pipelineHealth !== undefined
      }
      return true
    },
    {
      message: 'Pipeline health is required for open jobs',
      path: ['pipelineHealth'],
    }
  )

// Partial job schema for updates (defined without refinements to allow partial)
export const JobUpdateSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title must be at most 200 characters').optional(),
  department: z.string().min(1, 'Department is required').optional(),
  description: z.string().min(10, 'Description must be at least 10 characters').optional(),
  location: z.string().optional().nullable(),
  hiringManager: z.string().optional().nullable(),
  recruiterOwner: z.string().optional().nullable(),
  status: JobStatus.optional(),
  priority: JobPriority.optional(),
  pipelineHealth: PipelineHealth.optional().nullable(),
  isCritical: z.boolean().optional(),
  openedAt: z.coerce.date().optional().nullable(),
  targetFillDate: z.coerce.date().optional().nullable(),
})

// Candidate schema
export const CandidateSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email format').optional().nullable(),
  phone: z.string().optional().nullable(),
  linkedinUrl: z.string().url('Invalid LinkedIn URL').optional().nullable(),
  currentCompany: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  source: CandidateSource.optional().nullable(),
  notes: z.string().optional().nullable(),
})

// Partial candidate schema for updates
export const CandidateUpdateSchema = CandidateSchema.partial()

// Application schema
export const ApplicationSchema = z.object({
  jobId: z.string().uuid('Invalid job ID'),
  candidateId: z.string().uuid('Invalid candidate ID'),
  stage: ApplicationStage.default('NEW'),
  recruiterOwner: z.string().optional().nullable(),
  interviewNotes: z.string().optional().nullable(),
})

// Partial application schema for updates
export const ApplicationUpdateSchema = ApplicationSchema.partial().omit({ jobId: true, candidateId: true })

// Resume upload schema
export const ResumeUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  contentType: z.string().refine(
    (type) => ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(type),
    { message: 'Only PDF and DOCX files are allowed' }
  ),
  size: z.number().max(10485760, 'File size must be less than 10MB'),
})

// Type inference
export type Job = z.infer<typeof JobSchema>
export type JobUpdate = z.infer<typeof JobUpdateSchema>
export type Candidate = z.infer<typeof CandidateSchema>
export type CandidateUpdate = z.infer<typeof CandidateUpdateSchema>
export type Application = z.infer<typeof ApplicationSchema>
export type ApplicationUpdate = z.infer<typeof ApplicationUpdateSchema>
export type ResumeUpload = z.infer<typeof ResumeUploadSchema>
