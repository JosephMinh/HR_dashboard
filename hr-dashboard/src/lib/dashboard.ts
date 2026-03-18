import { ApplicationStage, type JobStatus, type PipelineHealth } from "@/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { ACTIVE_RECRUITING_STATUSES, HIRED_STATUSES } from "@/lib/status-config"

export interface CriticalJobSummary {
  id: string
  title: string
  department: string
  recruiterOwner: string | null
  targetFillDate: string | null
  pipelineHealth: PipelineHealth | null
  activeCandidateCount: number
}

export interface RecentJobSummary {
  id: string
  title: string
  department: string
  status: JobStatus
  pipelineHealth: PipelineHealth | null
  activeCandidateCount: number
  updatedAt: string
}

export interface DashboardStats {
  jobsOpen: number
  jobsClosed: number
  activeCriticalJobs: number
  activeCandidates: number
  pipelineHealth: {
    ahead: number
    onTrack: number
    behind: number
  }
  criticalJobs: CriticalJobSummary[]
  recentJobs: RecentJobSummary[]
}

const INACTIVE_APPLICATION_STAGES = [
  ApplicationStage.REJECTED,
  ApplicationStage.WITHDRAWN,
] as const

function sortCriticalJobs(
  left: { targetFillDate: Date | null; updatedAt: Date },
  right: { targetFillDate: Date | null; updatedAt: Date },
) {
  if (left.targetFillDate && right.targetFillDate) {
    const dateDelta = left.targetFillDate.getTime() - right.targetFillDate.getTime()
    if (dateDelta !== 0) {
      return dateDelta
    }
  } else if (left.targetFillDate) {
    return -1
  } else if (right.targetFillDate) {
    return 1
  }

  return right.updatedAt.getTime() - left.updatedAt.getTime()
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    jobsOpen,
    jobsClosed,
    activeCriticalJobs,
    openJobCandidateIds,
    jobsAhead,
    jobsOnTrack,
    jobsBehind,
    criticalJobs,
    recentJobs,
  ] = await prisma.$transaction([
    prisma.job.count({
      where: { status: { in: [...ACTIVE_RECRUITING_STATUSES] } },
    }),
    prisma.job.count({
      where: { status: { in: [...HIRED_STATUSES] } },
    }),
    prisma.job.count({
      where: { status: { in: [...ACTIVE_RECRUITING_STATUSES] }, isCritical: true },
    }),
    prisma.application.findMany({
      where: {
        job: {
          status: { in: [...ACTIVE_RECRUITING_STATUSES] },
        },
        stage: {
          notIn: [...INACTIVE_APPLICATION_STAGES],
        },
      },
      distinct: ["candidateId"],
      select: {
        candidateId: true,
      },
    }),
    prisma.job.count({
      where: {
        status: { in: [...ACTIVE_RECRUITING_STATUSES] },
        pipelineHealth: "AHEAD",
      },
    }),
    prisma.job.count({
      where: {
        status: { in: [...ACTIVE_RECRUITING_STATUSES] },
        pipelineHealth: "ON_TRACK",
      },
    }),
    prisma.job.count({
      where: {
        status: { in: [...ACTIVE_RECRUITING_STATUSES] },
        pipelineHealth: "BEHIND",
      },
    }),
    prisma.job.findMany({
      where: {
        status: { in: [...ACTIVE_RECRUITING_STATUSES] },
        isCritical: true,
      },
      select: {
        id: true,
        title: true,
        department: true,
        recruiterOwner: true,
        targetFillDate: true,
        pipelineHealth: true,
        updatedAt: true,
        applications: {
          where: {
            stage: {
              notIn: [...INACTIVE_APPLICATION_STAGES],
            },
          },
          select: {
            id: true,
          },
        },
      },
    }),
    prisma.job.findMany({
      where: {
        status: { in: [...ACTIVE_RECRUITING_STATUSES] },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        department: true,
        status: true,
        pipelineHealth: true,
        updatedAt: true,
        applications: {
          where: {
            stage: {
              notIn: [...INACTIVE_APPLICATION_STAGES],
            },
          },
          select: {
            id: true,
          },
        },
      },
    }),
  ])

  const topCriticalJobs = criticalJobs
    .sort(sortCriticalJobs)
    .slice(0, 10)
    .map((job) => ({
      id: job.id,
      title: job.title,
      department: job.department,
      recruiterOwner: job.recruiterOwner,
      targetFillDate: job.targetFillDate?.toISOString() ?? null,
      pipelineHealth: job.pipelineHealth,
      activeCandidateCount: job.applications.length,
    }))

  const recentJobsSummary = recentJobs.map((job) => ({
    id: job.id,
    title: job.title,
    department: job.department,
    status: job.status,
    pipelineHealth: job.pipelineHealth,
    activeCandidateCount: job.applications.length,
    updatedAt: job.updatedAt.toISOString(),
  }))

  return {
    jobsOpen,
    jobsClosed,
    activeCriticalJobs,
    activeCandidates: openJobCandidateIds.length,
    pipelineHealth: {
      ahead: jobsAhead,
      onTrack: jobsOnTrack,
      behind: jobsBehind,
    },
    criticalJobs: topCriticalJobs,
    recentJobs: recentJobsSummary,
  }
}
