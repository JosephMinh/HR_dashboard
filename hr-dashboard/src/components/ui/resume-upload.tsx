"use client"

import * as React from "react"
import { Upload, File, X, Loader2, AlertCircle, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { showErrorToast } from "@/lib/feedback"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const VALID_EXTENSIONS = ["pdf", "doc", "docx", "txt", "rtf"]
const GENERIC_BINARY_MIME_TYPES = ["application/octet-stream", "binary/octet-stream"]
const MIME_TYPE_ALIASES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/msword", "application/vnd.ms-word"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain"],
  rtf: ["application/rtf", "text/rtf"],
}

function normalizeMimeType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() || ""
}

function getAllowedMimeTypes(fileName: string): string[] {
  const extension = fileName.split(".").pop()?.toLowerCase() || ""

  return MIME_TYPE_ALIASES[extension] ?? []
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

interface ResumeUploadProps {
  currentResume?: { key: string; name: string } | null
  onUploadComplete: (key: string, name: string) => void
  onError?: (error: string) => void
  disabled?: boolean
}

type UploadState = "idle" | "validating" | "requesting" | "uploading" | "success" | "error"

export function ResumeUpload({
  currentResume,
  onUploadComplete,
  onError,
  disabled = false,
}: ResumeUploadProps) {
  const [state, setState] = React.useState<UploadState>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [pendingFile, setPendingFile] = React.useState<File | null>(null)
  const [lastFileName, setLastFileName] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const successTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = React.useRef(true)
  const helperTextId = React.useId()

  // Cleanup timeout on unmount and track mounted state
  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
    }
  }, [])

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

    const normalizedMimeType = normalizeMimeType(file.type)
    const allowedMimeTypes = getAllowedMimeTypes(file.name)

    // Browser-provided MIME types are inconsistent across platforms.
    // Accept generic binary uploads and otherwise require a match with the
    // extension-derived type used by the API.
    if (
      normalizedMimeType &&
      !GENERIC_BINARY_MIME_TYPES.includes(normalizedMimeType) &&
      allowedMimeTypes.length > 0 &&
      !allowedMimeTypes.includes(normalizedMimeType)
    ) {
      return `Invalid file type. Accepted: PDF, DOC, DOCX, TXT, RTF`
    }

    return null
  }

  const uploadFile = async (file: File) => {
    setState("validating")
    setError(null)
    setPendingFile(file)
    setLastFileName(file.name)

    // Validate file
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      setState("error")
      setPendingFile(null)
      onError?.(validationError)
      return
    }

    setState("requesting")

    try {
      const detectedContentType = file.type?.trim() || undefined

      // Step 1: Get signed upload URL from our API
      const response = await fetch("/api/upload/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          sizeBytes: file.size,
          ...(detectedContentType ? { contentType: detectedContentType } : {}),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to get upload URL")
      }

      const { key, uploadUrl, contentType: signedContentType } = await response.json()
      setState("uploading")

      // Step 2: Upload file directly to storage using signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": signedContentType,
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file to storage")
      }

      // Guard against setState after unmount
      if (!isMountedRef.current) return

      setState("success")
      setPendingFile(null)

      // Notify parent component
      onUploadComplete(key, file.name)

      // Reset to idle after showing success (with cleanup on unmount)
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
      }
      successTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setState("idle")
          setLastFileName(null)
        }
      }, 2000)
    } catch (err) {
      // Guard against setState after unmount
      if (!isMountedRef.current) return

      const errorMessage = err instanceof Error ? err.message : "Upload failed"
      setError(errorMessage)
      setState("error")
      showErrorToast('upload resume', errorMessage)
      onError?.(errorMessage)
    }
  }

  const isBusy = state === "validating" || state === "requesting" || state === "uploading"

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

    if (disabled || isBusy) return

    const file = e.dataTransfer.files?.[0]
    if (file) {
      uploadFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled && !isBusy) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleClick = () => {
    if (!disabled && !isBusy) {
      fileInputRef.current?.click()
    }
  }

  const clearError = () => {
    setError(null)
    setState("idle")
    setPendingFile(null)
    setLastFileName(null)
  }

  const retryUpload = () => {
    if (pendingFile) {
      uploadFile(pendingFile)
    }
  }

  const activeFileName = pendingFile?.name ?? lastFileName
  const activeFileSize = pendingFile?.size

  const uploadSteps = [
    { key: "validating", title: "Validating file", description: "Checking size and file type." },
    { key: "requesting", title: "Securing upload", description: "Generating a secure upload URL." },
    { key: "uploading", title: "Uploading resume", description: "Transferring file to storage." },
  ] as const

  const stepIndex = uploadSteps.findIndex((step) => step.key === state)
  const stepProgress = stepIndex >= 0 ? ((stepIndex + 1) / uploadSteps.length) * 100 : 0
  const activeStep = stepIndex >= 0 ? uploadSteps[stepIndex] : null

  // Show current resume info
  if (currentResume && state === "idle") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <File className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 truncate text-sm">{currentResume.name}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={disabled}
            aria-label={`Replace resume file ${currentResume.name}`}
            type="button"
          >
            Replace
          </Button>
        </div>
        <p className="text-xs text-muted-foreground" id={helperTextId}>
          Accepted formats: PDF, DOC, DOCX, TXT, RTF. Max size 10MB.
        </p>
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
        <div
          className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-destructive/70 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 rounded"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingFile && (
              <Button type="button" size="sm" variant="outline" onClick={retryUpload}>
                Retry upload
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={handleClick}>
              Choose another file
            </Button>
          </div>
        </div>
      )}

      {/* Success display */}
      {state === "success" && (
        <div
          className="flex items-center gap-2 rounded-lg bg-green-100 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300"
          role="status"
          aria-live="polite"
        >
          <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Upload complete{activeFileName ? `: ${activeFileName}` : "!"}
          </span>
        </div>
      )}

      {/* Upload zone */}
      <div
        role="button"
        tabIndex={disabled || isBusy ? -1 : 0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled && !isBusy) {
            e.preventDefault()
            handleClick()
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        aria-label="Upload resume file"
        aria-disabled={disabled || isBusy}
        aria-busy={isBusy}
        aria-describedby={helperTextId}
        className={cn(
          "relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30",
          (disabled || isBusy) && "cursor-not-allowed opacity-50"
        )}
      >
        {isBusy && activeStep ? (
          <div className="flex w-full max-w-sm flex-col gap-3 text-left" role="status" aria-live="polite">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{activeStep.title}</p>
                <p className="text-xs text-muted-foreground">{activeStep.description}</p>
                {activeFileName && (
                  <p className="text-xs text-muted-foreground">
                    {activeFileName}
                    {activeFileSize ? ` · ${formatBytes(activeFileSize)}` : ""}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Step {stepIndex + 1} of {uploadSteps.length}</span>
                <span>Processing</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${stepProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">
              {isDragging ? "Drop file here" : "Drag and drop or click to upload"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground" id={helperTextId}>
              Accepted: PDF, DOC, DOCX, TXT, RTF | Max size 10MB
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Files upload directly to secure storage. We never change your original document.
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
        disabled={disabled || isBusy}
      />
    </div>
  )
}
