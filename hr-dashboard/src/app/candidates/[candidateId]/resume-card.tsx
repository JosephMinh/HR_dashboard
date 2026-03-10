"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  FileText,
  Download,
  ExternalLink,
  Loader2,
  FileUp,
  File,
  FileType2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ResumeUpload } from "@/components/ui/resume-upload"
import { InlineFeedback } from "@/components/ui/inline-feedback"
import { api } from "@/lib/api-client"
import { queryKeys } from "@/lib/query-keys"
import { useUpdateCandidateMutation } from "@/hooks/queries"
import { showSuccessToast, showErrorToast } from "@/lib/feedback"

// Get file extension and type info
function getFileTypeInfo(filename: string | null): {
  extension: string
  label: string
  color: string
} {
  if (!filename) return { extension: '?', label: 'Document', color: 'bg-muted text-muted-foreground' }

  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  switch (ext) {
    case 'pdf':
      return { extension: 'PDF', label: 'PDF Document', color: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400' }
    case 'doc':
    case 'docx':
      return { extension: 'DOC', label: 'Word Document', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400' }
    case 'txt':
      return { extension: 'TXT', label: 'Text File', color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' }
    case 'rtf':
      return { extension: 'RTF', label: 'Rich Text', color: 'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400' }
    default:
      return { extension: ext.toUpperCase().slice(0, 3), label: 'Document', color: 'bg-muted text-muted-foreground' }
  }
}

interface ResumeCardProps {
  candidateId: string
  resumeKey: string | null
  resumeName: string | null
  userCanMutate: boolean
}

export function ResumeCard({
  candidateId,
  resumeKey,
  resumeName,
  userCanMutate,
}: ResumeCardProps) {
  const [isViewing, setIsViewing] = React.useState(false)
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [viewError, setViewError] = React.useState<string | null>(null)
  const [downloadError, setDownloadError] = React.useState<string | null>(null)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [showUpload, setShowUpload] = React.useState(false)
  const [localResumeKey, setLocalResumeKey] = React.useState(resumeKey)
  const [localResumeName, setLocalResumeName] = React.useState(resumeName)
  const [lastSuccessAction, setLastSuccessAction] = React.useState<'view' | 'download' | 'save' | null>(null)
  const successTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = React.useRef(true)
  const updateCandidateMutation = useUpdateCandidateMutation()

  // Clear success state after brief display
  const clearSuccessState = React.useCallback(() => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current)
    }
    setLastSuccessAction(null)
  }, [])

  // Track mounted state to prevent setState after unmount
  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Auto-clear success indicator after 2 seconds
  React.useEffect(() => {
    if (lastSuccessAction) {
      successTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setLastSuccessAction(null)
        }
      }, 2000)
    }
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [lastSuccessAction])

  React.useEffect(() => {
    setLocalResumeKey(resumeKey)
    setLocalResumeName(resumeName)
    setViewError(null)
    setDownloadError(null)
  }, [resumeKey, resumeName])

  // Use on-demand fetching pattern for resume URLs (via refetch)
  // This avoids automatic requests - user explicitly triggers download/view
  const resumeUrlQuery = useQuery({
    queryKey: queryKeys.candidates.resume(localResumeKey ?? '__no_resume__'),
    queryFn: async () => {
      if (!localResumeKey) {
        throw new Error("Resume key is required")
      }
      return api.get<{ downloadUrl: string }>(
        `/api/upload/resume/${encodeURIComponent(localResumeKey)}`
      )
    },
    enabled: false, // Manual fetch only via refetch()
    staleTime: 0, // Always fetch fresh URL (signed URLs expire)
  })

  const fetchResumeUrl = async () => {
    const result = await resumeUrlQuery.refetch()
    if (result.error || !result.data?.downloadUrl) {
      throw result.error ?? new Error("Failed to get resume URL")
    }
    return result.data.downloadUrl
  }

  const handleView = async () => {
    if (!localResumeKey) return
    setIsViewing(true)
    setViewError(null)
    clearSuccessState()

    try {
      const downloadUrl = await fetchResumeUrl()
      window.open(downloadUrl, "_blank")
      // Brief visual confirmation that action completed
      if (isMountedRef.current) {
        setLastSuccessAction('view')
      }
    } catch (requestError) {
      if (isMountedRef.current) {
        const errorMessage = requestError instanceof Error
          ? requestError.message
          : "Failed to open resume"
        setViewError(errorMessage)
        showErrorToast('open resume', errorMessage)
      }
    } finally {
      if (isMountedRef.current) {
        setIsViewing(false)
      }
    }
  }

  const handleDownload = async () => {
    if (!localResumeKey) return
    setIsDownloading(true)
    setDownloadError(null)
    clearSuccessState()

    try {
      const downloadUrl = await fetchResumeUrl()
      // Create a temporary link to force download
      const link = document.createElement("a")
      link.href = downloadUrl
      link.download = localResumeName || "resume"
      link.target = "_blank"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      // Show success confirmation
      if (isMountedRef.current) {
        setLastSuccessAction('download')
      }
    } catch (requestError) {
      if (isMountedRef.current) {
        const errorMessage = requestError instanceof Error
          ? requestError.message
          : "Failed to download resume"
        setDownloadError(errorMessage)
        showErrorToast('download resume', errorMessage)
      }
    } finally {
      if (isMountedRef.current) {
        setIsDownloading(false)
      }
    }
  }

  const handleUploadComplete = async (key: string, name: string) => {
    setIsSaving(true)
    setSaveError(null)
    clearSuccessState()

    try {
      const updated = await updateCandidateMutation.mutateAsync({
        id: candidateId,
        resumeKey: key,
        resumeName: name,
      })

      if (isMountedRef.current) {
        setLocalResumeKey(updated.resumeKey ?? key)
        setLocalResumeName(updated.resumeName ?? name)
        setShowUpload(false)
        setLastSuccessAction('save')
        showSuccessToast('saved', 'resume', name)
      }
    } catch (requestError) {
      if (isMountedRef.current) {
        const errorMessage = requestError instanceof Error
          ? requestError.message
          : "Failed to save resume to candidate"
        setSaveError(errorMessage)
        showErrorToast('save resume', errorMessage)
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false)
      }
    }
  }

  const hasResume = localResumeKey && localResumeName
  const isActionDisabled = isViewing || isDownloading || isSaving
  const fileInfo = getFileTypeInfo(localResumeName)

  // Consolidate errors for cleaner display
  const activeError = viewError || downloadError || saveError
  const errorContext = viewError ? 'viewing' : downloadError ? 'downloading' : 'saving'

  return (
    <Card className="overflow-hidden border-border/50 shadow-lg shadow-black/5 dark:shadow-black/20">
      <CardHeader className="border-b border-border/50 bg-muted/30 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <FileType2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Documents
          </CardTitle>
          {hasResume && (
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${fileInfo.color}`}>
              {fileInfo.extension}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {/* Success feedback */}
        {lastSuccessAction && !activeError && (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-400"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {lastSuccessAction === 'view' && 'Opened in new tab'}
              {lastSuccessAction === 'download' && 'Download started'}
              {lastSuccessAction === 'save' && 'Resume saved successfully'}
            </span>
          </div>
        )}

        {/* Error feedback with retry */}
        {activeError && (
          <InlineFeedback
            variant="error"
            title={`${errorContext.charAt(0).toUpperCase() + errorContext.slice(1)} failed`}
            message={activeError}
            className="mb-4"
            onRetry={
              errorContext === 'viewing' ? handleView :
              errorContext === 'downloading' ? handleDownload :
              undefined
            }
            onDismiss={() => {
              setViewError(null)
              setDownloadError(null)
              setSaveError(null)
            }}
          />
        )}

        {showUpload ? (
          <div className="space-y-4">
            <ResumeUpload
              currentResume={
                hasResume ? { key: localResumeKey, name: localResumeName } : null
              }
              onUploadComplete={handleUploadComplete}
              onError={(err) => setSaveError(err)}
              disabled={isSaving}
            />
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUpload(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : hasResume ? (
          <div className="space-y-4">
            {/* Document preview area */}
            <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 to-muted/50 p-4 transition-colors hover:border-border">
              <div className="flex items-start gap-4">
                {/* File type icon */}
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${fileInfo.color}`}>
                  <FileText className="h-6 w-6" aria-hidden="true" />
                </div>

                {/* File info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground" title={localResumeName ?? ''}>
                    {localResumeName}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {fileInfo.label}
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons - cleaner grouping */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleView}
                  disabled={isActionDisabled}
                  className="gap-1.5"
                  type="button"
                  aria-label={localResumeName ? `View resume ${localResumeName}` : 'View resume'}
                >
                  {isViewing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={isActionDisabled}
                  className="gap-1.5"
                  type="button"
                  aria-label={localResumeName ? `Download resume ${localResumeName}` : 'Download resume'}
                >
                  {isDownloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Download
                </Button>
              </div>
              {userCanMutate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUpload(true)}
                  disabled={isActionDisabled}
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  type="button"
                  aria-label="Replace resume"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Replace
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Premium empty state */
          <div className="relative overflow-hidden rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
            {/* Decorative background */}
            <div
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{
                backgroundImage: `
                  radial-gradient(circle at 30% 20%, rgba(59, 130, 246, 0.05), transparent 50%),
                  radial-gradient(circle at 70% 80%, rgba(139, 92, 246, 0.05), transparent 50%)
                `,
              }}
              aria-hidden="true"
            />

            <div className="relative">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50 ring-1 ring-border">
                <File className="h-7 w-7 text-muted-foreground/60" aria-hidden="true" />
              </div>
              <h3 className="font-medium text-foreground">No resume on file</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload a resume to keep candidate documents organized
              </p>
              {userCanMutate && (
                <Button
                  variant="default"
                  size="sm"
                  className="mt-4 gap-1.5"
                  onClick={() => setShowUpload(true)}
                  disabled={isActionDisabled}
                  type="button"
                >
                  <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                  Upload Resume
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
