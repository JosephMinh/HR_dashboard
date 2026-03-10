"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  Search,
  UserPlus,
  Loader2,
  AlertCircle,
  Check,
  User,
  Building2,
  Mail,
  ArrowRight,
  X,
} from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { api, ApiError } from "@/lib/api-client"
import { queryKeys, queryCachePolicy } from "@/lib/query-keys"
import { useCreateApplicationMutation } from "@/hooks/queries"

interface Candidate {
  id: string
  firstName: string
  lastName: string
  email: string | null
  currentCompany: string | null
}

interface AddCandidateDialogProps {
  jobId: string
  existingCandidateIds: string[]
}

export function AddCandidateDialog({
  jobId,
  existingCandidateIds,
}: AddCandidateDialogProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [isAttaching, setIsAttaching] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedCandidate, setSelectedCandidate] = React.useState<Candidate | null>(null)
  const [attachedCandidateIds, setAttachedCandidateIds] = React.useState(existingCandidateIds)
  const createApplicationMutation = useCreateApplicationMutation()

  // Debounced search term
  React.useEffect(() => {
    if (!open) return

    const handle = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)

    return () => clearTimeout(handle)
  }, [search, open])

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSearch("")
      setDebouncedSearch("")
      setError(null)
      setSelectedCandidate(null)
      setIsAttaching(false)
    }
  }, [open])

  React.useEffect(() => {
    setAttachedCandidateIds(existingCandidateIds)
  }, [existingCandidateIds])

  const trimmedSearch = debouncedSearch.trim()
  const rawTrimmedSearch = search.trim()
  const shouldSearch = open && trimmedSearch.length >= 2
  const isDebouncing =
    open && rawTrimmedSearch.length >= 2 && debouncedSearch !== search

  const {
    data: candidatesResponse,
    isLoading: isSearching,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.candidates.list({ search: trimmedSearch }),
    queryFn: async () => {
      return api.get<{ candidates: Candidate[] }>(
        `/api/candidates?search=${encodeURIComponent(trimmedSearch)}`
      )
    },
    enabled: shouldSearch,
    staleTime: queryCachePolicy.candidates.list.staleTime,
  })

  const candidates = shouldSearch ? candidatesResponse?.candidates ?? [] : []
  const displayError = error ?? (queryError ? "Failed to search candidates" : null)

  // Handle selecting a candidate (no mutation yet)
  const handleSelectCandidate = (candidate: Candidate) => {
    if (isAlreadyAttached(candidate.id)) return
    setSelectedCandidate(candidate)
    setError(null)
  }

  // Handle the explicit confirm action
  const handleConfirmAttach = async () => {
    if (!selectedCandidate) return

    setIsAttaching(true)
    setError(null)

    try {
      await createApplicationMutation.mutateAsync({
        jobId,
        candidateId: selectedCandidate.id,
      })

      setAttachedCandidateIds((current) =>
        current.includes(selectedCandidate.id)
          ? current
          : [...current, selectedCandidate.id]
      )

      setOpen(false)
    } catch (requestError) {
      if (ApiError.isApiError(requestError) && requestError.status === 409) {
        setError("This candidate is already attached to this job")
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to add candidate to job"
        )
      }
    } finally {
      setIsAttaching(false)
    }
  }

  const handleClearSelection = () => {
    setSelectedCandidate(null)
    setError(null)
  }

  const handleCreateNew = () => {
    setOpen(false)
    router.push(`/candidates/new?jobId=${jobId}`)
  }

  const isAlreadyAttached = (candidateId: string) => {
    return attachedCandidateIds.includes(candidateId)
  }

  const availableCandidatesCount = candidates.filter(
    (c) => !isAlreadyAttached(c.id)
  ).length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" type="button" />}>
        <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
        Add Candidate
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Candidate to Job</DialogTitle>
          <DialogDescription>
            Search for an existing candidate, then confirm to add them to the pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error Message */}
          {displayError && (
            <div
              className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{displayError}</span>
              <button
                onClick={() => setError(null)}
                type="button"
                className="text-destructive/70 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 rounded"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Selected Candidate Preview */}
          {selectedCandidate && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {selectedCandidate.firstName} {selectedCandidate.lastName}
                    </p>
                    {selectedCandidate.email && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" aria-hidden="true" />
                        {selectedCandidate.email}
                      </p>
                    )}
                    {selectedCandidate.currentCompany && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3 w-3" aria-hidden="true" />
                        {selectedCandidate.currentCompany}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleClearSelection}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Clear selection"
                  type="button"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-background/80 px-3 py-2 text-sm">
                <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="text-muted-foreground">
                  Will be added to the pipeline at{" "}
                  <span className="font-medium text-foreground">New</span> stage
                </span>
              </div>
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setError(null)
              }}
              className="pl-10"
              autoFocus={!selectedCandidate}
              aria-label="Search candidates by name or email"
              type="search"
            />
          </div>

          {/* Results List */}
          <div
            className="max-h-56 overflow-y-auto rounded-lg border bg-muted/20"
            aria-live="polite"
            aria-busy={isSearching || isDebouncing}
            aria-label="Candidate search results"
          >
            {isSearching || isDebouncing ? (
              <div className="flex items-center justify-center p-6 text-sm text-muted-foreground" role="status">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Searching candidates...
              </div>
            ) : rawTrimmedSearch.length < 2 ? (
              <div className="p-6 text-center">
                <Search className="mx-auto h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-muted-foreground">
                  Search for candidates
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Type at least 2 characters to search
                </p>
              </div>
            ) : candidates.length === 0 ? (
              <div className="p-6 text-center">
                <User className="mx-auto h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-muted-foreground">
                  No candidates found
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Try a different search or create a new candidate
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {availableCandidatesCount === 0 && (
                  <div className="bg-amber-50/50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                    All matching candidates are already added to this job
                  </div>
                )}
                {candidates.map((candidate) => {
                  const attached = isAlreadyAttached(candidate.id)
                  const isSelected = selectedCandidate?.id === candidate.id

                  return (
                    <button
                      key={candidate.id}
                      onClick={() => handleSelectCandidate(candidate)}
                      disabled={attached}
                      aria-label={attached ? `${candidate.firstName} ${candidate.lastName} - already added` : `Select ${candidate.firstName} ${candidate.lastName}`}
                      aria-pressed={isSelected}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-all outline-none",
                        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                        attached
                          ? "cursor-not-allowed bg-muted/30 opacity-50"
                          : "hover:bg-muted/50",
                        isSelected &&
                          "bg-primary/10 ring-1 ring-inset ring-primary/30"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "font-medium",
                            isSelected && "text-primary"
                          )}
                        >
                          {candidate.firstName} {candidate.lastName}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {candidate.email || "No email"}
                          {candidate.currentCompany &&
                            ` · ${candidate.currentCompany}`}
                        </div>
                      </div>
                      {attached ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Added
                        </span>
                      ) : isSelected ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Selected
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCreateNew}
            className="text-muted-foreground"
            type="button"
          >
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            Create New Candidate
          </Button>
          <div className="flex gap-2">
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button
              onClick={handleConfirmAttach}
              disabled={!selectedCandidate || isAttaching}
              className="min-w-[120px]"
              type="button"
            >
              {isAttaching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Adding...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Add to Job
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
