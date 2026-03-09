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

  if (!body.filename) {
    return NextResponse.json({ error: 'Filename is required' }, { status: 400 })
  }

  // Validate file type
  if (!isValidResumeType(body.filename)) {
    return NextResponse.json(
      { error: 'Invalid file type. Accepted: PDF, DOC, DOCX, TXT, RTF' },
      { status: 400 }
    )
  }

  // Generate unique key
  const key = generateObjectKey(body.filename)
  const contentType = body.contentType || getContentType(body.filename)

  try {
    const uploadUrl = await generateUploadUrl(key, contentType)

    return NextResponse.json({
      key,
      uploadUrl,
      contentType,
      maxSizeBytes: MAX_RESUME_SIZE_BYTES,
    })
  } catch (error) {
    console.error('Failed to generate upload URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}
