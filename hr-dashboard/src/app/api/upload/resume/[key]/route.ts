import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateDownloadUrl, isValidResumeKey } from '@/lib/storage'

interface RouteParams {
  params: Promise<{ key: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { key } = await params

  // Validate key format
  if (!key || !isValidResumeKey(key)) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }

  const linkedCandidate = await prisma.candidate.findFirst({
    where: { resumeKey: key },
    select: { id: true },
  })
  if (!linkedCandidate) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
  }

  try {
    const downloadUrl = await generateDownloadUrl(key)

    return NextResponse.json({ downloadUrl })
  } catch (error) {
    console.error('Failed to generate download URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    )
  }
}
