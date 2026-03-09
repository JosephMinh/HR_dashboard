"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
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
  const [candidates, setCandidates] = React.useState<Candidate[]>([])
  const [isSearching, setIsSearching] = React.useState(false)
  const [isAttaching, setIsAttaching] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  // Debounced search
  React.useEffect(() => {
    if (!open) return

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (search.trim().length < 2) {
      setCandidates([])
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/candidates?search=${encodeURIComponent(search.trim())}`)
        if (!response.ok) throw new Error("Failed to search candidates")
        const data = await response.json()
        setCandidates(data.candidates || [])
      } catch {
        setError("Failed to search candidates")
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [search, open])

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSearch("")
      setCandidates([])
      setError(null)
      setSelectedId(null)
      setIsAttaching(false)
    }
  }, [open])

  const handleAttachCandidate = async (candidateId: string) => {
    setIsAttaching(true)
    setError(null)
    setSelectedId(candidateId)

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, candidateId }),
      })

      if (!response.ok) {
        const data = await response.json()
        if (response.status === 409) {
          setError("This candidate is already attached to this job")
        } else {
          setError(data.error || "Failed to attach candidate")
        }
        setSelectedId(null)
        setIsAttaching(false)
        return
      }

      setOpen(false)
      router.refresh()
    } catch {
      setError("Failed to attach candidate")
      setSelectedId(null)
      setIsAttaching(false)
    }
  }

  const handleCreateNew = () => {
    setOpen(false)
    router.push(`/candidates/new?jobId=${jobId}`)
  }

  const isAlreadyAttached = (candidateId: string) => {
    return existingCandidateIds.includes(candidateId)
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
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Results */}
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            {isSearching ? (
              <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching...
              </div>
            ) : search.trim().length < 2 ? (
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
