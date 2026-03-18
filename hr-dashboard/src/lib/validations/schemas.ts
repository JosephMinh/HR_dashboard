/**
 * Zod schema definitions for API validation.
 * These schemas provide type-safe runtime validation for API inputs.
 */

import z from 'zod'

// Enums matching Prisma schema
export const JobStatus = z.enum(['OPEN', 'OFFER', 'AGENCY', 'HIRED', 'HIRED_CW', 'NOT_STARTED', 'UNKNOWN'])
export const JobPriority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export const PipelineHealth = z.enum(['AHEAD', 'ON_TRACK', 'BEHIND'])
export const Horizon = z.enum(['2026', 'Beyond 2026'])
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

// WFP metadata fields shared between create and update schemas.
// Provenance fields (importKey, sourceSheet, sourceRow, tempJobId) are
// excluded — they are set only by the WFP importer, never via the API.
const wfpMutableFields = {
  function: z.string().optional().nullable(),
  employeeType: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  functionalPriority: z.string().optional().nullable(),
  corporatePriority: z.string().optional().nullable(),
  asset: z.string().optional().nullable(),
  keyCapability: z.string().optional().nullable(),
  businessRationale: z.string().optional().nullable(),
  milestone: z.string().optional().nullable(),
  talentAssessment: z.string().optional().nullable(),
  horizon: Horizon.optional().nullable(),
  isTradeoff: z.boolean().optional(),
  recruitingStatus: z.string().optional().nullable(),
  fpaLevel: z.string().optional().nullable(),
  fpaTiming: z.string().optional().nullable(),
  fpaNote: z.string().optional().nullable(),
  fpaApproved: z.string().optional().nullable(),
  hiredName: z.string().optional().nullable(),
  hibobId: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
}

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
    ...wfpMutableFields,
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
      const activeStatuses = new Set(['OPEN', 'OFFER', 'AGENCY'])
      if (activeStatuses.has(data.status)) {
        return data.pipelineHealth !== null && data.pipelineHealth !== undefined
      }
      return true
    },
    {
      message: 'Pipeline health is required for active recruiting jobs',
      path: ['pipelineHealth'],
    }
  )

// Partial job schema for updates (defined without refinements to allow partial).
// Provenance fields (importKey, sourceSheet, sourceRow, tempJobId) are immutable.
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
  ...wfpMutableFields,
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
  recruiterOwner: z.string().max(100, 'Recruiter owner must be at most 100 characters').optional().nullable(),
  interviewNotes: z.string().max(50000, 'Interview notes must be at most 50000 characters').optional().nullable(),
})

// Partial application schema for updates
export const ApplicationUpdateSchema = ApplicationSchema.partial().omit({ jobId: true, candidateId: true })

const RESUME_CONTENT_TYPES = {
  pdf: ['application/pdf'],
  doc: ['application/msword', 'application/vnd.ms-word'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  txt: ['text/plain'],
  rtf: ['application/rtf', 'text/rtf'],
} as const

const GENERIC_BINARY_CONTENT_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
])

function getResumeExtension(filename: string): keyof typeof RESUME_CONTENT_TYPES | null {
  const extension = filename.split('.').pop()?.trim().toLowerCase() ?? ''
  return extension in RESUME_CONTENT_TYPES
    ? (extension as keyof typeof RESUME_CONTENT_TYPES)
    : null
}

function normalizeContentType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() || ''
}

// Maximum resume size in bytes (10MB) - matches storage.ts MAX_RESUME_SIZE_BYTES
const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024

// Resume upload schema - aligned with /api/upload/resume route contract
// Accepts: PDF, DOC, DOCX, TXT, RTF
export const ResumeUploadSchema = z
  .object({
    filename: z.string().min(1, 'Filename is required'),
    contentType: z.string().optional(),
    sizeBytes: z
      .number()
      .int('File size must be a whole number')
      .positive('File size must be positive')
      .max(MAX_RESUME_SIZE_BYTES, 'File size must be less than 10MB'),
  })
  .superRefine((data, ctx) => {
    const extension = getResumeExtension(data.filename)

    if (!extension) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['filename'],
        message: 'Invalid file type. Accepted: PDF, DOC, DOCX, TXT, RTF',
      })
      return
    }

    if (!data.contentType) {
      return
    }

    const normalizedContentType = normalizeContentType(data.contentType)
    if (GENERIC_BINARY_CONTENT_TYPES.has(normalizedContentType)) {
      return
    }

    const allowedContentTypes = RESUME_CONTENT_TYPES[extension]
    if (!allowedContentTypes.some((contentType) => contentType === normalizedContentType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contentType'],
        message: 'Content type does not match filename extension',
      })
    }
  })

// Tradeoff row types matching import data
export const TradeoffRowType = z.enum(['PAIR', 'SOURCE_ONLY', 'NOTE'])

// Headcount projection filter for matched status
export const MatchedStatus = z.enum(['matched', 'unmatched'])

// Type inference
export type Job = z.infer<typeof JobSchema>
export type JobUpdate = z.infer<typeof JobUpdateSchema>
export type Candidate = z.infer<typeof CandidateSchema>
export type CandidateUpdate = z.infer<typeof CandidateUpdateSchema>
export type Application = z.infer<typeof ApplicationSchema>
export type ApplicationUpdate = z.infer<typeof ApplicationUpdateSchema>
export type ResumeUpload = z.infer<typeof ResumeUploadSchema>
