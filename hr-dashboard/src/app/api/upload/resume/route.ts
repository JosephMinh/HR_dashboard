import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { AuthorizationError, requireMutate } from '@/lib/permissions'
import {
  generateObjectKey,
  generateUploadUrl,
  getContentType,
  isValidResumeType,
  MAX_RESUME_SIZE_BYTES,
} from '@/lib/storage'

interface UploadRequestBody {
  filename: string
  contentType?: string
}

interface StorageConfigErrorLike extends Error {
  missing?: unknown
  issues?: unknown
  warnings?: unknown
  status?: {
    missing?: unknown
    issues?: unknown
    warnings?: unknown
  }
}

function normalizeContentType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() || ''
}

function isGenericBinaryContentType(contentType: string): boolean {
  const normalized = normalizeContentType(contentType)
  return normalized === 'application/octet-stream' || normalized === 'binary/octet-stream'
}

function isStorageConfigError(error: unknown): error is StorageConfigErrorLike {
  return error instanceof Error && error.name === 'StorageConfigError'
}

function getStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    requireMutate(session.user.role)
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  let body: UploadRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const filename = body.filename?.trim()
  if (!filename) {
    return NextResponse.json({ error: 'Filename is required' }, { status: 400 })
  }

  // Validate file type
  if (!isValidResumeType(filename)) {
    return NextResponse.json(
      { error: 'Invalid file type. Accepted: PDF, DOC, DOCX, TXT, RTF' },
      { status: 400 }
    )
  }

  const contentType = getContentType(filename)
  if (
    body.contentType &&
    !isGenericBinaryContentType(body.contentType) &&
    normalizeContentType(body.contentType) !== normalizeContentType(contentType)
  ) {
    return NextResponse.json(
      { error: 'Content type does not match filename extension' },
      { status: 400 }
    )
  }

  // Generate unique key
  const key = generateObjectKey(filename)

  try {
    const uploadUrl = await generateUploadUrl(key, contentType)

    return NextResponse.json({
      key,
      uploadUrl,
      contentType,
      maxSizeBytes: MAX_RESUME_SIZE_BYTES,
    })
  } catch (error) {
    if (isStorageConfigError(error)) {
      const missing = getStringList(error.missing ?? error.status?.missing)
      const issues = getStringList(error.issues ?? error.status?.issues)
      const warnings = getStringList(error.warnings ?? error.status?.warnings)

      console.error('Resume storage configuration error:', {
        message: error.message,
        missing,
        issues,
        warnings,
      })

      return NextResponse.json(
        {
          error: 'Resume storage is not configured correctly',
          details: error.message,
          missing,
          issues,
          warnings,
        },
        { status: 503 }
      )
    }

    console.error('Failed to generate upload URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}
