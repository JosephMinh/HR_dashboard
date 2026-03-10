"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  Loader2,
  Trash2,
  ChevronDown,
  Clock,
  Sparkles,
  Check,
  ArrowRight,
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api-client"
import { queryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { APPLICATION_STAGE, getOrderedStages, getStatusColorClasses, type StatusColor } from "@/lib/status-config"
import { useDeleteApplicationMutation, useUpdateApplicationMutation } from "@/hooks/queries"

// Helper: format relative time (e.g., "2 days ago", "just now")
function formatRelativeTime(dateString: string): { text: string; isRecent: boolean } {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return { text: "just now", isRecent: true }
  if (diffMins < 60) return { text: `${diffMins}m ago`, isRecent: true }
  if (diffHours < 24) return { text: `${diffHours}h ago`, isRecent: diffHours < 4 }
  if (diffDays === 1) return { text: "yesterday", isRecent: false }
  if (diffDays < 7) return { text: `${diffDays}d ago`, isRecent: false }
  if (diffDays < 30) return { text: `${Math.floor(diffDays / 7)}w ago`, isRecent: false }
  return { text: date.toLocaleDateString(), isRecent: false }
}

function formatAbsoluteDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

interface Application {
  id: string
  stage: string
  stageUpdatedAt: string
  candidate: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    currentCompany: string | null
  }
}

interface CandidatesPipelineProps {
  jobId: string
  /** Initial applications from server-side rendering */
  initialApplications: Application[]
  userCanMutate: boolean
  /** Candidate ID to highlight (e.g., after adding a new candidate) */
  highlightCandidateId?: string
}

interface JobDetailApplicationsResponse {
  applications: Array<{
    id: string
    stage: string
    stageUpdatedAt: string
    candidate: {
      id: string
      firstName: string
      lastName: string
      email: string | null
      currentCompany: string | null
    }
  }>
}

