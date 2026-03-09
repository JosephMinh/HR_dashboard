import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generateDownloadUrl } from '@/lib/storage'

interface RouteParams {
  params: Promise<{ key: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { key } = await params

  // Validate key format (basic check)
  if (!key || !key.startsWith('resumes/')) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
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
