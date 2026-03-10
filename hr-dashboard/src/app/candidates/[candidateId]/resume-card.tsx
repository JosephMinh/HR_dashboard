"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { FileText, Download, ExternalLink, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ResumeUpload } from "@/components/ui/resume-upload"
import { api } from "@/lib/api-client"
import { queryKeys } from "@/lib/query-keys"
import { useUpdateCandidateMutation } from "@/hooks/queries"

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
  const updateCandidateMutation = useUpdateCandidateMutation()

  React.useEffect(() => {
    setLocalResumeKey(resumeKey)
    setLocalResumeName(resumeName)
    setViewError(null)
    setDownloadError(null)
  }, [resumeKey, resumeName])

  const resumeUrlQuery = useQuery({
    queryKey: queryKeys.candidates.resume(localResumeKey ?? ""),
    queryFn: async () => {
      if (!localResumeKey) {
        throw new Error("Resume key is required")
      }
      return api.get<{ downloadUrl: string }>(
        `/api/upload/resume/${encodeURIComponent(localResumeKey)}`
      )
    },
    enabled: false,
    staleTime: 0,
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

    try {
      const downloadUrl = await fetchResumeUrl()
      window.open(downloadUrl, "_blank")
    } catch (requestError) {
      setViewError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to open resume"
      )
    } finally {
      setIsViewing(false)
    }
  }

  const handleDownload = async () => {
    if (!localResumeKey) return
    setIsDownloading(true)
    setDownloadError(null)

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
    } catch (requestError) {
      setDownloadError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to download resume"
      )
    } finally {
      setIsDownloading(false)
    }
  }

  const handleUploadComplete = async (key: string, name: string) => {
    setIsSaving(true)
    setSaveError(null)

    try {
      const updated = await updateCandidateMutation.mutateAsync({
        id: candidateId,
        resumeKey: key,
        resumeName: name,
      })

      setLocalResumeKey(updated.resumeKey ?? key)
      setLocalResumeName(updated.resumeName ?? name)
      setShowUpload(false)
    } catch (requestError) {
      setSaveError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to save resume to candidate"
      )
    } finally {
      setIsSaving(false)
    }
  }

  const hasResume = localResumeKey && localResumeName
  const isActionDisabled = isViewing || isDownloading || isSaving

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resume</CardTitle>
      </CardHeader>
      <CardContent>
        {viewError && (
          <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            View failed: {viewError}
          </div>
        )}
        {downloadError && (
          <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Download failed: {downloadError}
          </div>
        )}
        {saveError && (
          <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Save failed: {saveError}
          </div>
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
            <Button variant="outline" size="sm" onClick={() => setShowUpload(false)}>
              Cancel
            </Button>
          </div>
        ) : hasResume ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 truncate text-sm font-medium">{resumeName}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleView}
                disabled={isActionDisabled}
              >
                {isViewing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={isActionDisabled}
              >
                {isDownloading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download
              </Button>
              {userCanMutate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUpload(true)}
                  disabled={isActionDisabled}
                >
                  Replace
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No resume uploaded</p>
            {userCanMutate && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setShowUpload(true)}
                disabled={isActionDisabled}
              >
                Upload Resume
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
