"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { FileText, Download, ExternalLink, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ResumeUpload } from "@/components/ui/resume-upload"

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
  const router = useRouter()
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [showUpload, setShowUpload] = React.useState(false)

  const handleView = async () => {
    if (!resumeKey) return
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/upload/resume/${encodeURIComponent(resumeKey)}`)
      if (!response.ok) {
        throw new Error("Failed to get resume URL")
      }
      const data = await response.json()
      window.open(data.downloadUrl, "_blank")
    } catch {
      setError("Failed to open resume")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!resumeKey) return
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/upload/resume/${encodeURIComponent(resumeKey)}`)
      if (!response.ok) {
        throw new Error("Failed to get resume URL")
      }
      const data = await response.json()

      // Create a temporary link to force download
      const link = document.createElement("a")
      link.href = data.downloadUrl
      link.download = resumeName || "resume"
      link.target = "_blank"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch {
      setError("Failed to download resume")
    } finally {
      setIsLoading(false)
    }
  }

  const handleUploadComplete = async (key: string, name: string) => {
    // Update the candidate record with the new resume
    try {
      const response = await fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeKey: key, resumeName: name }),
      })

      if (!response.ok) {
        throw new Error("Failed to update candidate")
      }

      setShowUpload(false)
      router.refresh()
    } catch {
      setError("Failed to save resume to candidate")
    }
  }

  const hasResume = resumeKey && resumeName

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resume</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {showUpload ? (
          <div className="space-y-4">
            <ResumeUpload
              currentResume={hasResume ? { key: resumeKey, name: resumeName } : null}
              onUploadComplete={handleUploadComplete}
              onError={(err) => setError(err)}
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
                disabled={isLoading}
              >
                {isLoading ? (
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
                disabled={isLoading}
              >
                {isLoading ? (
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
