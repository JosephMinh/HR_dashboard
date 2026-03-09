"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Trash2, ChevronDown } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"
import { APPLICATION_STAGE, getOrderedStages, getStatusColorClasses, type StatusColor } from "@/lib/status-config"

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
  applications: Application[]
  userCanMutate: boolean
}

export function CandidatesPipeline({ applications, userCanMutate }: CandidatesPipelineProps) {
  const router = useRouter()
  const [updatingId, setUpdatingId] = React.useState<string | null>(null)
  const [unlinkingId, setUnlinkingId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const handleStageChange = async (applicationId: string, newStage: string) => {
    setUpdatingId(applicationId)
    setError(null)

    try {
      const response = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "Failed to update stage")
        return
      }

      router.refresh()
    } catch {
      setError("Failed to update stage")
    } finally {
      setUpdatingId(null)
    }
  }

  const handleUnlink = async (applicationId: string) => {
    setUnlinkingId(applicationId)
    setError(null)

    try {
      const response = await fetch(`/api/applications/${applicationId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "Failed to remove candidate")
        return
      }

      router.refresh()
    } catch {
      setError("Failed to remove candidate")
    } finally {
      setUnlinkingId(null)
    }
  }

  const orderedStages = getOrderedStages()

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Updated</TableHead>
            {userCanMutate && <TableHead className="w-[50px]"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => {
            const stageConfig = APPLICATION_STAGE[app.stage]
            const color = stageConfig?.color as StatusColor | undefined
            const colorClasses = color ? getStatusColorClasses(color) : null
            const isUpdating = updatingId === app.id
            const isUnlinking = unlinkingId === app.id

            return (
              <TableRow key={app.id}>
                <TableCell>
                  <Link
                    href={`/candidates/${app.candidate.id}`}
                    className="font-medium hover:underline"
                  >
                    {app.candidate.firstName} {app.candidate.lastName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {app.candidate.email || "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {app.candidate.currentCompany || "-"}
                </TableCell>
                <TableCell>
                  {userCanMutate ? (
                    <StageDropdown
                      currentStage={app.stage}
                      stages={orderedStages}
                      colorClasses={colorClasses}
                      isUpdating={isUpdating}
                      onStageChange={(stage) => handleStageChange(app.id, stage)}
                    />
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
                        colorClasses
                          ? `${colorClasses.bg} ${colorClasses.text}`
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      )}
                    >
                      {stageConfig?.label || app.stage}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(app.stageUpdatedAt).toLocaleDateString()}
                </TableCell>
                {userCanMutate && (
                  <TableCell>
                    <UnlinkDialog
                      candidateName={`${app.candidate.firstName} ${app.candidate.lastName}`}
                      isUnlinking={isUnlinking}
                      onConfirm={() => handleUnlink(app.id)}
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
}

function StageDropdown({
  currentStage,
  stages,
  colorClasses,
  isUpdating,
  onStageChange,
}: StageDropdownProps) {
  const [open, setOpen] = React.useState(false)
  const currentConfig = APPLICATION_STAGE[currentStage]

  return (
    <div className="relative">
      <button
        onClick={() => !isUpdating && setOpen(!open)}
        disabled={isUpdating}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors",
          colorClasses
            ? `${colorClasses.bg} ${colorClasses.text}`
            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
          !isUpdating && "hover:opacity-80 cursor-pointer"
        )}
      >
        {isUpdating ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            {currentConfig?.label || currentStage}
            <ChevronDown className="h-3 w-3" />
          </>
        )}
      </button>

      {open && !isUpdating && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-md border bg-popover p-1 shadow-lg">
            {stages.map(({ key, config }) => {
              const stageColor = config.color as StatusColor | undefined
              const stageColorClasses = stageColor ? getStatusColorClasses(stageColor) : null
              const isSelected = key === currentStage

              return (
                <button
                  key={key}
                  onClick={() => {
                    if (key !== currentStage) {
                      onStageChange(key)
                    }
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                    isSelected ? "bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      stageColorClasses?.bg || "bg-zinc-300"
                    )}
                  />
                  {config.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
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
            size="icon-xs"
            disabled={isUnlinking}
            className="text-muted-foreground hover:text-destructive"
          />
        }
      >
        {isUnlinking ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Trash2 className="h-3 w-3" />
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove Candidate</DialogTitle>
          <DialogDescription>
            Remove {candidateName} from this job? The candidate record will not be deleted
            and can be added again later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" onClick={handleConfirm}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
