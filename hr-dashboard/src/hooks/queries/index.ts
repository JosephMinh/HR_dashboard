/**
 * Query Hooks
 *
 * Re-exports all TanStack Query hooks for convenient importing.
 */

// Jobs
export {
  useJobsQuery,
  useJobFilterOptionsQuery,
  useJobQuery,
  useCreateJobMutation,
  useUpdateJobMutation,
  useDeleteJobMutation,
  type Job,
  type JobFilterField,
  type JobFilterOption,
  type JobFilterOptionsResponse,
  type JobServerFilterField,
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
} from './use-dashboard'

// Tradeoffs
export {
  useTradeoffsQuery,
  type Tradeoff,
  type TradeoffsResponse,
  type TradeoffJobSummary,
} from './use-tradeoffs'

// Headcount Projections
export {
  useHeadcountQuery,
  useHeadcountSummaryQuery,
  type HeadcountProjection,
  type HeadcountResponse,
  type HeadcountSummaryResponse,
  type HeadcountJobSummary,
} from './use-headcount'

// Users (admin)
export {
  useUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useResetPasswordMutation,
  type User,
  type UsersResponse,
  type CreateUserInput,
  type CreateUserResponse,
  type UpdateUserInput,
  type ResetPasswordResponse,
} from './use-users'
