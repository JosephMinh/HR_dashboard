/**
 * Query Hooks
 *
 * Re-exports all TanStack Query hooks for convenient importing.
 */

// Jobs
export {
  useJobsQuery,
  useJobQuery,
  useCreateJobMutation,
  useUpdateJobMutation,
  useDeleteJobMutation,
  type Job,
  type JobsResponse,
  type CreateJobInput,
  type UpdateJobInput,
} from './use-jobs'

// Candidates
export {
  useCandidatesQuery,
  useCandidateQuery,
  useCreateCandidateMutation,
  useUpdateCandidateMutation,
  useDeleteCandidateMutation,
  type Candidate,
  type CandidatesResponse,
  type CreateCandidateInput,
  type UpdateCandidateInput,
} from './use-candidates'

// Applications
export {
  useCreateApplicationMutation,
  useUpdateApplicationMutation,
  useDeleteApplicationMutation,
  type ApplicationResponse,
  type CreateApplicationInput,
  type UpdateApplicationInput,
  type DeleteApplicationInput,
} from './use-applications'

// Dashboard
export {
  useDashboardStatsQuery,
  type DashboardStats,
  type PipelineStageCount,
  type TopJob,
  type ActivityItem,
} from './use-dashboard'
