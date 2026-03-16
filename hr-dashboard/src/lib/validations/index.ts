/**
 * Validations module - re-exports all validation functions and schemas.
 *
 * This module is split for better testability:
 * - functions.ts: Simple validation functions (isValidUUID, isValidEmail) - easy to mock
 * - schemas.ts: Zod schema definitions - can be used without mocking
 *
 * Usage:
 *   // Import everything (backwards compatible)
 *   import { isValidUUID, JobSchema } from '@/lib/validations'
 *
 *   // Or import from specific modules for better test isolation
 *   import { isValidUUID } from '@/lib/validations/functions'
 *   import { JobSchema } from '@/lib/validations/schemas'
 */

// Re-export validation functions
export { isValidUUID, isValidEmail } from './functions'

// Re-export password policy
export {
  PasswordSchema,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS,
  getUnmetRequirements,
  generateTempPassword,
} from './password'

// Re-export schemas and enums
export {
  // Enums
  JobStatus,
  JobPriority,
  PipelineHealth,
  CandidateSource,
  ApplicationStage,
  // Job schemas
  JobSchema,
  JobUpdateSchema,
  // Candidate schemas
  CandidateSchema,
  CandidateUpdateSchema,
  // Application schemas
  ApplicationSchema,
  ApplicationUpdateSchema,
  // Resume schema
  ResumeUploadSchema,
  // Types
  type Job,
  type JobUpdate,
  type Candidate,
  type CandidateUpdate,
  type Application,
  type ApplicationUpdate,
  type ResumeUpload,
} from './schemas'
