"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Search, UserPlus, Loader2, AlertCircle, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ApiError } from "@/lib/api-client"
import { queryKeys } from "@/lib/query-keys"
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
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
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
      setSelectedId(null)
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
      const response = await fetch(
        `/api/candidates?search=${encodeURIComponent(trimmedSearch)}`,
      )
      if (!response.ok) throw new Error("Failed to search candidates")
      return response.json() as Promise<{ candidates: Candidate[] }>
    },
    enabled: shouldSearch,
    staleTime: 0,
  })

  const candidates = shouldSearch ? candidatesResponse?.candidates ?? [] : []
  const displayError = error ?? (queryError ? "Failed to search candidates" : null)

  const handleAttachCandidate = async (candidateId: string) => {
    setIsAttaching(true)
    setError(null)
    setSelectedId(candidateId)

    try {
      await createApplicationMutation.mutateAsync({ jobId, candidateId })

      setAttachedCandidateIds((current) =>
        current.includes(candidateId) ? current : [...current, candidateId]
      )

      setOpen(false)
      setSelectedId(null)
    } catch (requestError) {
      if (ApiError.isApiError(requestError) && requestError.status === 409) {
        setError("This candidate is already attached to this job")
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to attach candidate"
        )
      }
      setSelectedId(null)
    } finally {
      setIsAttaching(false)
    }
  }

  const handleCreateNew = () => {
    setOpen(false)
    router.push(`/candidates/new?jobId=${jobId}`)
  }

  const isAlreadyAttached = (candidateId: string) => {
    return attachedCandidateIds.includes(candidateId)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UserPlus className="h-4 w-4 mr-2" />
        Add Candidate
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Candidate</DialogTitle>
          <DialogDescription>
            Search for an existing candidate or create a new one to add to this job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setError(null)
              }}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Error Message */}
          {displayError && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {displayError}
            </div>
          )}

          {/* Results */}
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            {isSearching || isDebouncing ? (
              <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </div>
            ) : rawTrimmedSearch.length < 2 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search
              </div>
            ) : candidates.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No candidates found
              </div>
            ) : (
              <div className="divide-y">
                {candidates.map((candidate) => {
                  const attached = isAlreadyAttached(candidate.id)
                  const isSelected = selectedId === candidate.id

                  return (
                    <button
                      key={candidate.id}
                      onClick={() => !attached && !isAttaching && handleAttachCandidate(candidate.id)}
                      disabled={attached || isAttaching}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 p-3 text-left transition-colors",
                        attached
                          ? "cursor-not-allowed bg-muted/50 opacity-60"
                          : "hover:bg-muted/50",
                        isSelected && isAttaching && "bg-muted"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {candidate.firstName} {candidate.lastName}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {candidate.email || "No email"}
                          {candidate.currentCompany && ` - ${candidate.currentCompany}`}
                        </div>
                      </div>
                      {attached ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Check className="h-3 w-3" />
                          Already added
                        </span>
                      ) : isSelected && isAttaching ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCreateNew}>
            <UserPlus className="mr-2 h-4 w-4" />
            Create New Candidate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
