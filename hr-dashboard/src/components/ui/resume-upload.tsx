"use client"

import * as React from "react"
import { Upload, File, X, Loader2, AlertCircle, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const VALID_EXTENSIONS = ["pdf", "doc", "docx", "txt", "rtf"]
const VALID_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/rtf",
]

interface ResumeUploadProps {
  currentResume?: { key: string; name: string } | null
  onUploadComplete: (key: string, name: string) => void
  onError?: (error: string) => void
  disabled?: boolean
}

type UploadState = "idle" | "validating" | "uploading" | "success" | "error"

export function ResumeUpload({
  currentResume,
  onUploadComplete,
  onError,
  disabled = false,
}: ResumeUploadProps) {
  const [state, setState] = React.useState<UploadState>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState(0)
  const [isDragging, setIsDragging] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return "File size exceeds 10MB limit"
    }

    // Check extension
    const extension = file.name.split(".").pop()?.toLowerCase() || ""
    if (!VALID_EXTENSIONS.includes(extension)) {
      return `Invalid file type. Accepted: ${VALID_EXTENSIONS.join(", ")}`
    }

    // Check MIME type (if browser provides it)
    if (file.type && !VALID_MIME_TYPES.includes(file.type)) {
      return `Invalid file type. Accepted: PDF, DOC, DOCX, TXT, RTF`
    }

    return null
  }

  const uploadFile = async (file: File) => {
    setState("validating")
    setError(null)

    // Validate file
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      setState("error")
      onError?.(validationError)
      return
    }

    setState("uploading")
    setProgress(10)

    try {
      // Step 1: Get signed upload URL from our API
      const response = await fetch("/api/upload/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to get upload URL")
      }

      const { key, uploadUrl } = await response.json()
      setProgress(30)

      // Step 2: Upload file directly to storage using signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file to storage")
      }

      setProgress(100)
      setState("success")

      // Notify parent component
      onUploadComplete(key, file.name)

      // Reset to idle after showing success
      setTimeout(() => {
        setState("idle")
        setProgress(0)
      }, 2000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed"
      setError(errorMessage)
      setState("error")
      onError?.(errorMessage)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadFile(file)
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (disabled || state === "uploading") return

    const file = e.dataTransfer.files?.[0]
    if (file) {
      uploadFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled && state !== "uploading") {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleClick = () => {
    if (!disabled && state !== "uploading") {
      fileInputRef.current?.click()
    }
  }

  const clearError = () => {
    setError(null)
    setState("idle")
  }

  // Show current resume info
  if (currentResume && state === "idle") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <File className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1 truncate text-sm">{currentResume.name}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={disabled}
          >
            Replace
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Error display */}
      {state === "error" && error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-destructive/70 hover:text-destructive">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Success display */}
      {state === "success" && (
        <div className="flex items-center gap-2 rounded-lg bg-green-100 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>Upload complete!</span>
        </div>
      )}

      {/* Upload zone */}
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30",
          (disabled || state === "uploading") && "cursor-not-allowed opacity-50"
        )}
      >
        {state === "uploading" ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Uploading... {progress}%</span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {isDragging ? "Drop file here" : "Drag and drop or click to upload"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, DOC, DOCX, TXT, RTF (max 10MB)
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.rtf"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || state === "uploading"}
      />
    </div>
  )
}