export function CandidatesPipeline({ jobId, initialApplications, userCanMutate, highlightCandidateId }: CandidatesPipelineProps) {
  const router = useRouter()
  const [updatingId, setUpdatingId] = React.useState<string | null>(null)
  const [unlinkingId, setUnlinkingId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const highlightBannerRef = React.useRef<HTMLDivElement | null>(null)
  const [showHighlightBadge, setShowHighlightBadge] = React.useState(false)
  const updateApplicationMutation = useUpdateApplicationMutation()
  const deleteApplicationMutation = useDeleteApplicationMutation()

  // Single source of truth: the query data
  // Using placeholderData instead of initialData ensures refetches on invalidation
  const { data: applications = initialApplications, isFetching, isLoading } = useQuery({
    queryKey: queryKeys.applications.byJob(jobId),
    queryFn: async () => {
      const response = await api.get<JobDetailApplicationsResponse>(`/api/jobs/${jobId}`)
      return response.applications.map((application) => ({
        id: application.id,
        stage: application.stage,
        stageUpdatedAt: application.stageUpdatedAt,
        candidate: {
          id: application.candidate.id,
          firstName: application.candidate.firstName,
          lastName: application.candidate.lastName,
          email: application.candidate.email,
          currentCompany: application.candidate.currentCompany,
        },
      }))
    },
    placeholderData: initialApplications,
    staleTime: 0, // Always refetch on mount/invalidation
  })

  // Show subtle loading indicator when refetching (not initial load)
  const isRefetching = isFetching && !isLoading

  const highlightedApplication = highlightCandidateId
    ? applications.find((app) => app.candidate.id === highlightCandidateId)
    : null
  const highlightedCandidateName = highlightedApplication
    ? `${highlightedApplication.candidate.firstName} ${highlightedApplication.candidate.lastName}`
    : null
  const highlightedStageLabel = highlightedApplication
    ? APPLICATION_STAGE[highlightedApplication.stage]?.label || highlightedApplication.stage
    : null
  const highlightedApplicationId = highlightedApplication?.id ?? null

  const scrollToHighlightedCandidate = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    if (!highlightCandidateId) return false
    const row = document.querySelector(
      `[data-candidate-id="${highlightCandidateId}"]`
    )
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ behavior, block: "center" })
      return true
    }
    return false
  }, [highlightCandidateId])

  React.useEffect(() => {
    if (!highlightCandidateId || !highlightedApplicationId) return

    let attempts = 0
    let isCancelled = false
    let timer: number | null = null
    const maxAttempts = 15
    const retryDelayMs = 150

    const attemptScroll = () => {
      if (isCancelled) return
      if (scrollToHighlightedCandidate()) {
        return
      }
      if (attempts < maxAttempts) {
        attempts += 1
        timer = window.setTimeout(attemptScroll, retryDelayMs)
      }
    }

    timer = window.setTimeout(attemptScroll, 120)

    return () => {
      isCancelled = true
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [highlightCandidateId, highlightedApplicationId, scrollToHighlightedCandidate])

  React.useEffect(() => {
    if (!highlightCandidateId) return
    const timer = window.setTimeout(() => {
      highlightBannerRef.current?.focus({ preventScroll: true })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [highlightCandidateId])

  React.useEffect(() => {
    if (!highlightCandidateId || !highlightedApplicationId) return
    setShowHighlightBadge(true)
    const timer = window.setTimeout(() => setShowHighlightBadge(false), 4500)
    return () => window.clearTimeout(timer)
  }, [highlightCandidateId, highlightedApplicationId])

  // Clear highlight from URL after brief delay
  React.useEffect(() => {
    if (highlightCandidateId) {
      const timer = setTimeout(() => {
        router.replace(`/jobs/${jobId}`, { scroll: false })
      }, 4500)
      return () => clearTimeout(timer)
    }
  }, [highlightCandidateId, jobId, router])

  const handleStageChange = async (applicationId: string, newStage: string) => {
    setUpdatingId(applicationId)
    setError(null)

    try {
      await updateApplicationMutation.mutateAsync({
        id: applicationId,
        stage: newStage,
      })
      // No local state update needed - query invalidation handles it
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to update stage",
      )
    } finally {
      setUpdatingId(null)
    }
  }

  const handleUnlink = async (applicationId: string, candidateId: string) => {
    setUnlinkingId(applicationId)
    setError(null)

    try {
      await deleteApplicationMutation.mutateAsync({
        id: applicationId,
        candidateId,
        jobId, // Pass jobId for proper cache invalidation
      })
      // No local state update needed - query invalidation handles it
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to remove candidate",
      )
    } finally {
      setUnlinkingId(null)
    }
  }

  const orderedStages = getOrderedStages()

  return (
    <div className="relative">
      {isRefetching && (
        <div
          className="absolute right-0 top-0 p-2"
          role="status"
          aria-live="polite"
          aria-label="Refreshing pipeline"
        >
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      {error && (
        <div
          className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}
      {highlightCandidateId && (
        <div
          ref={highlightBannerRef}
          className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-4 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
          role="status"
          aria-live="polite"
          tabIndex={-1}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
            <Check className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-[180px] flex-1 space-y-1">
            <p className="text-sm font-semibold">Candidate added to pipeline</p>
            <p className="text-sm text-emerald-900/80 dark:text-emerald-200/80">
              {highlightedCandidateName && highlightedStageLabel
                ? `${highlightedCandidateName} is now in ${highlightedStageLabel}.`
                : 'The candidate has been added to this job.'}
              {highlightedApplication ? ' We highlighted them below.' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {highlightedApplication && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => scrollToHighlightedCandidate()}
                className="bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100/70 dark:bg-emerald-950/60 dark:text-emerald-100"
                type="button"
              >
                Jump to highlight
              </Button>
            )}
            {highlightedApplication && (
              <Link
                href={`/candidates/${highlightedApplication.candidate.id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                View candidate
              </Link>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.replace(`/jobs/${jobId}`, { scroll: false })}
              className="text-emerald-700 dark:text-emerald-200"
              type="button"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
      <Table aria-label="Candidates pipeline" aria-busy={isFetching}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Candidate</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead className="w-[180px]">Stage</TableHead>
            <TableHead className="w-[140px]">Last Activity</TableHead>
            {userCanMutate && <TableHead className="w-[60px]"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => {
            const stageConfig = APPLICATION_STAGE[app.stage]
            const color = stageConfig?.color as StatusColor | undefined
            const colorClasses = color ? getStatusColorClasses(color) : null
            const isUpdating = updatingId === app.id
            const isUnlinking = unlinkingId === app.id
            const { text: relativeTime, isRecent } = formatRelativeTime(app.stageUpdatedAt)
            const isHighlighted = highlightCandidateId === app.candidate.id

            return (
              <TableRow
                key={app.id}
                data-testid="candidate-row"
                data-candidate-id={app.candidate.id}
                className={cn(
                  "transition-colors",
                  isHighlighted && "bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-200 dark:ring-emerald-800",
                  !isHighlighted && isRecent && "bg-primary/[0.03] dark:bg-primary/[0.05]"
                )}
              >
                {/* Candidate info - combined name and company */}
                <TableCell>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/candidates/${app.candidate.id}`}
                        className="font-medium hover:underline hover:text-primary transition-colors"
                      >
                        {app.candidate.firstName} {app.candidate.lastName}
                      </Link>
                      {isHighlighted && showHighlightBadge && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          New
                        </span>
                      )}
                    </div>
                    {app.candidate.currentCompany && (
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {app.candidate.currentCompany}
                      </p>
                    )}
                  </div>
                </TableCell>

                {/* Contact */}
                <TableCell className="text-sm text-muted-foreground">
                  {app.candidate.email || (
                    <span className="text-muted-foreground/50">No email</span>
                  )}
                </TableCell>

                {/* Stage - prominent, accessible control */}
                <TableCell>
                  {userCanMutate ? (
                    <StageDropdown
                      currentStage={app.stage}
                      stages={orderedStages}
                      colorClasses={colorClasses}
                      isUpdating={isUpdating}
                      onStageChange={(stage) => handleStageChange(app.id, stage)}
                      candidateName={`${app.candidate.firstName} ${app.candidate.lastName}`}
                    />
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
                        colorClasses
                          ? `${colorClasses.bg} ${colorClasses.text}`
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      )}
                    >
                      {stageConfig?.label || app.stage}
                    </span>
                  )}
                </TableCell>

                {/* Last Activity - relative time with tooltip */}
                <TableCell>
                  <div
                    className="flex items-center gap-1.5 text-sm"
                    title={formatAbsoluteDate(app.stageUpdatedAt)}
                  >
                    {isRecent && (
                      <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
                    )}
                    <Clock className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
                    <span className={cn(
                      "tabular-nums",
                      isRecent ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>
                      {relativeTime}
                    </span>
                  </div>
                </TableCell>

                {/* Actions */}
                {userCanMutate && (
                  <TableCell>
                    <UnlinkDialog
                      candidateName={`${app.candidate.firstName} ${app.candidate.lastName}`}
                      isUnlinking={isUnlinking}
                      onConfirm={() => handleUnlink(app.id, app.candidate.id)}
                    />
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

interface StageDropdownProps {
  currentStage: string
  stages: Array<{ key: string; config: { label: string; color?: string } }>
  colorClasses: { bg: string; text: string } | null
  isUpdating: boolean
  onStageChange: (stage: string) => void
  candidateName: string
}

function StageDropdown({
  currentStage,
  stages,
  colorClasses,
  isUpdating,
  onStageChange,
  candidateName,
}: StageDropdownProps) {
  const currentConfig = APPLICATION_STAGE[currentStage]
  const [justUpdated, setJustUpdated] = React.useState(false)
  const [previousStage, setPreviousStage] = React.useState<string | null>(null)
  const prevStageRef = React.useRef(currentStage)

  // Track stage changes for success feedback
  React.useEffect(() => {
    if (prevStageRef.current !== currentStage && !isUpdating) {
      setPreviousStage(prevStageRef.current)
      setJustUpdated(true)
      const timer = setTimeout(() => {
        setJustUpdated(false)
        setPreviousStage(null)
      }, 2000)
      prevStageRef.current = currentStage
      return () => clearTimeout(timer)
    }
    prevStageRef.current = currentStage
  }, [currentStage, isUpdating])

  // Updating state with clear feedback
  if (isUpdating) {
    return (
      <div
        className="inline-flex flex-col gap-1"
        role="status"
        aria-live="polite"
        aria-label={`Updating stage for ${candidateName}`}
      >
        <span
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium min-w-[120px]",
            "border-2 border-dashed border-primary/30 bg-primary/5",
            colorClasses?.text || "text-zinc-700 dark:text-zinc-300"
          )}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          <span>Updating...</span>
        </span>
      </div>
    )
  }

  // Success state with brief feedback
  if (justUpdated && previousStage) {
    const prevConfig = APPLICATION_STAGE[previousStage]
    return (
      <div
        className="inline-flex flex-col gap-1"
        role="status"
        aria-live="polite"
        aria-label={`Stage updated from ${prevConfig?.label || previousStage} to ${currentConfig?.label || currentStage}`}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium min-w-[120px]",
            "border border-green-300 bg-green-50 text-green-700",
            "dark:border-green-800 dark:bg-green-950/50 dark:text-green-400",
            "animate-in fade-in slide-in-from-left-1 duration-200"
          )}
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="truncate">{currentConfig?.label || currentStage}</span>
        </span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 pl-1">
          <span className="opacity-60">{prevConfig?.label || previousStage}</span>
          <ArrowRight className="h-2.5 w-2.5 opacity-40" aria-hidden="true" />
          <span className="font-medium">{currentConfig?.label || currentStage}</span>
        </span>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="stage-dropdown-trigger"
        aria-label={`Change stage for ${candidateName}, currently ${currentConfig?.label || currentStage}`}
        aria-haspopup="listbox"
        className={cn(
          // Base sizing - larger touch target for accessibility
          "inline-flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold min-w-[120px]",
          // Premium button appearance with subtle border and shadow
          "border border-black/[0.08] shadow-sm",
          "dark:border-white/[0.08]",
          // Transitions
          "transition-all duration-150 cursor-pointer",
          // Hover - elevated appearance
          "hover:shadow-md hover:border-black/[0.12] hover:scale-[1.02]",
          "dark:hover:border-white/[0.15]",
          // Focus - high contrast ring for keyboard users
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          // Active state
          "active:scale-[0.98] active:shadow-sm",
          // Color from stage
          colorClasses
            ? `${colorClasses.bg} ${colorClasses.text}`
            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        )}
      >
        <span className="truncate">{currentConfig?.label || currentStage}</span>
        <ChevronDown
          className="h-4 w-4 opacity-70 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-56 p-1"
        data-testid="stage-dropdown-content"
        role="listbox"
        aria-label="Select pipeline stage"
      >
        <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Move to stage
        </div>
        {stages.map(({ key, config }) => {
          const stageColor = config.color as StatusColor | undefined
          const stageColorClasses = stageColor ? getStatusColorClasses(stageColor) : null
          const isSelected = key === currentStage

          return (
            <DropdownMenuItem
              key={key}
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                if (key !== currentStage) {
                  onStageChange(key)
                }
              }}
              className={cn(
                "flex items-center gap-3 py-2.5 px-2 rounded-md cursor-pointer",
                "transition-colors duration-100",
                isSelected
                  ? "bg-primary/10 font-semibold"
                  : "hover:bg-muted/80"
              )}
            >
              <span
                className={cn(
                  "h-3 w-3 rounded-full ring-1 ring-inset ring-black/10 shrink-0",
                  stageColorClasses?.bg || "bg-zinc-300"
                )}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">{config.label}</span>
              {isSelected && (
                <span className="flex items-center gap-1 text-[10px] text-primary shrink-0">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Current
                </span>
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface UnlinkDialogProps {
  candidateName: string
  isUnlinking: boolean
  onConfirm: () => void
}

function UnlinkDialog({ candidateName, isUnlinking, onConfirm }: UnlinkDialogProps) {
  const [open, setOpen] = React.useState(false)

  const handleConfirm = () => {
    onConfirm()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isUnlinking}
            className="text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label={`Remove ${candidateName} from job`}
            type="button"
          />
        }
      >
        {isUnlinking ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove Candidate from Job</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">
              Remove <strong>{candidateName}</strong> from this job?
            </span>
            <span className="block text-muted-foreground/80">
              The candidate profile will not be deleted and can be added to jobs again later.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose render={<Button variant="outline" type="button" />}>
            Keep Candidate
          </DialogClose>
          <Button variant="destructive" onClick={handleConfirm} type="button">
            Remove from Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
