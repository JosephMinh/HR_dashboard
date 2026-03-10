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
  sizeBytes?: number
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

function getAllowedContentTypes(filename: string): string[] {
  const extension = filename.split('.').pop()?.trim().toLowerCase() || ''

  switch (extension) {
    case 'pdf':
      return ['application/pdf']
    case 'doc':
      return ['application/msword', 'application/vnd.ms-word']
    case 'docx':
      return ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    case 'txt':
      return ['text/plain']
    case 'rtf':
      return ['application/rtf', 'text/rtf']
    default:
      return []
  }
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

function isValidSizeBytes(sizeBytes: unknown): sizeBytes is number {
  return typeof sizeBytes === 'number' && Number.isSafeInteger(sizeBytes) && sizeBytes > 0
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

  if (!isValidSizeBytes(body.sizeBytes)) {
    return NextResponse.json({ error: 'Valid file size is required' }, { status: 400 })
  }

  if (body.sizeBytes > MAX_RESUME_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File size exceeds ${MAX_RESUME_SIZE_BYTES / (1024 * 1024)}MB limit` },
      { status: 400 },
    )
  }

  // Validate file type
  if (!isValidResumeType(filename)) {
    return NextResponse.json(
      { error: 'Invalid file type. Accepted: PDF, DOC, DOCX, TXT, RTF' },
      { status: 400 }
    )
  }

  const contentType = getContentType(filename)
  const allowedContentTypes = getAllowedContentTypes(filename)
  if (
    body.contentType &&
    !isGenericBinaryContentType(body.contentType) &&
    allowedContentTypes.length > 0 &&
    !allowedContentTypes.includes(normalizeContentType(body.contentType))
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
      // Log detailed error server-side for debugging, but don't expose to client
      console.error('Resume storage configuration error:', {
        message: error.message,
        missing: getStringList(error.missing ?? error.status?.missing),
        issues: getStringList(error.issues ?? error.status?.issues),
        warnings: getStringList(error.warnings ?? error.status?.warnings),
      })

      // Return generic error to client - don't leak infrastructure details
      return NextResponse.json(
        { error: 'Resume storage is temporarily unavailable' },
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
